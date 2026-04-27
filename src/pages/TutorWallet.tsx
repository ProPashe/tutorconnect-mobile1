import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  ChevronLeft,
  History,
  ShieldCheck,
  Zap,
  Smartphone,
  Plus,
  Trophy
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import toast from 'react-hot-toast';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import TopUpModal from '../components/TopUpModal';

export default function TutorWallet() {
  const { user, profile, tutorProfile, refreshProfile } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [escrowBalance, setEscrowBalance] = useState(0);
  const [pendingSettlements, setPendingSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [filter, setFilter] = useState<'all' | 'top_up' | 'tutor_payout' | 'fee'>('all');
  const [isRequestingPayout, setIsRequestingPayout] = useState(false);

  // Chart Data preparation
  const chartData = Array.from({ length: 7 }).map((_, i) => {
    const date = subDays(new Date(), 6 - i);
    const dateStr = format(date, 'MMM dd');
    const dayEarnings = transactions
      .filter(tx => tx.type === 'tutor_payout' && tx.created_at && format(tx.created_at.toDate(), 'MMM dd') === dateStr)
      .reduce((acc, tx) => acc + (tx.amount || 0), 0);
    return { name: dateStr, earnings: dayEarnings };
  });

  useEffect(() => {
    if (!user) return;

    // Fetch Transactions
    const txQ = query(
      collection(db, 'transactions'),
      where('user_id', '==', user.uid),
      orderBy('created_at', 'desc')
    );

    const unsubscribeTx = onSnapshot(txQ, (snap) => {
      setTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    // Fetch Escrow Balance
    const escrowQ = query(
      collection(db, 'escrow_holding'),
      where('tutor_id', '==', user.uid),
      where('status', '==', 'LOCKED')
    );

    const unsubscribeEscrow = onSnapshot(escrowQ, (snap) => {
      const total = snap.docs.reduce((acc, doc) => acc + (doc.data().amount || 0), 0);
      setEscrowBalance(total);
    });

    // Fetch Pending Settlements (Lessons in progress or paid_escrow that can be claimed)
    const settlementsQ = query(
      collection(db, 'lessons'),
      where('tutor_id', '==', user.uid),
      where('status', 'in', ['paid_escrow', 'in_progress'])
    );

    const unsubscribeSettlements = onSnapshot(settlementsQ, (snap) => {
      setPendingSettlements(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribeTx();
      unsubscribeEscrow();
      unsubscribeSettlements();
    };
  }, [user]);

  const handleClaimPayout = async (lessonId: string) => {
    if (!window.confirm('Confirm that this lesson is complete? This will release the funds to your wallet.')) return;
    
    try {
      const response = await fetch('/api/lessons/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId,
          userId: user?.uid
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to claim payout");
      }

      toast.success("Lesson completed! Funds have been added to your wallet.", {
        icon: '💰',
        duration: 4000
      });
      refreshProfile();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleTopUp = () => {
    setShowTopUpModal(true);
  };

  const handleRequestPayout = async () => {
    if (!profile?.wallet_balance || profile.wallet_balance < 10) {
      return toast.error('Minimum payout is $10.00');
    }

    if (!tutorProfile?.payout_method || !tutorProfile?.payout_details) {
      return toast.error('Please configure your payout details in Profile settings first.');
    }

    setIsRequestingPayout(true);
    const tid = toast.loading('Processing payout request...');
    try {
      // In a real app, this would hit /api/payouts/request
      const response = await fetch('/api/payouts/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.uid,
          amount: profile.wallet_balance,
          method: tutorProfile.payout_method,
          details: tutorProfile.payout_details
        })
      });

      if (!response.ok) throw new Error('Payout request failed');
      
      toast.success('Payout request submitted! Expect funds in 1-2 business days.', { id: tid });
      refreshProfile();
    } catch (e) {
      toast.error('Payout failed. Our team has been notified.', { id: tid });
    } finally {
      setIsRequestingPayout(false);
    }
  };

  const filteredTransactions = transactions.filter(tx => {
    if (filter === 'all') return true;
    if (filter === 'top_up') return tx.type === 'top_up';
    if (filter === 'tutor_payout') return tx.type === 'tutor_payout';
    if (filter === 'fee') return ['bid_fee', 'platform_fee'].includes(tx.type);
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Header & Vibrant Balance Card */}
      <div className="bg-[#001F3F] text-white p-6 pb-32 rounded-b-[3.5rem] shadow-2xl relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-[-20%] left-[-10%] w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
        
        <div className="max-w-md mx-auto relative z-10 space-y-8">
          <div className="flex items-center justify-between">
            <Link to="/dashboard" className="p-2 bg-white/10 rounded-2xl hover:bg-white/20 transition-all backdrop-blur-md">
              <ChevronLeft className="w-6 h-6" />
            </Link>
            <h1 className="text-lg font-black uppercase tracking-[0.2em]">Tutor Wallet</h1>
            <button className="p-2 bg-white/10 rounded-2xl hover:bg-white/20 transition-all backdrop-blur-md">
              <History className="w-6 h-6" />
            </button>
          </div>

          <div className="text-center space-y-4">
            <div className="inline-block relative">
              <p className="text-emerald-400 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Total Earnings To Date</p>
              <div className="text-6xl font-black tracking-tighter flex items-center justify-center gap-2">
                <span className="text-emerald-500 text-4xl mt-2">$</span>
                {profile?.total_earned?.toFixed(2) || (profile?.wallet_balance || 0).toFixed(2)}
              </div>
            </div>
            
            <div className="h-40 w-full mt-6 opacity-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="earnings" stroke="#10b981" fillOpacity={1} fill="url(#colorEarnings)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Stats & Actions */}
      <div className="max-w-md mx-auto px-6 -mt-16 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <motion.div 
            whileHover={{ y: -5 }}
            className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 space-y-3"
          >
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center">
              <Wallet className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Available</p>
              <p className="text-2xl font-black text-[#001F3F] tracking-tight">${profile?.wallet_balance?.toFixed(2) || '0.00'}</p>
            </div>
          </motion.div>
          
          <motion.div 
            whileHover={{ y: -5 }}
            className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 space-y-3"
          >
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">In Escrow</p>
              <p className="text-2xl font-black text-[#001F3F] tracking-tight">${escrowBalance.toFixed(2)}</p>
            </div>
          </motion.div>
        </div>

        {/* Pro Payout Card */}
        <div className="bg-gradient-to-br from-indigo-900 to-zim-navy p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:rotate-12 transition-transform">
            <Zap className="w-24 h-24 text-white" />
          </div>
          <div className="relative space-y-6">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <h3 className="text-emerald-400 font-black text-xs uppercase tracking-[0.2em]">Settlement Balance</h3>
                <div className="text-4xl font-black text-white">${profile?.wallet_balance?.toFixed(2)}</div>
              </div>
              <div className="bg-white/10 px-3 py-1 rounded-full text-[10px] font-bold text-white/60">
                Next Payout: Instant
              </div>
            </div>

            <button 
              onClick={handleRequestPayout}
              disabled={isRequestingPayout || (profile?.wallet_balance || 0) < 10}
              className="w-full py-5 bg-emerald-500 text-white rounded-2xl font-black text-lg shadow-xl shadow-emerald-900/40 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
            >
              Request Bank Transfer
            </button>
            <p className="text-[10px] text-white/40 text-center font-bold uppercase tracking-widest leading-relaxed">
              Min. Payout $10.00 • Transfers processed via Paynow/Bank
            </p>
          </div>
        </div>

        {/* Top Up Button */}
        <motion.button 
          whileTap={{ scale: 0.95 }}
          onClick={handleTopUp}
          className="w-full bg-student-green text-white p-6 rounded-[2.5rem] font-black text-lg flex items-center justify-center gap-3 shadow-2xl shadow-green-500/30 hover:opacity-90 transition-all group"
        >
          <Smartphone className="w-7 h-7 group-hover:rotate-12 transition-transform" />
          Top Up Wallet (Paynow)
          <Plus className="w-6 h-6 ml-auto opacity-50" />
        </motion.button>

        {/* Pending Settlements */}
        {pendingSettlements.length > 0 && (
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xs font-black text-[#001F3F] uppercase tracking-[0.2em]">Pending Settlements</h2>
              <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full text-[10px] font-black">
                {pendingSettlements.length}
              </span>
            </div>
            <div className="space-y-3">
              {pendingSettlements.map((lesson) => (
                <motion.div 
                  key={lesson.id}
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-white p-5 rounded-[2rem] border border-blue-100 shadow-lg shadow-blue-500/5 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                      <Clock className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-[#001F3F] tracking-tight">{lesson.topic || 'Lesson'}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        ${lesson.amount?.toFixed(2)} • {lesson.status.replace('_', ' ')}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleClaimPayout(lesson.id)}
                    className="px-4 py-2 bg-[#001F3F] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-900 transition-all shadow-lg shadow-blue-100"
                  >
                    Confirm Completion
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Transaction History */}
        <div className="space-y-6 pt-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xs font-black text-[#001F3F] uppercase tracking-[0.2em]">Transaction History</h2>
          </div>

          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-2">
            {[
              { id: 'all', label: 'All' },
              { id: 'top_up', label: 'Top-ups' },
              { id: 'tutor_payout', label: 'Payouts' },
              { id: 'fee', label: 'Fees' }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as any)}
                className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border-2 whitespace-nowrap ${
                  filter === f.id 
                    ? 'bg-[#001F3F] text-white border-[#001F3F]' 
                    : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {loading ? (
              [1, 2, 3].map(i => (
                <div key={i} className="bg-white p-5 rounded-[2rem] border border-slate-100 animate-pulse flex gap-4">
                  <div className="w-14 h-14 bg-slate-100 rounded-2xl" />
                  <div className="flex-1 space-y-3 py-1">
                    <div className="h-4 bg-slate-100 rounded w-3/4" />
                    <div className="h-3 bg-slate-100 rounded w-1/2" />
                  </div>
                </div>
              ))
            ) : filteredTransactions.length > 0 ? (
              filteredTransactions.map((tx, idx) => (
                <motion.div 
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  key={tx.id} 
                  className="bg-white p-5 rounded-[2rem] border border-slate-100 flex items-center gap-4 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-500/5 transition-all group"
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 ${
                    ['tutor_payout', 'top_up', 'referral_reward'].includes(tx.type) ? 'bg-emerald-50 text-emerald-600' : 
                    ['bid_fee', 'platform_fee'].includes(tx.type) ? 'bg-amber-50 text-amber-600' : 
                    'bg-blue-50 text-blue-600'
                  }`}>
                    {['tutor_payout', 'top_up', 'referral_reward'].includes(tx.type) ? <ArrowUpRight className="w-7 h-7" /> : 
                     ['bid_fee', 'platform_fee'].includes(tx.type) ? <Zap className="w-7 h-7" /> : 
                     <ArrowDownLeft className="w-7 h-7" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-black text-[#001F3F] truncate tracking-tight">{tx.description}</p>
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest border ${
                        tx.status === 'completed' || tx.status === 'success' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                        tx.status === 'pending' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                        'bg-slate-500/10 text-slate-500 border-slate-500/20'
                      }`}>
                        {tx.status || 'Completed'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        {tx.type?.replace('_', ' ') || 'Transaction'}
                      </span>
                      <span className="text-slate-300">•</span>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {tx.created_at ? format(tx.created_at.toDate(), 'MMM dd • HH:mm') : 'Processing...'}
                      </p>
                    </div>
                  </div>
                  <div className={`text-right font-black text-lg tracking-tighter ${
                    ['tutor_payout', 'top_up', 'referral_reward'].includes(tx.type) ? 'text-emerald-600' : 'text-slate-400'
                  }`}>
                    {['tutor_payout', 'top_up', 'referral_reward'].includes(tx.type) ? '+' : '-'}
                    ${tx.amount?.toFixed(2) || '0.00'}
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-16 space-y-4 bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                  <History className="w-10 h-10 text-slate-200" />
                </div>
                <p className="text-slate-400 text-sm font-bold italic tracking-tight">No {filter !== 'all' ? filter.replace('_', ' ') : ''} transactions yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <TopUpModal 
        isOpen={showTopUpModal}
        onClose={() => setShowTopUpModal(false)}
        userId={user?.uid || ''}
        userEmail={user?.email || ''}
      />

      <style>{`
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient {
          background-size: 200% auto;
          animation: gradient 3s linear infinite;
        }
      `}</style>
    </div>
  );
}
