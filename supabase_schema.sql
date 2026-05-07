-- 1. PROFILES (Linked to auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  role TEXT CHECK (role IN ('student', 'tutor', 'admin')) DEFAULT 'student',
  wallet_balance DECIMAL(12, 2) DEFAULT 0.00,
  referral_count INT DEFAULT 0,
  bio TEXT,
  subjects TEXT[], -- Array of strings
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- 2. LESSON REQUESTS
CREATE TABLE lesson_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id) NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  budget_min DECIMAL(12, 2),
  budget_max DECIMAL(12, 2),
  scheduled_date DATE,
  status TEXT CHECK (status IN ('open', 'matched', 'accepted', 'completed', 'cancelled', 'expired')) DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE lesson_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view open requests" ON lesson_requests
  FOR SELECT USING (status = 'open' OR auth.uid() = student_id);

CREATE POLICY "Students can create requests" ON lesson_requests
  FOR INSERT WITH CHECK (auth.uid() = student_id);

-- 3. BIDS
CREATE TABLE bids (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID REFERENCES lesson_requests(id) ON DELETE CASCADE NOT NULL,
  tutor_id UUID REFERENCES profiles(id) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  message TEXT,
  status TEXT CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE bids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tutors can see bids they placed" ON bids
  FOR SELECT USING (auth.uid() = tutor_id OR EXISTS (
    SELECT 1 FROM lesson_requests WHERE id = request_id AND student_id = auth.uid()
  ));

-- 4. LESSONS (Escrowed)
CREATE TABLE lessons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id) NOT NULL,
  tutor_id UUID REFERENCES profiles(id) NOT NULL,
  bid_id UUID REFERENCES bids(id),
  amount DECIMAL(12, 2) NOT NULL,
  status TEXT CHECK (status IN ('paid_escrow', 'in_progress', 'completed', 'disputed', 'refunded', 'cancelled')) DEFAULT 'paid_escrow',
  meeting_link TEXT,
  meeting_type TEXT,
  -- Completion fields
  final_payout DECIMAL(12, 2),
  commission DECIMAL(12, 2),
  -- Cancellation fields
  cancelled_by UUID REFERENCES profiles(id),
  cancel_reason TEXT,
  -- Dispute fields
  dispute_reason TEXT,
  dispute_details TEXT,
  disputed_at TIMESTAMPTZ,
  -- Timestamps
  is_past_due BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 5. TRANSACTIONS
CREATE TABLE transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  lesson_id UUID REFERENCES lessons(id),
  amount DECIMAL(12, 2) NOT NULL,
  type TEXT CHECK (type IN (
    'top_up', 'lesson_payment', 'tutor_payout', 'referral_reward',
    'refund', 'request_fee', 'bid_fee', 'escrow_hold', 'platform_fee'
  )),
  status TEXT DEFAULT 'completed',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 6. NOTIFICATIONS
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 7. MESSAGES (for real-time chat)
CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES profiles(id) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages for their lessons" ON messages
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM lessons WHERE id = lesson_id AND (student_id = auth.uid() OR tutor_id = auth.uid())
  ));

CREATE POLICY "Users can send messages to their lessons" ON messages
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM lessons WHERE id = lesson_id AND (student_id = auth.uid() OR tutor_id = auth.uid())
  ) AND auth.uid() = sender_id);

-- 8. SQL FUNCTION FOR WALLET TRANSACTIONS (Atomicity)
-- This replaces the Firebase Transactions
CREATE OR REPLACE FUNCTION accept_bid_and_pay(
  p_bid_id UUID,
  p_student_id UUID
) RETURNS VOID AS $$
DECLARE
  v_amount DECIMAL;
  v_tutor_id UUID;
  v_request_id UUID;
  v_current_balance DECIMAL;
BEGIN
  -- 1. Get bid info
  SELECT amount, tutor_id, request_id INTO v_amount, v_tutor_id, v_request_id
  FROM bids WHERE id = p_bid_id;

  -- 2. Check balance
  SELECT wallet_balance INTO v_current_balance FROM profiles WHERE id = p_student_id;
  IF v_current_balance < v_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- 3. Deduct from student
  UPDATE profiles SET wallet_balance = wallet_balance - v_amount WHERE id = p_student_id;

  -- 4. Create Lesson
  INSERT INTO lessons (student_id, tutor_id, bid_id, amount, status)
  VALUES (p_student_id, v_tutor_id, p_bid_id, v_amount, 'paid_escrow');

  -- 5. Update Bid/Request Status
  UPDATE bids SET status = 'accepted' WHERE id = p_bid_id;
  UPDATE lesson_requests SET status = 'accepted' WHERE id = v_request_id;
  UPDATE bids SET status = 'expired' WHERE request_id = v_request_id AND id != p_bid_id;

  -- 6. Log transaction
  INSERT INTO transactions (user_id, amount, type, description)
  VALUES (p_student_id, -v_amount, 'lesson_payment', 'Payment for lesson bid');

