import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { Paynow } from "paynow";
import dotenv from "dotenv";

dotenv.config();

const logFile = path.join(process.cwd(), "server.log");
function log(msg: string) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `[${timestamp}] ${msg}\n`);
}
import cron from "node-cron";

// Initialize Supabase Admin Client (service_role bypasses RLS)
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  log("FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
  process.exit(1);
}

const db = createClient(supabaseUrl, supabaseServiceKey);

async function bootstrap() {
  try {
    log("Bootstrapping Supabase connection...");
    // Verify connection by reading profiles table
    const { error } = await db.from('profiles').select('id').limit(1);
    if (error) throw error;
    log("Bootstrap successful – Supabase connected.");
  } catch (error: any) {
    log(`Bootstrap error: ${error.message}`);
  }
}

// Initialise Paynow — resultUrl and returnUrl MUST be set as properties;
// the 3rd/4th constructor args are silently ignored by the SDK.
const paynow = new Paynow(
  process.env.PAYNOW_INTEGRATION_ID || "1234",
  process.env.PAYNOW_INTEGRATION_KEY || "key"
);
paynow.resultUrl = process.env.PAYNOW_RESULT_URL || `${process.env.APP_URL}/api/payments/paynow-webhook`;
paynow.returnUrl = process.env.PAYNOW_RETURN_URL || `${process.env.APP_URL}/dashboard`;

if (!process.env.PAYNOW_INTEGRATION_ID || process.env.PAYNOW_INTEGRATION_ID === "1234") {
  log("WARNING: Paynow is running in DEMO mode with placeholder keys. Set PAYNOW_INTEGRATION_ID and PAYNOW_INTEGRATION_KEY for live payments.");
}

async function executeBidAcceptance(studentId: string, bidId: string, isPaidDirectly: boolean = false) {
  log(`Executing Bid Acceptance: Bid ${bidId}, Student ${studentId}, PaidDirectly: ${isPaidDirectly}`);

  try {
    // 1. Fetch bid
    const { data: bidData, error: bidErr } = await db.from('bids').select('*').eq('id', bidId).single();
    if (bidErr || !bidData) throw new Error("Bid not found");
    if (bidData.status === 'accepted') throw new Error("Bid already accepted");

    // 2. For wallet payments, use the atomic Supabase RPC
    if (!isPaidDirectly) {
      const { error: rpcErr } = await db.rpc('accept_bid_and_pay', {
        p_bid_id: bidId,
        p_student_id: studentId
      });
      if (rpcErr) throw new Error(rpcErr.message);
      log(`Bid ${bidId} accepted via wallet RPC for student ${studentId}`);
    } else {
      // 3. For direct Paynow payments, do sequential updates (already paid)
      // Update bid & request status
      await db.from('bids').update({ status: 'accepted' }).eq('id', bidId);
      await db.from('lesson_requests').update({ status: 'accepted' }).eq('id', bidData.request_id);
      // Expire other bids
      await db.from('bids').update({ status: 'expired' }).eq('request_id', bidData.request_id).neq('id', bidId);

      // Create lesson
      const { error: lessonErr } = await db.from('lessons').insert({
        student_id: studentId,
        tutor_id: bidData.tutor_id,
        bid_id: bidId,
        amount: bidData.amount,
        status: 'paid_escrow'
      });
      if (lessonErr) throw new Error(lessonErr.message);

      // Log transaction
      await db.from('transactions').insert({
        user_id: studentId,
        amount: -bidData.amount,
        type: 'lesson_payment',
        description: 'Payment for lesson via Paynow'
      });
      log(`Bid ${bidId} accepted via Paynow for student ${studentId}`);
    }

    // 4. Notify tutor
    await db.from('notifications').insert({
      user_id: bidData.tutor_id,
      title: 'Bid Accepted!',
      message: `Your bid was accepted. You can now start the lesson.`,
      is_read: false
    });

    log(`Bid acceptance completed successfully for bid ${bidId}`);
  } catch (error: any) {
    log(`ERROR in executeBidAcceptance for bid ${bidId}: ${error.message}`);
    throw error;
  }
}

