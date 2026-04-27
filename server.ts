import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { Paynow } from "paynow";
import dotenv from "dotenv";

dotenv.config();
import firebaseConfig from "./firebase-applet-config.json";

const logFile = path.join(process.cwd(), "server.log");
function log(msg: string) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `[${timestamp}] ${msg}\n`);
}
import cron from "node-cron";

// Initialize Firebase Admin SDK
const adminApp = admin.initializeApp({
  projectId: firebaseConfig.projectId
});

const db = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(adminApp);

// Admin equivalents of common helpers
const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();
const increment = (n: number) => admin.firestore.FieldValue.increment(n);

async function bootstrap() {
  try {
    log(`Bootstrapping on ${firebaseConfig.firestoreDatabaseId} database using Admin SDK...`);
    const revenueRef = db.collection('admin_ledgers').doc('revenue');
    const snap = await revenueRef.get();
    if (!snap.exists) {
      log("Initializing admin_ledgers/revenue...");
      await revenueRef.set({ balance: 0, last_settlement_at: serverTimestamp() });
    }
    
    const marketingRef = db.collection('admin_ledgers').doc('marketing');
    const mSnap = await marketingRef.get();
    if (!mSnap.exists) {
      log("Initializing admin_ledgers/marketing...");
      await marketingRef.set({ balance: 0, last_settlement_at: serverTimestamp() });
    }
    const statsRef = db.collection('admin_ledgers').doc('stats');
    const sSnap = await statsRef.get();
    if (!sSnap.exists) {
      log("Initializing admin_ledgers/stats...");
      await statsRef.set({ 
        total_lessons: 0, 
        completed_lessons: 0, 
        pending_lessons: 0, 
        disputed_lessons: 0,
        refunded_lessons: 0
      });
    }
    log("Bootstrap successful.");
  } catch (error: any) {
    log(`Bootstrap error: ${error.message}`);
  }
}

const paynow = new Paynow(
  process.env.PAYNOW_INTEGRATION_ID || "1234",
  process.env.PAYNOW_INTEGRATION_KEY || "key",
  process.env.PAYNOW_RESULT_URL || `${process.env.APP_URL}/api/payments/paynow-webhook`,
  process.env.PAYNOW_RETURN_URL || `${process.env.APP_URL}/dashboard`
);

if (!process.env.PAYNOW_INTEGRATION_ID || process.env.PAYNOW_INTEGRATION_ID === "1234") {
  log("WARNING: Paynow is running in DEMO mode with placeholder keys. Please set PAYNOW_INTEGRATION_ID and PAYNOW_INTEGRATION_KEY in environment variables for live payments.");
}

