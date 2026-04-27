import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy, 
  limit, 
  doc, 
  getDoc,
  getDocs,
  updateDoc,
  where
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  DollarSign, 
  ShieldCheck, 
  Users, 
  Clock, 
  AlertCircle, 
  ArrowUpRight, 
  ArrowLeft,
  ArrowDownLeft, 
  TrendingUp,
  Activity,
  ChevronRight,
  CheckCircle2,
  XCircle,
  RefreshCcw,
  Wallet,
  Star,
  LayoutDashboard
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AdminFinancialDashboard() {
  const navigate = useNavigate();
  const { setActiveRole } = useAuth();
  const [activeTab, setActiveTab] = useState<'finance' | 'tutors'>('finance');
  const [revenueLedger, setRevenueLedger] = useState<any>(null);
  const [marketingLedger, setMarketingLedger] = useState<any>(null);
  const [escrowBalance, setEscrowBalance] = useState(0);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [liveFeed, setLiveFeed] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState('');

  // Tutor Management State
  const [tutorQueue, setTutorQueue] = useState<any[]>([]);
  const [activeTutors, setActiveTutors] = useState<any[]>([]);
  const [filterSubject, setFilterSubject] = useState('all');
  const [filterRating, setFilterRating] = useState(0);
  const [banTarget, setBanTarget] = useState<any>(null);
  const [banReason, setBanReason] = useState('');

  useEffect(() => {
    // 1. Fetch Ledgers
    const unsubRevenue = onSnapshot(doc(db, 'admin_ledgers', 'revenue'), (snap) => {
      setRevenueLedger(snap.data());
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'admin_ledgers/revenue');
    });

    const unsubMarketing = onSnapshot(doc(db, 'admin_ledgers', 'marketing'), (snap) => {
      setMarketingLedger(snap.data());
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'admin_ledgers/marketing');
    });

    // 2. Fetch Escrow Balance
    const escrowQ = query(
      collection(db, 'escrow_holding'),
      where('status', 'in', ['LOCKED', 'DISPUTED'])
    );
    const unsubEscrow = onSnapshot(escrowQ, (snap) => {
      const total = snap.docs.reduce((acc, doc) => acc + (doc.data().amount || 0), 0);
      setEscrowBalance(total);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'escrow_holding');
    });

    // 3. Fetch Active Disputes
    const disputesQ = query(
      collection(db, 'escrow_holding'),
      where('status', '==', 'DISPUTED')
    );
    const unsubDisputes = onSnapshot(disputesQ, (snap) => {
      setDisputes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'escrow_holding/disputes');
    });

    // 4. Fetch Live Feed (Transactions)
    const feedQ = query(
      collection(db, 'transactions'),
      orderBy('created_at', 'desc'),
      limit(20)
    );
    const unsubFeed = onSnapshot(feedQ, (snap) => {
      setLiveFeed(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'transactions');
    });

    // 5. Fetch Tutor Queue (Unverified)
    const queueQ = query(
      collection(db, 'tutor_profiles'),
      where('is_verified', '==', false)
    );
    const unsubQueue = onSnapshot(queueQ, async (snap) => {
      const tutors = await Promise.all(snap.docs.map(async (d) => {
        const userSnap = await getDoc(doc(db, 'users', d.id));
        return { id: d.id, ...d.data(), ...userSnap.data() };
      }));
      setTutorQueue(tutors);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'tutor_profiles/queue');
    });

    // 6. Fetch Active Tutors (Verified)
    const activeQ = query(
      collection(db, 'tutor_profiles'),
      where('is_verified', '==', true)
    );
    const unsubActive = onSnapshot(activeQ, async (snap) => {
      const tutors = await Promise.all(snap.docs.map(async (d) => {
        const userSnap = await getDoc(doc(db, 'users', d.id));
        // Fetch dispute count for each tutor
        const disputeSnap = await getDocs(query(
          collection(db, 'escrow_holding'),
          where('tutor_id', '==', d.id),
          where('status', '==', 'REFUNDED') // Assuming REFUNDED means a lost dispute/no-show
        ));
        return { 
          id: d.id, 
          ...d.data(), 
          ...userSnap.data(),
          dispute_count: disputeSnap.size 
        };
      }));
      setActiveTutors(tutors);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'tutor_profiles/active');
    });

    // 7. Settlement Timer
    const timer = setInterval(() => {
      const now = new Date();
      const settlement = new Date();
      settlement.setHours(23, 59, 0, 0);
      
      if (now > settlement) {
        settlement.setDate(settlement.getDate() + 1);
      }
      
      const diff = settlement.getTime() - now.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setTimeLeft(`${hours}h ${minutes}m`);
    }, 1000);

    return () => {
      unsubRevenue();
      unsubMarketing();
      unsubEscrow();
      unsubDisputes();
      unsubFeed();
      unsubQueue();
      unsubActive();
      clearInterval(timer);
    };
  }, []);

  const resolveDispute = async (escrowId: string, lessonId: string, resolution: 'refund' | 'pay') => {
    try {
      const response = await fetch('/api/lessons/resolve-dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId, resolution })
      });
      if (response.ok) {
        toast.success(`Dispute resolved: ${resolution === 'refund' ? 'Refunded Student' : 'Paid Tutor'}`);
      } else {
        throw new Error('Failed to resolve dispute');
      }
    } catch (error) {
      toast.error('Error resolving dispute');
    }
  };

  const verifyTutor = async (tutorId: string) => {
    try {
      await updateDoc(doc(db, 'tutor_profiles', tutorId), { 
        is_verified: true,
        verification_score: 100,
        'verification_status.id': 'verified',
        'verification_status.certificates': 'verified'
      });
      toast.success('Tutor verified successfully');
    } catch (error) {
      toast.error('Verification failed');
    }
  };

  const executeBan = async () => {
    if (!banTarget || !banReason.trim()) {
      toast.error('Please provide a reason for the ban');
      return;
    }
    try {
      await updateDoc(doc(db, 'tutor_profiles', banTarget.id), { 
        is_verified: false,
        ban_reason: banReason,
        banned_at: new Date()
      });
      await updateDoc(doc(db, 'users', banTarget.id), { role: 'banned' });
      toast.success('Tutor has been banned');
      setBanTarget(null);
      setBanReason('');
    } catch (error) {
      toast.error('Failed to ban tutor');
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] flex">
      {/* Sidebar */}
      <div className="w-72 bg-[#0f172a] border-r border-slate-800 flex flex-col p-6 space-y-8 relative z-20">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-black text-white tracking-tight">Admin OS</span>
        </div>

        <nav className="space-y-2">
          <SidebarLink 
            active={activeTab === 'finance'} 
            onClick={() => setActiveTab('finance')}
            icon={<Wallet className="w-5 h-5" />}
            label="Financial Command"
          />
          <SidebarLink 
            active={activeTab === 'tutors'} 
            onClick={() => setActiveTab('tutors')}
            icon={<Activity className="w-5 h-5" />}
            label="Verification Queue"
          />
          <SidebarLink 
            active={false} 
            onClick={() => navigate('/admin/users')}
            icon={<LayoutDashboard className="w-5 h-5" />}
            label="Platform Control"
          />

          <div className="pt-4 border-t border-slate-800 mt-4 space-y-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-4 mb-2">Switch Persona</p>
            <button
              onClick={() => {
                setActiveRole('student');
                navigate('/dashboard');
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
            >
              <div className="w-2 h-2 bg-student-green rounded-full" />
              <span className="text-sm font-bold uppercase tracking-widest">Student View</span>
            </button>
            <button
              onClick={() => {
                setActiveRole('tutor');
                navigate('/dashboard');
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
            >
              <div className="w-2 h-2 bg-tutor-blue rounded-full" />
              <span className="text-sm font-bold uppercase tracking-widest">Tutor View</span>
            </button>
          </div>

          <div className="pt-4 border-t border-slate-800 mt-4">
            <SidebarLink 
              active={false} 
              onClick={() => navigate('/dashboard')}
              icon={<ArrowLeft className="w-5 h-5" />}
              label="Back to Dashboard"
            />
          </div>
        </nav>

        <div className="mt-auto p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Activity className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">System Load</p>
              <p className="text-xs font-bold text-white">Optimal (12ms)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative overflow-hidden flex flex-col">
        {/* Network Background Pattern */}
        <div className="absolute inset-0 opacity-5 pointer-events-none">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-blue-500/10" />
        </div>

        {/* Directional Lighting */}
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-emerald-500/5 rounded-full blur-[120px] -mr-96 -mt-96 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[100px] -ml-72 -mb-72 pointer-events-none" />

        <div className="flex-1 overflow-y-auto p-10 relative z-10">
          <AnimatePresence mode="wait">
            {activeTab === 'finance' ? (
              <motion.div 
                key="finance"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-4xl font-black text-white tracking-tight">Financial Command Center</h1>
                    <p className="text-slate-400 font-medium mt-1">Real-time monitoring of TutorConnect economy</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="bg-slate-900 px-6 py-3 rounded-2xl border border-slate-800 shadow-xl flex items-center gap-3">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                      <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Live Node: Bulawayo-HQ</span>
                    </div>
                  </div>
                </div>

                {/* Hero Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <MetricCard 
                    title="Today's Total Revenue" 
                    value={`$${revenueLedger?.balance?.toFixed(2) || '0.00'}`}
                    subtitle="From $0.50 Bid Fees"
                    icon={<DollarSign className="w-6 h-6 text-emerald-400" />}
                    color="emerald"
                    trend="+12.5% from yesterday"
                  />
                  <MetricCard 
                    title="Funds Locked in Escrow" 
                    value={`$${escrowBalance.toFixed(2)}`}
                    subtitle="Active Lesson Protection"
                    icon={<ShieldCheck className="w-6 h-6 text-blue-400" />}
                    color="blue"
                    trend="42 Active Escrows"
                  />
                  <MetricCard 
                    title="Total Referral Payouts" 
                    value={`$${Math.abs(marketingLedger?.balance || 0).toFixed(2)}`}
                    subtitle="Marketing Budget Used"
                    icon={<Users className="w-6 h-6 text-amber-400" />}
                    color="amber"
                    trend={`${Math.floor(Math.abs(marketingLedger?.balance || 0) / 0.5)} Rewards Paid`}
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-8 space-y-8">
                    <div className="bg-[#0f172a] rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl border border-slate-800">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full -mr-32 -mt-32 blur-3xl" />
                      <div className="relative z-10 flex items-center justify-between">
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center backdrop-blur-md border border-white/10">
                              <Clock className="w-6 h-6 text-emerald-400" />
                            </div>
                            <h3 className="text-xl font-bold">Daily Settlement Engine</h3>
                          </div>
                          <p className="text-slate-400 max-w-md">
                            Automated payout of all collected fees to the Master Bank Account occurs daily at 23:59.
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-emerald-400 text-xs font-black uppercase tracking-[0.3em] mb-2">Next Settlement In</p>
                          <div className="text-5xl font-black tracking-tighter tabular-nums">
                            {timeLeft}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#0f172a] rounded-[2.5rem] border border-slate-800 shadow-2xl overflow-hidden">
                      <div className="p-8 border-b border-slate-800 flex items-center justify-between bg-red-500/5">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center border border-red-500/20">
                            <AlertCircle className="w-7 h-7 text-red-500" />
                          </div>
                          <div>
                            <h3 className="text-xl font-black text-white">Active Escrow Disputes</h3>
                            <p className="text-sm font-bold text-red-500 uppercase tracking-widest">Action Required</p>
                          </div>
                        </div>
                        <div className="bg-red-500/10 text-red-500 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest border border-red-500/20">
                          {disputes.length} Pending
                        </div>
                      </div>
                      <div className="divide-y divide-slate-800">
                        {disputes.length === 0 ? (
                          <div className="p-16 text-center space-y-4">
                            <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mx-auto border border-slate-800">
                              <CheckCircle2 className="w-10 h-10 text-slate-700" />
                            </div>
                            <p className="text-slate-500 font-bold italic">All disputes resolved. System clear.</p>
                          </div>
                        ) : (
                          disputes.map((dispute) => (
                            <div key={dispute.id} className="p-8 flex items-center justify-between hover:bg-slate-900/50 transition-all group">
                              <div className="flex items-center gap-6">
                                <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center border border-slate-800 group-hover:scale-110 transition-transform">
                                  <ShieldCheck className="w-8 h-8 text-slate-500" />
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-3">
                                    <span className="text-lg font-black text-white">Escrow #{dispute.id.slice(-6)}</span>
                                    <span className="text-xs font-black bg-red-500/10 text-red-500 px-2 py-1 rounded uppercase border border-red-500/20">Disputed</span>
                                  </div>
                                  <p className="text-sm font-medium text-slate-400">
                                    Amount: <span className="font-bold text-white">${dispute.amount.toFixed(2)}</span> • 
                                    Reason: <span className="font-bold text-red-500">{dispute.dispute_reason || 'Not specified'}</span>
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <button 
                                  onClick={() => resolveDispute(dispute.id, dispute.lesson_id, 'refund')}
                                  className="px-6 py-3 bg-red-500 text-white rounded-xl font-black text-sm shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all flex items-center gap-2"
                                >
                                  <XCircle className="w-4 h-4" />
                                  Approve Refund
                                </button>
                                <button 
                                  onClick={() => resolveDispute(dispute.id, dispute.lesson_id, 'pay')}
                                  className="px-6 py-3 bg-white text-[#0f172a] rounded-xl font-black text-sm shadow-lg hover:bg-slate-100 transition-all flex items-center gap-2"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  Release to Tutor
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-4">
                    <div className="bg-[#0f172a] rounded-[2.5rem] border border-slate-800 shadow-2xl overflow-hidden h-full flex flex-col">
                      <div className="p-8 border-b border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Activity className="w-6 h-6 text-emerald-500" />
                          <h3 className="text-xl font-black text-white">Live Feed</h3>
                        </div>
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        <AnimatePresence initial={false}>
                          {liveFeed.map((tx, idx) => (
                            <motion.div
                              key={tx.id}
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              className="p-5 rounded-3xl border border-slate-800 bg-slate-900/50 hover:bg-slate-900 hover:shadow-xl transition-all group"
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                                  tx.type === 'top_up' ? 'bg-emerald-500/10 text-emerald-500' :
                                  tx.type === 'referral_reward' ? 'bg-amber-500/10 text-amber-500' :
                                  tx.type === 'bid_fee' ? 'bg-blue-500/10 text-blue-500' :
                                  'bg-slate-800 text-slate-400'
                                }`}>
                                  {tx.type === 'top_up' ? <ArrowUpRight className="w-6 h-6" /> :
                                   tx.type === 'referral_reward' ? <Users className="w-6 h-6" /> :
                                   tx.type === 'bid_fee' ? <DollarSign className="w-6 h-6" /> :
                                   <TrendingUp className="w-6 h-6" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-black text-white truncate tracking-tight group-hover:text-emerald-400 transition-colors">
                                    {tx.description}
                                  </p>
                                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                                    {tx.created_at ? formatDistanceToNow(tx.created_at.toDate(), { addSuffix: true }) : 'Just now'}
                                  </p>
                                </div>
                                <div className={`text-right font-black tracking-tighter ${
                                  tx.type === 'top_up' || tx.type === 'tutor_payout' ? 'text-emerald-500' : 'text-slate-500'
                                }`}>
                                  {tx.type === 'top_up' || tx.type === 'tutor_payout' ? '+' : '-'}${tx.amount.toFixed(2)}
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="tutors"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-10"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-4xl font-black text-white tracking-tight">User Management</h1>
                    <p className="text-slate-400 font-medium mt-1">Tutor Profiles & 3-Layer Verification Stack</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="bg-slate-900 px-4 py-2 rounded-xl border border-slate-800 flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Region: Bulawayo</span>
                    </div>
                  </div>
                </div>

                {/* Section 1: Tutor Registration Queue */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-amber-500" />
                      <h2 className="text-xl font-black text-white tracking-tight">Tutor Registration Queue</h2>
                    </div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{tutorQueue.length} Pending Review</span>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {tutorQueue.map((tutor) => (
                      <div key={tutor.id} className="bg-[#0f172a] p-6 rounded-[2rem] border border-slate-800 shadow-xl flex items-center justify-between group hover:border-emerald-500/30 transition-all">
                        <div className="flex items-center gap-6">
                          <div className="w-16 h-16 rounded-2xl bg-slate-800 overflow-hidden border border-slate-700">
                            <img src={tutor.photo_url || `https://picsum.photos/seed/${tutor.id}/100/100`} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <h3 className="text-lg font-bold text-white">{tutor.full_name}</h3>
                              <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest ${
                                tutor.verification_score >= 60 ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                              }`}>
                                {tutor.verification_score >= 60 ? 'AI Match Success' : 'Needs Manual ID Check'}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                              <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> ID Uploaded</span>
                              <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Degree Cert</span>
                              <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Biometric Match: {tutor.verification_score}%</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-700 transition-all">
                            View Details
                          </button>
                          <button 
                            onClick={() => verifyTutor(tutor.id)}
                            className="px-6 py-3 bg-emerald-500 text-white rounded-xl font-black text-sm shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all"
                          >
                            Manually Verify ID
                          </button>
                        </div>
                      </div>
                    ))}
                    {tutorQueue.length === 0 && (
                      <div className="p-12 text-center bg-slate-900/30 rounded-[2rem] border border-dashed border-slate-800">
                        <p className="text-slate-500 font-medium italic">Queue is empty. All tutors processed.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 2: Active Tutor Performance */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-5 h-5 text-emerald-500" />
                      <h2 className="text-xl font-black text-white tracking-tight">Active Tutor Performance</h2>
                    </div>
                    <div className="flex items-center gap-4">
                      <select 
                        value={filterSubject}
                        onChange={(e) => setFilterSubject(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-slate-400 text-xs font-bold rounded-xl px-4 py-2 outline-none focus:border-emerald-500/50"
                      >
                        <option value="all">All Subjects</option>
                        <option value="ZIMSEC">ZIMSEC</option>
                        <option value="Cambridge">Cambridge</option>
                      </select>
                      <select 
                        value={filterRating}
                        onChange={(e) => setFilterRating(Number(e.target.value))}
                        className="bg-slate-900 border border-slate-800 text-slate-400 text-xs font-bold rounded-xl px-4 py-2 outline-none focus:border-emerald-500/50"
                      >
                        <option value={0}>All Ratings</option>
                        <option value={4.5}>4.5+ Rating</option>
                      </select>
                    </div>
                  </div>

                  <div className="bg-[#0f172a] rounded-[2.5rem] border border-slate-800 shadow-2xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-900/50 border-b border-slate-800">
                        <tr>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Tutor</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Subject Tags</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Bayesian Rating</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Disputes</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {activeTutors
                          .filter(t => filterSubject === 'all' || t.curriculum === filterSubject || t.curriculum === 'Both')
                          .filter(t => t.avg_rating >= filterRating)
                          .map((tutor) => (
                          <tr key={tutor.id} className="hover:bg-slate-900/50 transition-all group">
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-slate-800 overflow-hidden border border-slate-700">
                                  <img src={tutor.photo_url || `https://picsum.photos/seed/${tutor.id}/100/100`} alt="" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-white">{tutor.full_name}</p>
                                  <p className="text-[10px] font-medium text-slate-500">{tutor.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-6">
                              <div className="flex flex-wrap gap-2">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                                  tutor.curriculum === 'ZIMSEC' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                                  tutor.curriculum === 'Cambridge' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                                  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                } uppercase tracking-widest`}>
                                  {tutor.curriculum}
                                </span>
                              </div>
                            </td>
                            <td className="px-8 py-6 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Star className="w-4 h-4 text-amber-500 fill-current" />
                                <span className="text-sm font-black text-white">{tutor.avg_rating?.toFixed(1) || '5.0'}</span>
                              </div>
                            </td>
                            <td className="px-8 py-6 text-center">
                              <span className={`text-xs font-black ${tutor.dispute_count > 0 ? 'text-red-500' : 'text-slate-500'}`}>
                                {tutor.dispute_count} Reported
                              </span>
                            </td>
                            <td className="px-8 py-6 text-right">
                              <button 
                                onClick={() => setBanTarget(tutor)}
                                className="px-4 py-2 border border-red-500/30 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
                              >
                                Flag / Ban
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Ban Reason Modal */}
      <AnimatePresence>
        {banTarget && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-[#0f172a] w-full max-w-md rounded-[2.5rem] border border-red-500/30 shadow-2xl shadow-red-500/10 overflow-hidden"
            >
              <div className="p-8 border-b border-slate-800 bg-red-500/5 flex items-center gap-4">
                <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center border border-red-500/20">
                  <AlertCircle className="w-7 h-7 text-red-500" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">Ban Tutor</h3>
                  <p className="text-xs font-bold text-red-500 uppercase tracking-widest">Immediate Revocation</p>
                </div>
              </div>

              <div className="p-8 space-y-6">
                <div className="flex items-center gap-4 p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                  <div className="w-12 h-12 rounded-xl bg-slate-800 overflow-hidden border border-slate-700">
                    <img src={banTarget.photo_url || `https://picsum.photos/seed/${banTarget.id}/100/100`} alt="" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{banTarget.full_name}</p>
                    <p className="text-[10px] font-medium text-slate-500">{banTarget.email}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Reason for Ban</label>
                  <textarea 
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    placeholder="e.g. Repeated no-shows, fraudulent certificates, or student harassment..."
                    className="w-full h-32 bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm text-white placeholder:text-slate-600 focus:border-red-500/50 outline-none resize-none transition-all"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => {
                      setBanTarget(null);
                      setBanReason('');
                    }}
                    className="flex-1 py-4 bg-slate-800 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-700 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={executeBan}
                    className="flex-[2] py-4 bg-red-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all"
                  >
                    Confirm Ban
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
      `}</style>
    </div>
  );
}

function SidebarLink({ active, onClick, icon, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all ${
        active 
          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
      }`}
    >
      {icon}
      <span className="text-sm font-bold tracking-tight">{label}</span>
      {active && <ChevronRight className="w-4 h-4 ml-auto" />}
    </button>
  );
}

function MetricCard({ title, value, subtitle, icon, color, trend }: any) {
  const colors: any = {
    emerald: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    amber: 'bg-amber-500/10 text-amber-500 border-amber-500/20'
  };

  return (
    <div className="bg-[#0f172a] p-8 rounded-[2.5rem] border border-slate-800 shadow-2xl space-y-6 hover:scale-[1.02] transition-all cursor-default group">
      <div className="flex items-center justify-between">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${colors[color]}`}>
          {icon}
        </div>
        <div className="text-right">
          <p className="text-xs font-black text-slate-500 uppercase tracking-widest">{title}</p>
          <p className="text-3xl font-black text-white tracking-tighter mt-1">{value}</p>
        </div>
      </div>
      <div className="flex items-center justify-between pt-4 border-t border-slate-800">
        <span className="text-xs font-bold text-slate-500">{subtitle}</span>
        <div className="flex items-center gap-1 text-[10px] font-black text-emerald-500 uppercase tracking-widest">
          <TrendingUp className="w-3 h-3" />
          {trend}
        </div>
      </div>
    </div>
  );
}