async function startServer() {
  log("Starting server...");
  await bootstrap();
  const app = express();
  app.set("trust proxy", 1);
  const httpServer = createServer(app);
  log("HTTP server created");
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  log("Socket.io initialized");

  const PORT = 3000;

  // Security: Rate Limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: "Too many requests, please try again later." }
  });
  app.use("/api/", limiter);

  // Socket.io logic with basic room validation
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (token) {
      try {
        const { data: { user }, error } = await db.auth.getUser(token);
        if (error || !user) {
          log(`Socket connection rejected: Invalid token - ${error?.message}`);
          return next(new Error("Authentication error"));
        }
        
        socket.data.user = user;
        log(`Socket connection authorized for user: ${user.id}`);
        next();
      } catch (err: any) {
        log(`Socket connection error: ${err.message}`);
        return next(new Error("Authentication error"));
      }
    } else {
      log("WARNING: Socket connection attempt without token. Allowing for legacy support, but should be enforced in production.");
      next(); 
    }
  });

  const messageRateLimits = new Map<string, number[]>();
  const RATE_LIMIT_WINDOW = 60000; // 1 minute
  const MAX_MESSAGES_PER_WINDOW = 20;

  io.on("connection", (socket) => {
    socket.on("join_subject", (subjectId) => {
      socket.join(`subject:${subjectId}`);
    });

    socket.on("join_chat", (roomId) => {
      socket.join(`chat:${roomId}`);
      log(`Socket ${socket.id} joined chat:${roomId}`);
    });

    socket.on("new_request", (data) => {
      const { subject_id } = data;
      io.to(`subject:${subject_id}`).emit("receive_request", data);
      log(`New request for subject ${subject_id}`);
    });

    socket.on("send_message", (data) => {
      const { room_id, message_text, sender_id } = data;
      
      // Rate limiting logic
      const now = Date.now();
      const userTimestamps = messageRateLimits.get(sender_id) || [];
      const recentTimestamps = userTimestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
      
      if (recentTimestamps.length >= MAX_MESSAGES_PER_WINDOW) {
        log(`Rate limit exceeded for user ${sender_id}`);
        socket.emit("error", { message: "Rate limit exceeded. Please wait before sending more messages." });
        return;
      }
      
      recentTimestamps.push(now);
      messageRateLimits.set(sender_id, recentTimestamps);

      io.to(`chat:${room_id}`).emit("receive_message", data);
      log(`Message in ${room_id} from ${sender_id}`);
    });

    socket.on("typing", (data) => {
      const { room_id, is_typing, user_id } = data;
      socket.to(`chat:${room_id}`).emit("user_typing", data);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected");
    });
  });

  // API routes
  app.use(express.json());
  
  // Input Validation Schemas
  const TopUpSchema = z.object({
    userId: z.string().min(1),
    amount: z.number().positive()
  });

  const PlaceBidSchema = z.object({
    tutorId: z.string().min(1),
    requestId: z.string().min(1),
    amount: z.number().positive(),
    message: z.string().min(1).max(500)
  });

  const AcceptBidSchema = z.object({
    studentId: z.string().min(1),
    bidId: z.string().min(1)
  });

  const ReferralIncrementSchema = z.object({
    studentId: z.string().min(1)
  });

  const ResolveDisputeSchema = z.object({
    lessonId: z.string().min(1),
    resolution: z.enum(['refund', 'pay'])
  });

  const SubmitDisputeSchema = z.object({
    lessonId: z.string().min(1),
    reason: z.string().min(1).max(100),
    details: z.string().min(1).max(1000)
  });

  const CompleteLessonSchema = z.object({
    lessonId: z.string().min(1),
    userId: z.string().min(1) // Either student or tutor can initiate, but usually student confirms
  });

  const InitiatePaynowSchema = z.object({
    bidId: z.string().min(1),
    studentId: z.string().min(1),
    email: z.string().email().optional()
  });

  const InitiateTopupSchema = z.object({
    userId: z.string().min(1),
    amount: z.number().positive(),
    email: z.string().email().optional()
  });

  const SubmitReviewSchema = z.object({
    lessonId: z.string().min(1),
    tutorId: z.string().min(1),
    studentId: z.string().min(1),
    rating: z.number().min(1).max(5),
    reviewText: z.string().optional()
  });

  app.use((req, res, next) => {
    log(`${req.method} ${req.url}`);
    next();
  });

  // JWT Authentication Middleware
  const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Public routes that don't need auth
    if (req.path === '/api/health' || req.path.includes('/webhook')) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      log(`Unauthorized request to ${req.path} - No token`);
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await db.auth.getUser(token);

    if (error || !user) {
      log(`Unauthorized request to ${req.path} - Invalid token: ${error?.message}`);
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    // Attach user to request for downstream use if needed
    (req as any).user = user;
    next();
  };

  app.use('/api', requireAuth);

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // 0. Top Up Wallet (Simulated - DISABLED FOR SECURITY)
  /*
  app.post("/api/wallet/top-up", async (req, res, next) => {
    ...
  });
  */

  app.post("/api/bids/place", async (req, res, next) => {
    log("POST /api/bids/place - Request received");
    try {
      const { tutorId, requestId, amount, message } = PlaceBidSchema.parse(req.body);

      // Fetch tutor profile
      const { data: tutorProfile, error: tpErr } = await db.from('profiles').select('*').eq('id', tutorId).single();
      if (tpErr || !tutorProfile) throw new Error("Tutor profile not found");
      if (tutorProfile.role !== 'tutor') throw new Error("Only tutors can place bids");

      // Fetch request and validate it is still open
      const { data: request, error: rErr } = await db.from('lesson_requests').select('*').eq('id', requestId).single();
      if (rErr || !request) throw new Error("Request not found");
      if (request.status !== 'open') throw new Error(`Cannot bid on a request with status: ${request.status}`);

      // Validate bid amount against budget range
      if (amount < request.budget_min || amount > (request.budget_max * 1.2)) {
        throw new Error(`Bid amount must be between $${request.budget_min} and $${(request.budget_max * 1.2).toFixed(2)}`);
      }

      // Prevent tutor bidding on their own hypothetical request
      if (request.student_id === tutorId) throw new Error("You cannot bid on your own request");

      // Prevent duplicate bids from same tutor
      const { data: existingBid } = await db.from('bids').select('id').eq('request_id', requestId).eq('tutor_id', tutorId).eq('status', 'pending').single();
      if (existingBid) throw new Error("You have already placed a bid on this request");

      const walletBalance = tutorProfile.wallet_balance ?? 0;
      const BID_FEE = 0.50;

      if (walletBalance < BID_FEE) {
        throw new Error("INSUFFICIENT_FUNDS: You need at least $0.50 in your wallet to place a bid");
      }

      // Deduct bid fee atomically
      const { error: deductErr } = await db.rpc('deduct_wallet_balance', {
        p_user_id: tutorId,
        p_amount: BID_FEE
      });
      if (deductErr) throw new Error(deductErr.message);

      // Log bid fee transaction
      await db.from('transactions').insert({
        user_id: tutorId,
        type: 'bid_fee',
        amount: -BID_FEE,
        description: `$0.50 Bid Fee for request ${requestId}`
      });

      // Insert bid
      const { data: newBid, error: bidErr } = await db.from('bids').insert({
        request_id: requestId,
        tutor_id: tutorId,
        amount,
        message,
        status: 'pending'
      }).select().single();
      if (bidErr) throw new Error(bidErr.message);

      // Notify student of new bid
      await db.from('notifications').insert({
        user_id: request.student_id,
        title: 'New Bid Received!',
        message: `A tutor has placed a bid of $${amount} on your ${request.subject} request.`,
        is_read: false
      });

      io.emit(`new_bid:${requestId}`, { tutor_id: tutorId, amount, bid_id: newBid.id });
      res.json({ success: true, bid_id: newBid.id });
    } catch (error: any) {
      log(`Error in /api/bids/place: ${error.message}`);
      res.status(400).json({ error: error.message });
    }
  });

  // 2. Accept Bid & Escrow
  app.post("/api/bids/accept", async (req, res, next) => {
    try {
      const { studentId, bidId } = AcceptBidSchema.parse(req.body);
      await executeBidAcceptance(studentId, bidId, false);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Paynow Payment Initiation
  app.post("/api/payments/initiate-paynow", async (req, res) => {
    log("POST /api/payments/initiate-paynow - Request received");
    try {
      const { bidId, studentId, email } = InitiatePaynowSchema.parse(req.body);

      const { data: bidData, error: bidErr } = await db.from('bids').select('*').eq('id', bidId).single();
      if (bidErr || !bidData) throw new Error("Bid not found");
      if (bidData.status !== 'pending') throw new Error(`Cannot pay for bid in status: ${bidData.status}`);

      const merchantEmail = email || "payments@tutorconnect.co.zw";
      const attemptId = crypto.randomUUID();

      const payment = paynow.createPayment(`PAY_${attemptId}`, merchantEmail);
      payment.add(`Tutor Bid - Request ${bidData.request_id}`, bidData.amount);

      const response = await paynow.send(payment);

      if (response.success) {
        await db.from('payment_attempts').insert({
          id: attemptId, type: 'bid', bid_id: bidId, student_id: studentId,
          amount: bidData.amount, poll_url: response.pollUrl, status: 'sent'
        });
        res.json({ success: true, redirectUrl: response.redirectUrl, pollUrl: response.pollUrl });
      } else {
        throw new Error(`Paynow payment initiation failed: ${response.error}`);
      }
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Paynow Webhook
  app.post("/api/payments/paynow-webhook", express.urlencoded({ extended: true }), async (req, res) => {
    log("Paynow Webhook Received");
    try {
      if (!paynow.validate(req.body)) {
        log("WARNING: Paynow Webhook Hash Verification Failed!");
        return res.status(400).send("Invalid hash");
      }

      const status = paynow.parseStatusUpdate(req.body);
      log(`Paynow Status: ${status.status} for Ref: ${status.reference}`);

      if (status.status === "Paid" || status.status === "Awaiting Delivery") {
        if (status.reference.startsWith("PAY_")) {
          const attemptId = status.reference.substring(4);

          const { data: attemptData, error: aErr } = await db.from('payment_attempts').select('*').eq('id', attemptId).single();
          if (aErr || !attemptData) { log(`Attempt ${attemptId} not found`); return res.sendStatus(200); }

          // Idempotency check
          if (attemptData.status !== 'sent') {
            log(`Attempt ${attemptId} already processed (${attemptData.status})`);
            return res.sendStatus(200);
          }

          if (attemptData.type === 'bid') {
            try {
              await executeBidAcceptance(attemptData.student_id, attemptData.bid_id, true);
            } catch (bidError: any) {
              log(`Bid acceptance failed (${bidError.message}). Falling back to wallet top-up.`);
              const { data: profile } = await db.from('profiles').select('wallet_balance').eq('id', attemptData.student_id).single();
              const cur = profile?.wallet_balance || 0;
              await db.from('profiles').update({ wallet_balance: cur + attemptData.amount }).eq('id', attemptData.student_id);
              await db.from('transactions').insert({ user_id: attemptData.student_id, type: 'top_up', amount: attemptData.amount, description: `Fallback top-up: ${bidError.message}` });
            }
          } else if (attemptData.type === 'top_up') {
            const { data: profile } = await db.from('profiles').select('wallet_balance').eq('id', attemptData.user_id).single();
            const cur = profile?.wallet_balance || 0;
            await db.from('profiles').update({ wallet_balance: cur + attemptData.amount }).eq('id', attemptData.user_id);
            await db.from('transactions').insert({ user_id: attemptData.user_id, type: 'top_up', amount: attemptData.amount, description: 'Wallet top-up via Paynow' });
          }

          await db.from('payment_attempts').update({ status: 'completed', paynow_reference: status.paynowReference }).eq('id', attemptId);
        }
      }

      res.sendStatus(200);
    } catch (error: any) {
      log(`Paynow Webhook Error: ${error.message}`);
      res.sendStatus(500);
    }
  });

  // Poll payment status
  app.get("/api/payments/poll-status", async (req, res) => {
    try {
      const pollUrl = req.query.pollUrl as string;
      if (!pollUrl) throw new Error("Missing pollUrl");

      const { data, error } = await db.from('payment_attempts').select('status').eq('poll_url', pollUrl).limit(1).single();
      if (error || !data) return res.json({ paid: false, status: 'Not Found', pollUrl });

      res.json({ paid: data.status === 'completed', status: data.status, pollUrl });
    } catch (error: any) {
      log(`Poll Status Error: ${error.message}`);
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/wallet/initiate-topup", async (req, res) => {
    log("POST /api/wallet/initiate-topup - Request received");
    try {
      const { userId, amount, email } = InitiateTopupSchema.parse(req.body);
      const merchantEmail = email || "payments@tutorconnect.co.zw";
      const attemptId = crypto.randomUUID();

      const payment = paynow.createPayment(`PAY_${attemptId}`, merchantEmail);
      payment.add("Wallet Top-up", amount);

      const response = await paynow.send(payment);
      if (response.success) {
        await db.from('payment_attempts').insert({
          id: attemptId, type: 'top_up', user_id: userId,
          amount, poll_url: response.pollUrl, status: 'sent'
        });
        res.json({ success: true, redirectUrl: response.redirectUrl });
      } else {
        throw new Error(`Paynow initiation failed: ${response.error}`);
      }
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/lessons/cancel", async (req, res) => {
    try {
      const { lessonId, userId, reason } = req.body;
      if (!lessonId || !userId) throw new Error("Missing required fields");

      const { data: lesson, error: lErr } = await db.from('lessons').select('*').eq('id', lessonId).single();
      if (lErr || !lesson) throw new Error("Lesson not found");

      // Guard: only student or tutor on the lesson can cancel
      if (lesson.student_id !== userId && lesson.tutor_id !== userId) throw new Error("UNAUTHORIZED: You are not part of this lesson");

      // Guard: can only cancel an escrow or in-progress lesson
      const cancellableStatuses = ['paid_escrow', 'in_progress'];
      if (!cancellableStatuses.includes(lesson.status)) {
        throw new Error(`Cannot cancel a lesson with status: ${lesson.status}`);
      }

      // Update lesson
      await db.from('lessons').update({ status: 'cancelled', cancelled_by: userId, cancel_reason: reason || 'No reason provided' }).eq('id', lessonId);

      // Refund student wallet atomically
      const { error: refundErr } = await db.rpc('add_wallet_balance', {
        p_user_id: lesson.student_id,
        p_amount: lesson.amount
      });
      if (refundErr) throw new Error(refundErr.message);

      // Log refund
      await db.from('transactions').insert({ user_id: lesson.student_id, lesson_id: lessonId, type: 'refund', amount: lesson.amount, description: `Refund for cancelled lesson ${lessonId}` });

      // Notify both parties
      await db.from('notifications').insert([
        { user_id: lesson.student_id, title: 'Lesson Cancelled', message: `Your lesson has been cancelled. $${lesson.amount} refunded to wallet.`, is_read: false },
        { user_id: lesson.tutor_id, title: 'Lesson Cancelled', message: `The student has cancelled the lesson.`, is_read: false }
      ]);

      res.json({ success: true });
    } catch (error: any) {
      log(`Error in /api/lessons/cancel: ${error.message}`);
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/lessons/update-meeting", async (req, res) => {
    try {
      const { lessonId, tutorId, meetingLink, meetingType } = req.body;
      if (!lessonId || !tutorId || !meetingLink || !meetingType) throw new Error("Missing required fields");

      const { data: lesson, error } = await db.from('lessons').select('tutor_id').eq('id', lessonId).single();
      if (error || !lesson) throw new Error("Lesson not found");
      if (lesson.tutor_id !== tutorId) throw new Error("Unauthorized");

      await db.from('lessons').update({ meeting_link: meetingLink, meeting_type: meetingType }).eq('id', lessonId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/lessons/start", async (req, res) => {
    try {
      const { lessonId, tutorId } = req.body;
      if (!lessonId || !tutorId) throw new Error("Missing required fields");

      const { data: lesson, error } = await db.from('lessons').select('*').eq('id', lessonId).single();
      if (error || !lesson) throw new Error("Lesson not found");
      if (lesson.tutor_id !== tutorId) throw new Error("Unauthorized");

      if (lesson.status === 'paid_escrow') {
        await db.from('lessons').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', lessonId);
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // 3. Referral Logic
  app.post("/api/referrals/increment", async (req, res, next) => {
    try {
      const { studentId } = ReferralIncrementSchema.parse(req.body);

      const { data: user, error } = await db.from('profiles').select('referral_count, wallet_balance').eq('id', studentId).single();
      if (error || !user) throw new Error("User not found");

      const newCount = (user.referral_count || 0) + 1;
      const updates: any = { referral_count: newCount };

      if (newCount % 5 === 0) {
        updates.wallet_balance = (user.wallet_balance || 0) + 0.50;
        await db.from('transactions').insert({ user_id: studentId, type: 'referral_reward', amount: 0.50, description: `Referral reward for reaching ${newCount} referrals` });
        await db.from('notifications').insert({ user_id: studentId, title: 'Referral Reward Earned!', message: `You've earned $0.50 for reaching ${newCount} referrals.`, is_read: false });
      }

      await db.from('profiles').update(updates).eq('id', studentId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // 4. Resolve Dispute
  app.post("/api/lessons/resolve-dispute", async (req, res, next) => {
    try {
      const { lessonId, resolution } = ResolveDisputeSchema.parse(req.body);

      const { data: lesson, error: lErr } = await db.from('lessons').select('*').eq('id', lessonId).single();
      if (lErr || !lesson) throw new Error("Lesson not found");

      if (resolution === 'refund') {
        // Refund student
        const { data: student } = await db.from('profiles').select('wallet_balance').eq('id', lesson.student_id).single();
        await db.from('profiles').update({ wallet_balance: (student?.wallet_balance || 0) + lesson.amount }).eq('id', lesson.student_id);
        await db.from('transactions').insert({ user_id: lesson.student_id, lesson_id: lessonId, type: 'refund', amount: lesson.amount, description: `Refund for disputed lesson ${lessonId}` });
        await db.from('notifications').insert({ user_id: lesson.student_id, title: 'Lesson Refunded', message: `Your payment of $${lesson.amount} has been refunded.`, is_read: false });
        await db.from('lessons').update({ status: 'refunded' }).eq('id', lessonId);
      } else {
        // Pay tutor
        const platformFee = lesson.amount * 0.10;
        const tutorPayout = lesson.amount - platformFee;
        const { data: tutor } = await db.from('profiles').select('wallet_balance').eq('id', lesson.tutor_id).single();
        await db.from('profiles').update({ wallet_balance: (tutor?.wallet_balance || 0) + tutorPayout }).eq('id', lesson.tutor_id);
        await db.from('transactions').insert({ user_id: lesson.tutor_id, lesson_id: lessonId, type: 'tutor_payout', amount: tutorPayout, description: `Payout for disputed lesson (Net of 10% fee)` });
        await db.from('notifications').insert({ user_id: lesson.tutor_id, title: 'Dispute Resolved: Payout Released', message: `$${tutorPayout.toFixed(2)} added to wallet.`, is_read: false });
        await db.from('lessons').update({ status: 'completed', final_payout: tutorPayout, commission: platformFee }).eq('id', lessonId);
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // 5. Submit Dispute
  app.post("/api/lessons/dispute", async (req, res, next) => {
    try {
      const { lessonId, reason, details } = SubmitDisputeSchema.parse(req.body);

      const { data: lesson, error } = await db.from('lessons').select('id').eq('id', lessonId).single();
      if (error || !lesson) throw new Error("Lesson not found");

      await db.from('lessons').update({
        status: 'disputed', dispute_reason: reason,
        dispute_details: details, disputed_at: new Date().toISOString()
      }).eq('id', lessonId);

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // 6. Complete Lesson
  app.post("/api/lessons/complete", async (req, res, next) => {
    log("POST /api/lessons/complete - Request received");
    try {
      const { lessonId, userId } = CompleteLessonSchema.parse(req.body);

      const { data: lesson, error: lErr } = await db.from('lessons').select('*').eq('id', lessonId).single();
      if (lErr || !lesson) throw new Error("Lesson not found");
      if (lesson.student_id !== userId) throw new Error("UNAUTHORIZED: Only the student can confirm completion");
      if (lesson.status !== 'paid_escrow' && lesson.status !== 'in_progress') throw new Error(`Cannot complete lesson in status: ${lesson.status}`);
      if (!lesson.tutor_id) throw new Error("Lesson has no assigned tutor");

      const platformFee = Number((lesson.amount * 0.10).toFixed(2));
      const tutorPayout = Number((lesson.amount - platformFee).toFixed(2));

      // Atomically credit tutor wallet using RPC
      const { error: payoutErr } = await db.rpc('add_wallet_balance', {
        p_user_id: lesson.tutor_id,
        p_amount: tutorPayout
      });
      if (payoutErr) throw new Error(`Payout failed: ${payoutErr.message}`);

      // Log payout & fee
      await db.from('transactions').insert([
        { user_id: lesson.tutor_id, lesson_id: lessonId, type: 'tutor_payout', amount: tutorPayout, description: `Payout for lesson ${lessonId} (net of 10% platform fee)` },
        { user_id: lesson.student_id, lesson_id: lessonId, type: 'platform_fee', amount: -platformFee, description: `10% platform fee for lesson ${lessonId}` }
      ]);

      // Update lesson
      await db.from('lessons').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        final_payout: tutorPayout,
        commission: platformFee
      }).eq('id', lessonId);

      // Notify tutor
      await db.from('notifications').insert({ user_id: lesson.tutor_id, title: 'Lesson Completed & Paid', message: `$${tutorPayout.toFixed(2)} has been added to your wallet.`, is_read: false });

      res.json({ success: true, tutor_payout: tutorPayout, platform_fee: platformFee });
    } catch (error: any) {
      log(`Error in /api/lessons/complete: ${error.message}`);
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/reviews", async (req, res) => {
    try {
      const { lessonId, tutorId, studentId, rating, reviewText } = SubmitReviewSchema.parse(req.body);

      // Verify the user placing the review is the student
      if ((req as any).user.id !== studentId) {
        throw new Error("UNAUTHORIZED: Only the student of this lesson can leave a review");
      }

      // Ensure the lesson is completed
      const { data: lesson, error: lErr } = await db.from('lessons').select('*').eq('id', lessonId).single();
      if (lErr || !lesson) throw new Error("Lesson not found");
      if (lesson.status !== 'completed') throw new Error("Cannot review a lesson that is not completed");

      // Insert review
      const { error: revErr } = await db.from('reviews').insert({
        lesson_id: lessonId,
        tutor_id: tutorId,
        student_id: studentId,
        rating,
        review_text: reviewText
      });

      if (revErr) {
        if (revErr.code === '23505') throw new Error("You have already reviewed this lesson");
        throw new Error(revErr.message);
      }

      // Notify the tutor
      await db.from('notifications').insert({
        user_id: tutorId,
        title: 'New Review',
        message: `You received a ${rating}-star review from a student!`,
        is_read: false
      });

      res.json({ success: true });
    } catch (error: any) {
      log(`Error in /api/reviews: ${error.message}`);
      res.status(400).json({ error: error.message });
    }
  });

  // --- AI FEATURES (Deprecated) ---
  // AI endpoints removed as they relied on the deprecated React web UI codebase.

  // Daily Settlement Cron Job
  cron.schedule('59 23 * * *', async () => {
    log("Running daily settlement...");
    try {
      const { data: revenue } = await db.from('admin_ledgers').select('balance').eq('id', 'revenue').single();
      if (revenue && revenue.balance > 0) {
        log(`Settling $${revenue.balance} to Admin Master Account...`);
        // Paynow/EcoCash API call would go here
        
        await db.from('admin_ledgers').update({
          balance: 0,
          last_settlement_at: new Date().toISOString()
        }).eq('id', 'revenue');
      }
    } catch (error) {
      log(`Settlement failed: ${error}`);
    }
  });

  // Expiration Cron Job (runs every hour)
  cron.schedule('0 * * * *', async () => {
    log("Running expiration task...");
    const todayStr = new Date().toISOString().split('T')[0];
    try {
      // Expire open requests past their date
      await db.from('lesson_requests').update({ status: 'expired' }).eq('status', 'open').lt('scheduled_date', todayStr);
      // Expire pending bids for expired requests
      const { data: expiredRequests } = await db.from('lesson_requests').select('id').eq('status', 'expired');
      if (expiredRequests && expiredRequests.length > 0) {
        const ids = expiredRequests.map((r: any) => r.id);
        await db.from('bids').update({ status: 'expired' }).in('request_id', ids).eq('status', 'pending');
      }
      // Mark past-due lessons
      await db.from('lessons').update({ is_past_due: true }).eq('status', 'paid_escrow').lt('created_at', todayStr);
    } catch (error) {
      console.error("Expiration task failed:", error);
    }
  });
  
  // Catch-all for unmatched API routes
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    log(`Unhandled Error: ${err.message}`);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: err.issues });
    }
    res.status(500).json({ error: "Internal server error" });
  });

  // Frontend is managed externally (Flutter)
  app.get("/", (req, res) => {
    res.send("TutorConnect API Server is running.");
  });

  httpServer.on("error", (err) => {
    log(`Server error: ${err.message}`);
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    log(`Server running on http://localhost:${PORT}`);
    log(`Environment: ${process.env.NODE_ENV}`);
  });
}

startServer();