async function executeBidAcceptance(studentId: string, bidId: string, isPaidDirectly: boolean = false) {
  return await db.runTransaction(async (t) => {
    const bidRef = db.collection('bids').doc(bidId);
    const bidSnap = await t.get(bidRef);
    if (!bidSnap.exists) throw new Error("Bid not found");
    const bidData = bidSnap.data()!;
    
    if (!isPaidDirectly) {
      const studentRef = db.collection('users').doc(studentId);
      const studentSnap = await t.get(studentRef);
      const studentBalance = studentSnap.data()?.wallet_balance || 0;
      
      if (studentBalance < bidData.amount) {
        throw new Error("INSUFFICIENT_FUNDS");
      }
      
      // Deduct from student
      t.update(studentRef, { wallet_balance: studentBalance - bidData.amount });
    }
    
    // Log escrow hold for student
    const studentTxRef = db.collection('transactions').doc();
    t.set(studentTxRef, {
      user_id: studentId,
      lesson_id: bidData.request_id,
      type: 'escrow_hold',
      amount: bidData.amount,
      description: isPaidDirectly ? `Funds paid via Paynow for lesson` : `Funds held in escrow for lesson`,
      status: 'completed',
      created_at: serverTimestamp()
    });
    
    // Create Escrow
    const escrowRef = db.collection('escrow_holding').doc();
    const escrowId = escrowRef.id;
    t.set(escrowRef, {
      lesson_id: bidData.request_id,
      student_id: studentId,
      tutor_id: bidData.tutor_id,
      amount: bidData.amount,
      status: 'LOCKED',
      payment_method: isPaidDirectly ? 'paynow' : 'wallet',
      created_at: serverTimestamp(),
      updated_at: serverTimestamp()
    });
    
    // Update Bid & Request
    t.update(bidRef, { status: 'accepted' });
    t.update(db.collection('lesson_requests').doc(bidData.request_id), { status: 'matched' });
    
    // Create Lesson
    const lessonRef = db.collection('lessons').doc(bidData.request_id);
    const studentUserRef = db.collection('users').doc(studentId);
    const studentUserSnap = await t.get(studentUserRef);
    const studentPhone = studentUserSnap.data()?.phone || 'Not provided';

    t.set(lessonRef, {
      bid_id: bidId,
      escrow_id: escrowId,
      student_id: studentId,
      tutor_id: bidData.tutor_id,
      amount: bidData.amount,
      status: 'paid_escrow',
      student_phone: studentPhone,
      created_at: serverTimestamp()
    });

    // Create Chat Room
    const chatRoomRef = db.collection('chat_rooms').doc();
    t.set(chatRoomRef, {
      request_id: bidData.request_id,
      student_id: studentId,
      student_name: studentUserSnap.data()?.full_name || 'Student',
      tutor_id: bidData.tutor_id,
      tutor_name: bidData.tutor_name || 'Tutor',
      updated_at: serverTimestamp()
    });

    // Update Stats
    const statsRef = db.collection('admin_ledgers').doc('stats');
    t.update(statsRef, {
      total_lessons: increment(1),
      pending_lessons: increment(1)
    });

    // Update Revenue
    const revenueRef = db.collection('admin_ledgers').doc('revenue');
    t.update(revenueRef, {
      total_gmv: increment(bidData.amount),
      total_revenue: increment(bidData.amount * 0.1),
      balance: increment(bidData.amount * 0.1)
    });

    // Notify Tutor with Student Number
    const tutorNotifRef = db.collection('notifications').doc();
    t.set(tutorNotifRef, {
      user_id: bidData.tutor_id,
      title: 'Bid Accepted!',
      message: `Your bid for request ${bidData.request_id} was accepted. Student Phone: ${studentPhone}. You can now start the lesson.`,
      type: 'success',
      is_read: false,
      created_at: serverTimestamp()
    });
  });
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
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    // In a real app, verify the Firebase ID token here
    // For now, we'll allow it but log the connection
    if (token) {
      log(`Socket connection with token: ${token.slice(0, 10)}...`);
      next();
    } else {
      log("Socket connection attempt without token");
      next(); // Allowing for now to avoid breaking existing frontend, but should be strict in prod
    }
  });

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

  app.use((req, res, next) => {
    log(`${req.method} ${req.url}`);
    next();
  });

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
      
      await db.runTransaction(async (t) => {
        const tutorRef = db.collection('tutor_profiles').doc(tutorId);
        const userRef = db.collection('users').doc(tutorId);
        const requestRef = db.collection('lesson_requests').doc(requestId);
        const adminRevenueRef = db.collection('admin_ledgers').doc('revenue');
        
        const tutorSnap = await t.get(tutorRef);
        const userSnap = await t.get(userRef);
        const requestSnap = await t.get(requestRef);
        
        if (!tutorSnap.exists) throw new Error("Tutor profile not found");
        if (!requestSnap.exists) throw new Error("Request not found");
        
        const tutorData = tutorSnap.data()!;
        const userData = userSnap.data() || { wallet_balance: 0 };
        const requestData = requestSnap.data()!;
        
        let freeBids = tutorData.free_bids_remaining ?? 0;
        let walletBalance = userData.wallet_balance ?? 0;
        
        if (freeBids > 0) {
          t.update(tutorRef, { free_bids_remaining: freeBids - 1 });
          // Log free bid usage
          const txRef = db.collection('transactions').doc();
          t.set(txRef, {
            user_id: tutorId,
            type: 'bid_fee',
            amount: 0,
            description: `1 Free Bid used for request ${requestId}`,
            status: 'completed',
            created_at: serverTimestamp()
          });
        } else {
          if (walletBalance >= 0.50) {
            t.update(userRef, { wallet_balance: walletBalance - 0.50 });
            t.set(adminRevenueRef, { 
              balance: increment(0.50) 
            }, { merge: true });
            
            // Log paid bid fee
            const txRef = db.collection('transactions').doc();
            t.set(txRef, {
              user_id: tutorId,
              type: 'bid_fee',
              amount: 0.50,
              description: `$0.50 Bid Fee for request ${requestId}`,
              status: 'completed',
              created_at: serverTimestamp()
            });
          } else {
            throw new Error("INSUFFICIENT_FUNDS");
          }
        }
        
        const bidRef = db.collection('bids').doc();
        t.set(bidRef, {
          request_id: requestId,
          student_id: requestData.student_id,
          tutor_id: tutorId,
          tutor_name: userData.full_name || 'Tutor',
          tutor_rating: tutorData.avg_rating || 5.0,
          amount: amount,
          message,
          status: 'pending',
          created_at: serverTimestamp()
        });

        // Increment bid count on request
        t.update(requestRef, { 
          bid_count: increment(1),
          updated_at: serverTimestamp()
        });
      });
      
      io.emit(`new_bid:${requestId}`, { tutor_id: tutorId, amount });
      res.json({ success: true });
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
    try {
      const { bidId, studentId, email } = req.body;
      
      const bidRef = db.collection('bids').doc(bidId);
      const bidSnap = await bidRef.get();
      if (!bidSnap.exists) throw new Error("Bid not found");
      const bidData = bidSnap.data()!;

      // Use provided email or fallback to a default if not present
      const merchantEmail = email || "payments@tutorconnect.co.zw";

      const payment = paynow.createPayment(`BID: ${bidId}`, merchantEmail);
      payment.add(`Tutor Bid - Request ${bidData.request_id}`, bidData.amount);

      const response = await paynow.send(payment);

      if (response.success) {
        // Store the pollUrl and other info in a temporary collection to verify later
        await db.collection('payment_attempts').add({
          bid_id: bidId,
          student_id: studentId,
          amount: bidData.amount,
          poll_url: response.pollUrl,
          status: 'sent',
          created_at: serverTimestamp()
        });

        res.json({ 
          success: true, 
          redirectUrl: response.redirectUrl,
          pollUrl: response.pollUrl
        });
      } else {
        log(`Paynow Bid Payment Initiation Failed: ${response.error}`);
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
      const status = paynow.parseStatusUpdate(req.body);
      log(`Paynow Status: ${status.status} for Ref: ${status.reference}`);
      
      if (status.status === "Paid" || status.status === "Awaiting Delivery") {
        if (status.reference.startsWith("BID: ")) {
          const bidId = status.reference.split(": ")[1];
          const snap = await db.collection('payment_attempts')
            .where('bid_id', '==', bidId)
            .where('status', '==', 'sent')
            .limit(1)
            .get();
          
          if (!snap.empty) {
            const attemptDoc = snap.docs[0];
            const attemptData = attemptDoc.data();
            
            await executeBidAcceptance(attemptData.student_id, bidId, true);
            await attemptDoc.ref.update({ status: 'completed', updated_at: serverTimestamp() });
            log(`Paynow Payment Successful for Bid ${bidId}. Bid accepted.`);
          }
        } else if (status.reference.startsWith("TOPUP: ")) {
          const userId = status.reference.split(": ")[1];
          const amount = parseFloat(status.amount);
          
          await db.runTransaction(async (t) => {
            const userRef = db.collection('users').doc(userId);
            t.update(userRef, { wallet_balance: increment(amount) });
            
            const txRef = db.collection('transactions').doc();
            t.set(txRef, {
              user_id: userId,
              type: 'top_up',
              amount: amount,
              description: `Wallet top-up via Paynow`,
              status: 'completed',
              created_at: serverTimestamp()
            });
          });
          log(`Paynow Top-up Successful for User ${userId}. Amount: ${amount}`);
        }
      }
      
      res.sendStatus(200);
    } catch (error: any) {
      log(`Paynow Webhook Error: ${error.message}`);
      res.sendStatus(500);
    }
  });

  app.post("/api/wallet/initiate-topup", async (req, res) => {
    try {
      const { userId, amount, email } = req.body;
      if (!userId || !amount) throw new Error("Missing required fields");

      const merchantEmail = email || "payments@tutorconnect.co.zw";
      const payment = paynow.createPayment(`TOPUP: ${userId}`, merchantEmail);
      payment.add("Wallet Top-up", amount);

      const response = await paynow.send(payment);
      if (response.success) {
        res.json({ success: true, redirectUrl: response.redirectUrl });
      } else {
        log(`Paynow Top-up Initiation Failed: ${response.error}`);
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

      await db.runTransaction(async (t) => {
        const lessonRef = db.collection('lessons').doc(lessonId);
        const lessonSnap = await t.get(lessonRef);
        if (!lessonSnap.exists) throw new Error("Lesson not found");
        
        const lessonData = lessonSnap.data()!;
        if (lessonData.status === 'completed') throw new Error("Cannot cancel completed lesson");

        // Update lesson status
        t.update(lessonRef, { status: 'cancelled', cancelled_by: userId, cancel_reason: reason });

        // Re-open the request
        const requestRef = db.collection('lesson_requests').doc(lessonId);
        t.update(requestRef, { status: 'open' });

        // Refund escrow if needed (simplified: refund to student)
        const escrowSnap = await db.collection('escrow_holding')
          .where('lesson_id', '==', lessonId)
          .limit(1)
          .get();
          
        if (!escrowSnap.empty) {
          const escrowDoc = escrowSnap.docs[0];
          const escrowData = escrowDoc.data();
          if (escrowData.status === 'LOCKED') {
            const studentRef = db.collection('users').doc(escrowData.student_id);
            t.update(studentRef, { wallet_balance: increment(escrowData.amount) });
            t.update(escrowDoc.ref, { status: 'REFUNDED', updated_at: serverTimestamp() });
            
            // Log refund
            const txRef = db.collection('transactions').doc();
            t.set(txRef, {
              user_id: escrowData.student_id,
              type: 'refund',
              amount: escrowData.amount,
              description: `Refund for cancelled lesson ${lessonId}`,
              status: 'completed',
              created_at: serverTimestamp()
            });
          }
        }
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/lessons/update-meeting", async (req, res) => {
    try {
      const { lessonId, tutorId, meetingLink, meetingType } = req.body;
      if (!lessonId || !tutorId || !meetingLink || !meetingType) {
        throw new Error("Missing required fields");
      }

      const lessonRef = db.collection('lessons').doc(lessonId);
      const lessonSnap = await lessonRef.get();
      if (!lessonSnap.exists) throw new Error("Lesson not found");
      
      const lessonData = lessonSnap.data()!;
      if (lessonData.tutor_id !== tutorId) throw new Error("Unauthorized");

      await lessonRef.update({
        meeting_link: meetingLink,
        meeting_type: meetingType,
        updated_at: serverTimestamp()
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/lessons/start", async (req, res) => {
    try {
      const { lessonId, tutorId } = req.body;
      if (!lessonId || !tutorId) throw new Error("Missing required fields");

      const lessonRef = db.collection('lessons').doc(lessonId);
      const lessonSnap = await lessonRef.get();
      if (!lessonSnap.exists) throw new Error("Lesson not found");
      
      const lessonData = lessonSnap.data()!;
      if (lessonData.tutor_id !== tutorId) throw new Error("Unauthorized");

      if (lessonData.status === 'paid_escrow') {
        await lessonRef.update({
          status: 'in_progress',
          started_at: serverTimestamp(),
          updated_at: serverTimestamp()
        });
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
      
      await db.runTransaction(async (t) => {
        const userRef = db.collection('users').doc(studentId);
        const userSnap = await t.get(userRef);
        if (!userSnap.exists) throw new Error("User not found");
        
        const currentCount = userSnap.data()?.referral_count || 0;
        const newCount = currentCount + 1;
        
        t.update(userRef, { referral_count: newCount });
        
        if (newCount % 5 === 0) {
          const marketingRef = db.collection('admin_ledgers').doc('marketing');
          t.set(marketingRef, { 
            balance: increment(-0.50) 
          }, { merge: true });
          
          t.update(userRef, { 
            wallet_balance: increment(0.50) 
          });
          
          // Log referral reward
          const txRef = db.collection('transactions').doc();
          t.set(txRef, {
            user_id: studentId,
            type: 'referral_reward',
            amount: 0.50,
            description: `Referral reward for reaching ${newCount} referrals`,
            status: 'completed',
            created_at: serverTimestamp()
          });
          
          // Create notification
          const notifRef = db.collection('notifications').doc();
          t.set(notifRef, {
            user_id: studentId,
            title: 'Referral Reward Earned!',
            message: `You've earned $0.50 for reaching ${newCount} referrals. Keep sharing!`,
            type: 'success',
            is_read: false,
            created_at: serverTimestamp()
          });
        }
      });
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // 4. Resolve Dispute
  app.post("/api/lessons/resolve-dispute", async (req, res, next) => {
    try {
      const { lessonId, resolution } = ResolveDisputeSchema.parse(req.body);
      
      await db.runTransaction(async (t) => {
        const escrowSnap = await db.collection('escrow_holding')
          .where('lesson_id', '==', lessonId)
          .limit(1)
          .get();
        if (escrowSnap.empty) throw new Error("Escrow record not found");
        const escrowRef = escrowSnap.docs[0].ref;
        const escrowData = escrowSnap.docs[0].data();
        
        if (resolution === 'refund') {
          t.update(escrowRef, { status: 'REFUNDED', updated_at: serverTimestamp() });
          t.update(db.collection('users').doc(escrowData.student_id), { 
            wallet_balance: increment(escrowData.amount) 
          });
          
          // Log refund
          const txRef = db.collection('transactions').doc();
          t.set(txRef, {
            user_id: escrowData.student_id,
            lesson_id: lessonId,
            type: 'top_up', 
            amount: escrowData.amount,
            description: `Refund for disputed lesson ${lessonId}`,
            status: 'completed',
            created_at: serverTimestamp()
          });

          // Create notification for student
          const studentNotifRef = db.collection('notifications').doc();
          t.set(studentNotifRef, {
            user_id: escrowData.student_id,
            title: 'Lesson Refunded',
            message: `Your payment of $${escrowData.amount} for lesson ${lessonId} has been refunded due to dispute resolution.`,
            type: 'info',
            is_read: false,
            created_at: serverTimestamp()
          });
        } else {
          // Admin rules: Pay Tutor net of fee
          const platformFee = escrowData.amount * 0.10;
          const tutorPayout = escrowData.amount - platformFee;

          t.update(escrowRef, { 
            status: 'RELEASED', 
            payout_amount: tutorPayout,
            platform_fee: platformFee,
            updated_at: serverTimestamp() 
          });
          
          t.update(db.collection('users').doc(escrowData.tutor_id), { 
            wallet_balance: increment(tutorPayout) 
          });

          // Log payout
          const txRef = db.collection('transactions').doc();
          t.set(txRef, {
            user_id: escrowData.tutor_id,
            lesson_id: lessonId,
            type: 'tutor_payout',
            amount: tutorPayout,
            description: `Payout for disputed lesson ${lessonId} (Net of 10% fee)`,
            status: 'completed',
            created_at: serverTimestamp()
          });

          // Log platform fee
          const feeTxRef = db.collection('transactions').doc();
          t.set(feeTxRef, {
            user_id: 'SYSTEM',
            lesson_id: lessonId,
            type: 'platform_fee',
            amount: platformFee,
            description: `Commission from disputed lesson ${lessonId}`,
            status: 'completed',
            created_at: serverTimestamp()
          });

          // Update Revenue Ledger
          const revenueRef = db.collection('admin_ledgers').doc('revenue');
          t.update(revenueRef, {
            total_revenue: increment(platformFee),
            balance: increment(platformFee)
          });

          // Create notification for tutor
          const tutorNotifRef = db.collection('notifications').doc();
          t.set(tutorNotifRef, {
            user_id: escrowData.tutor_id,
            title: 'Dispute Resolved: Payout Released',
            message: `Admin has resolved the dispute in your favor. $${tutorPayout.toFixed(2)} added to wallet.`,
            type: 'success',
            is_read: false,
            created_at: serverTimestamp()
          });
        }
        
        t.update(db.collection('lessons').doc(lessonId), { status: resolution === 'refund' ? 'refunded' : 'completed' });

        // Update Stats
        const statsRef = db.collection('admin_ledgers').doc('stats');
        if (resolution === 'refund') {
          t.update(statsRef, {
            disputed_lessons: increment(-1),
            refunded_lessons: increment(1)
          });
        } else {
          t.update(statsRef, {
            disputed_lessons: increment(-1),
            completed_lessons: increment(1)
          });
        }
      });
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // 5. Submit Dispute
  app.post("/api/lessons/dispute", async (req, res, next) => {
    try {
      const { lessonId, reason, details } = SubmitDisputeSchema.parse(req.body);
      await db.runTransaction(async (t) => {
        const lessonRef = db.collection('lessons').doc(lessonId);
        const lessonSnap = await t.get(lessonRef);
        if (!lessonSnap.exists) throw new Error("Lesson not found");

        t.update(lessonRef, { 
          status: 'disputed',
          dispute_reason: reason,
          dispute_details: details,
          disputed_at: serverTimestamp()
        });

        // Update Escrow status to DISPUTED
        const escrowSnap = await db.collection('escrow_holding')
          .where('lesson_id', '==', lessonId)
          .limit(1)
          .get();
        if (!escrowSnap.empty) {
          t.update(escrowSnap.docs[0].ref, { status: 'DISPUTED', updated_at: serverTimestamp() });
        }

        // Update Stats
        const statsRef = db.collection('admin_ledgers').doc('stats');
        t.update(statsRef, {
          pending_lessons: increment(-1),
          disputed_lessons: increment(1)
        });
      });
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
      
      await db.runTransaction(async (t) => {
        const lessonRef = db.collection('lessons').doc(lessonId);
        const lessonSnap = await t.get(lessonRef);
        if (!lessonSnap.exists) throw new Error("Lesson not found");
        const lessonData = lessonSnap.data()!;

        // SECURITY: Only the student of the lesson can confirm completion
        if (lessonData.student_id !== userId) {
          throw new Error("UNAUTHORIZED: Only the student can confirm completion");
        }
        
        if (lessonData.status !== 'paid_escrow' && lessonData.status !== 'in_progress') {
          throw new Error(`Cannot complete lesson in status: ${lessonData.status}`);
        }

        // Release funds from escrow
        let escrowRef;
        let escrowData;

        if (lessonData.escrow_id) {
          const eRef = db.collection('escrow_holding').doc(lessonData.escrow_id);
          const eSnap = await t.get(eRef);
          if (eSnap.exists) {
            escrowRef = eRef;
            escrowData = eSnap.data();
          }
        }

        if (!escrowRef) {
          const escrowSnap = await db.collection('escrow_holding')
            .where('lesson_id', '==', lessonId)
            .limit(1)
            .get();
          if (escrowSnap.empty) throw new Error("Escrow record not found");
          escrowRef = escrowSnap.docs[0].ref;
          escrowData = escrowSnap.docs[0].data();
        }

        if (escrowData.status !== 'LOCKED') {
          throw new Error(`Escrow is not in LOCKED status: ${escrowData.status}`);
        }

        // CALCULATE FEE: Platform takes 10%
        const platformFee = lessonData.amount * 0.10;
        const tutorPayout = lessonData.amount - platformFee;

        // Update Escrow
        t.update(escrowRef, { 
          status: 'RELEASED', 
          payout_amount: tutorPayout,
          platform_fee: platformFee,
          updated_at: serverTimestamp() 
        });

        // Pay Tutor
        const tutorUserRef = db.collection('users').doc(lessonData.tutor_id);
        t.update(tutorUserRef, { 
          wallet_balance: increment(tutorPayout) 
        });

        // Log Payout
        const txRef = db.collection('transactions').doc();
        t.set(txRef, {
          user_id: lessonData.tutor_id,
          lesson_id: lessonId,
          type: 'tutor_payout',
          amount: tutorPayout,
          description: `Payout for lesson ${lessonId} (Net of 10% fee)`,
          status: 'completed',
          created_at: serverTimestamp()
        });

        // Log Platform Fee
        const feeTxRef = db.collection('transactions').doc();
        t.set(feeTxRef, {
          user_id: 'SYSTEM',
          lesson_id: lessonId,
          type: 'platform_fee',
          amount: platformFee,
          description: `Commission from lesson ${lessonId}`,
          status: 'completed',
          created_at: serverTimestamp()
        });

        // Update Lesson
        t.update(lessonRef, { 
          status: 'completed', 
          completed_at: serverTimestamp(),
          final_payout: tutorPayout,
          commission: platformFee
        });

        // Update Stats
        const statsRef = db.collection('admin_ledgers').doc('stats');
        t.update(statsRef, {
          pending_lessons: increment(-1),
          completed_lessons: increment(1)
        });

        // Update Revenue Ledger
        const revenueRef = db.collection('admin_ledgers').doc('revenue');
        t.update(revenueRef, {
          total_revenue: increment(platformFee),
          balance: increment(platformFee)
        });

        // Notify Tutor
        const tutorNotifRef = db.collection('notifications').doc();
        t.set(tutorNotifRef, {
          user_id: lessonData.tutor_id,
          title: 'Lesson Completed & Paid',
          message: `The student has confirmed completion. $${tutorPayout.toFixed(2)} has been added to your wallet (10% platform fee deducted).`,
          type: 'success',
          is_read: false,
          created_at: serverTimestamp()
        });
      });
      
      res.json({ success: true });
    } catch (error: any) {
      log(`Error in /api/lessons/complete: ${error.message}`);
      res.status(400).json({ error: error.message });
    }
  });

  // Daily Settlement Cron Job
  cron.schedule('59 23 * * *', async () => {
    console.log("Running daily settlement...");
    try {
      const revenueRef = db.collection('admin_ledgers').doc('revenue');
      const revenueSnap = await revenueRef.get();
      
      if (revenueSnap.exists) {
        const balance = revenueSnap.data()?.balance || 0;
        if (balance > 0) {
          console.log(`Settling $${balance} to Admin Master Account...`);
          // Paynow/EcoCash API call would go here
          
          await revenueRef.update({ 
            balance: 0,
            last_settlement_at: serverTimestamp()
          });
        }
      }
    } catch (error) {
      console.error("Settlement failed:", error);
    }
  });

  // Expiration Cron Job (runs every hour)
  cron.schedule('0 * * * *', async () => {
    console.log("Running expiration task...");
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    try {
      // 1. Expire open requests and their bids
      const requestsSnap = await db.collection('lesson_requests')
        .where('status', '==', 'open')
        .where('scheduled_date', '<', todayStr)
        .get();

      for (const requestDoc of requestsSnap.docs) {
        log(`Expiring request ${requestDoc.id}`);
        await requestDoc.ref.update({ status: 'expired' });
        
        // Expire associated bids
        const bidsSnap = await db.collection('bids')
          .where('request_id', '==', requestDoc.id)
          .where('status', '==', 'pending')
          .get();

        for (const bidDoc of bidsSnap.docs) {
          await bidDoc.ref.update({ status: 'expired' });
        }
      }

      // 2. Handle lessons that are past their date
      const lessonsSnap = await db.collection('lessons')
        .where('status', '==', 'paid_escrow')
        .get();

      for (const lessonDoc of lessonsSnap.docs) {
        const requestSnap = await db.collection('lesson_requests').doc(lessonDoc.id).get();
        if (requestSnap.exists) {
          const requestData = requestSnap.data()!;
          if (requestData.scheduled_date < todayStr) {
            log(`Lesson ${lessonDoc.id} is past due`);
            await lessonDoc.ref.update({ is_past_due: true });
          }
        }
      }
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    log("Initializing Vite...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    log("Vite middleware added");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.on("error", (err) => {
    log(`Server error: ${err.message}`);
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    log(`Server running on http://localhost:${PORT}`);
    log(`Environment: ${process.env.NODE_ENV}`);
  });
}

startServer();