END;
$$ LANGUAGE plpgsql;

-- 9. SQL FUNCTION TO POST REQUEST AND CHARGE FEE
CREATE OR REPLACE FUNCTION post_request_and_pay_fee(
  p_student_id UUID,
  p_subject TEXT,
  p_description TEXT,
  p_budget_min DECIMAL,
  p_budget_max DECIMAL,
  p_scheduled_date DATE,
  p_fee DECIMAL
) RETURNS VOID AS $$
DECLARE
  v_current_balance DECIMAL;
BEGIN
  -- 1. Check balance
  SELECT wallet_balance INTO v_current_balance FROM profiles WHERE id = p_student_id;
  IF v_current_balance < p_fee THEN
    RAISE EXCEPTION 'Insufficient balance to post a request. Please top up your wallet.';
  END IF;

  -- 2. Deduct from student
  UPDATE profiles SET wallet_balance = wallet_balance - p_fee WHERE id = p_student_id;

  -- 3. Create Lesson Request
  INSERT INTO lesson_requests (student_id, subject, description, budget_min, budget_max, scheduled_date, status)
  VALUES (p_student_id, p_subject, p_description, p_budget_min, p_budget_max, p_scheduled_date, 'open');

  -- 4. Log transaction
  INSERT INTO transactions (user_id, amount, type, description)
  VALUES (p_student_id, -p_fee, 'request_fee', 'Fee for posting a lesson request');

END;
$$ LANGUAGE plpgsql;

-- 10. ATOMIC WALLET HELPERS (prevent race conditions on concurrent updates)
CREATE OR REPLACE FUNCTION add_wallet_balance(p_user_id UUID, p_amount DECIMAL)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles SET wallet_balance = wallet_balance + p_amount WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION deduct_wallet_balance(p_user_id UUID, p_amount DECIMAL)
RETURNS VOID AS $$
DECLARE
  v_current DECIMAL;
BEGIN
  SELECT wallet_balance INTO v_current FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_current < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;
  UPDATE profiles SET wallet_balance = wallet_balance - p_amount WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. PAYMENT ATTEMPTS (for Paynow tracking)
CREATE TABLE payment_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT CHECK (type IN ('bid', 'top_up')) NOT NULL,
  bid_id UUID REFERENCES bids(id),
  student_id UUID REFERENCES profiles(id),
  user_id UUID REFERENCES profiles(id),
  amount DECIMAL(12, 2) NOT NULL,
  poll_url TEXT,
  paynow_reference TEXT,
  status TEXT DEFAULT 'sent',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Payment attempts are unviewable publicly" ON payment_attempts FOR ALL USING (false);

-- 11. ADMIN LEDGERS
CREATE TABLE admin_ledgers (
  id TEXT PRIMARY KEY,
  balance DECIMAL(12, 2) DEFAULT 0.00,
  total_revenue DECIMAL(12, 2) DEFAULT 0.00,
  pending_lessons INT DEFAULT 0,
  completed_lessons INT DEFAULT 0,
  disputed_lessons INT DEFAULT 0,
  refunded_lessons INT DEFAULT 0,
  last_settlement_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE admin_ledgers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin ledgers are unviewable publicly" ON admin_ledgers FOR ALL USING (false);

-- Insert default ledgers
INSERT INTO admin_ledgers (id) VALUES ('revenue'), ('marketing'), ('stats') ON CONFLICT DO NOTHING;

-- 12. REVIEWS
CREATE TABLE reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID REFERENCES lessons(id) UNIQUE,
  tutor_id UUID REFERENCES profiles(id) NOT NULL,
  student_id UUID REFERENCES profiles(id) NOT NULL,
  rating INT CHECK (rating >= 1 AND rating <= 5) NOT NULL,
  review_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reviews are viewable by everyone." ON reviews FOR SELECT USING (true);
CREATE POLICY "Students can insert reviews for their lessons." ON reviews FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Students can update their own reviews." ON reviews FOR UPDATE USING (auth.uid() = student_id);

-- Note: In Supabase dashboard, you must manually create a storage bucket named 'chat_attachments'
-- and set it to Public, then enable RLS on storage.objects allowing inserts from authenticated users.
