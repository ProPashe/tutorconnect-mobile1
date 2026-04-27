import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  getDocs, 
  updateDoc, 
  doc, 
  setDoc,
  where,
  orderBy,
  limit
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  Users, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle, 
  Ban, 
  LayoutDashboard, 
  Wallet,
  TrendingUp,
  Activity,
  ShieldCheck,
  Star,
  ChevronRight,
  ArrowUpRight,
  ArrowLeft,
  Clock,
  Search,
  Filter,
  MoreVertical,
  Zap,
  Plus,
  Eye,
  FileText,
  CreditCard,
  UserCheck,
  Image,
  GraduationCap,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

import { seedSubjects } from '../lib/seeder';
import { useAuth } from '../contexts/AuthContext';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { setActiveRole } = useAuth();
  const [metrics, setMetrics] = useState({
    totalStudents: 0,
    totalTutors: 0,
    totalGMV: 0,
    revenue: 0,
    totalLessons: 0,
    completedLessons: 0,
    pendingLessons: 0,
    disputedLessons: 0
  });
  const [tutors, setTutors] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedCurriculum, setSelectedCurriculum] = useState('');
  const [selectedRating, setSelectedRating] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreateSubject, setShowCreateSubject] = useState(false);
  const [selectedTutorForDetail, setSelectedTutorForDetail] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;

    // Real-time Metrics from Ledgers
    const unsubStats = onSnapshot(doc(db, 'admin_ledgers', 'stats'), (snap) => {
      if (!isMounted || !snap.exists()) return;
      const data = snap.data();
      setMetrics(prev => ({ 
        ...prev, 
        totalLessons: data.total_lessons || 0,
        completedLessons: data.completed_lessons || 0,
        pendingLessons: data.pending_lessons || 0,
        disputedLessons: data.disputed_lessons || 0
      }));
    }, (error) => {
      if (isMounted) handleFirestoreError(error, OperationType.GET, 'admin_ledgers/stats');
    });

    const unsubRevenue = onSnapshot(doc(db, 'admin_ledgers', 'revenue'), (snap) => {
      if (!isMounted || !snap.exists()) return;
      const data = snap.data();
      setMetrics(prev => ({ 
        ...prev, 
        totalGMV: data.total_gmv || 0,
        revenue: data.total_revenue || 0
      }));
    }, (error) => {
      if (isMounted) handleFirestoreError(error, OperationType.GET, 'admin_ledgers/revenue');
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      if (!isMounted) return;
      const students = snap.docs.filter(d => d.data().role === 'student').length;
      const tutorsCount = snap.docs.filter(d => d.data().role === 'tutor').length;
      setMetrics(prev => ({ ...prev, totalStudents: students, totalTutors: tutorsCount }));
    }, (error) => {
      if (isMounted) handleFirestoreError(error, OperationType.GET, 'users');
    });

    // Tutors with verification status
    const unsubTutors = onSnapshot(collection(db, 'tutor_profiles'), (snap) => {
      if (!isMounted) return;
      setTutors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (error) => {
      if (isMounted) handleFirestoreError(error, OperationType.GET, 'tutor_profiles');
    });

    // Subjects for filtering
    const unsubSubjects = onSnapshot(collection(db, 'subjects'), (snap) => {
      if (!isMounted) return;
      setSubjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      if (isMounted) handleFirestoreError(error, OperationType.GET, 'subjects');
    });

    // Active Disputes
    const disputesQ = query(collection(db, 'lessons'), where('status', '==', 'disputed'));
    const unsubDisputes = onSnapshot(disputesQ, (snap) => {
      if (!isMounted) return;
      setDisputes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      if (isMounted) handleFirestoreError(error, OperationType.GET, 'lessons/disputes');
    });

    // All Bookings (Lessons)
    const unsubBookings = onSnapshot(collection(db, 'lessons'), (snap) => {
      if (!isMounted) return;
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      if (isMounted) handleFirestoreError(error, OperationType.GET, 'lessons');
    });

    return () => {
      isMounted = false;
      unsubStats();
      unsubRevenue();
      unsubUsers();
      unsubTutors();
      unsubSubjects();
      unsubDisputes();
      unsubBookings();
    };
  }, []);

  const toggleTutorStatus = async (tutorId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'tutor_profiles', tutorId), { 
        is_verified: !currentStatus,
        verification_score: !currentStatus ? 100 : 60
      });
      toast.success(`Tutor ${!currentStatus ? 'verified' : 'unverified'}`);
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const resolveDispute = async (lessonId: string, resolution: 'refund' | 'pay') => {
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

  const scrollToTutors = () => {
    const el = document.getElementById('tutor-directory');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
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
            active={activeTab === 'overview'} 
            onClick={() => setActiveTab('overview')}
            icon={<LayoutDashboard className="w-5 h-5" />}
            label="General Overview"
          />
          <SidebarLink 
            active={activeTab === 'bookings'} 
            onClick={() => setActiveTab('bookings')}
            icon={<Clock className="w-5 h-5" />}
            label="Platform Bookings"
          />
          <SidebarLink 
            active={false} 
            onClick={() => navigate('/admin/finance')}
            icon={<Wallet className="w-5 h-5" />}
            label="Financial Command"
          />
          <SidebarLink 
            active={false} 
            onClick={scrollToTutors}
            icon={<Users className="w-5 h-5" />}
            label="Tutor Directory"
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
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">System Status</p>
              <p className="text-xs font-bold text-white">All Nodes Active</p>
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

        <div className="flex-1 overflow-y-auto p-10 relative z-10">
          <div className="max-w-7xl mx-auto space-y-10">
            {activeTab === 'overview' ? (
              <React.Fragment>
                {/* Header */}
                <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-black text-white tracking-tight">System Overview</h1>
                <p className="text-slate-400 font-medium mt-1">Global platform metrics and critical alerts</p>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setShowCreateSubject(true)}
                  className="bg-emerald-500 px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 hover:bg-emerald-600 transition-all text-white"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-sm font-bold uppercase tracking-widest">Add Subject</span>
                </button>
                <button 
                  onClick={async () => {
                    const loadingToast = toast.loading('Refreshing subjects...');
                    try {
                      await seedSubjects();
                      toast.success('Subjects database refreshed!', { id: loadingToast });
                    } catch (e) {
                      toast.error('Failed to refresh subjects', { id: loadingToast });
                    }
                  }}
                  className="bg-slate-900 px-6 py-3 rounded-2xl border border-slate-800 shadow-xl flex items-center gap-3 hover:bg-slate-800 transition-all text-slate-400"
                >
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-bold uppercase tracking-widest">Refresh Subjects</span>
                </button>
                <div className="bg-slate-900 px-6 py-3 rounded-2xl border border-slate-800 shadow-xl flex items-center gap-3">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Live Node: Harare-Central</span>
                </div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <MetricCard 
                title="Total Students" 
                value={metrics.totalStudents}
                icon={<Users className="w-6 h-6 text-blue-400" />}
                color="blue"
                trend="+8.2% this month"
              />
              <MetricCard 
                title="Total Tutors" 
                value={metrics.totalTutors}
                icon={<Users className="w-6 h-6 text-purple-400" />}
                color="purple"
                trend="+12.5% this month"
              />
              <MetricCard 
                title="Total GMV" 
                value={`$${metrics.totalGMV.toFixed(2)}`}
                icon={<Zap className="w-6 h-6 text-amber-400" />}
                color="amber"
                trend="Escrow Protected"
              />
              <MetricCard 
                title="Platform Revenue" 
                value={`$${metrics.revenue.toFixed(2)}`}
                icon={<DollarSign className="w-6 h-6 text-emerald-400" />}
                color="emerald"
                trend="10% Commission"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <MetricCard 
                title="Total Lessons" 
                value={metrics.totalLessons}
                icon={<Activity className="w-6 h-6 text-blue-400" />}
                color="blue"
                trend="All time"
              />
              <MetricCard 
                title="Completed" 
                value={metrics.completedLessons}
                icon={<CheckCircle className="w-6 h-6 text-emerald-400" />}
                color="emerald"
                trend="Successfully finished"
              />
              <MetricCard 
                title="Pending" 
                value={metrics.pendingLessons}
                icon={<Clock className="w-6 h-6 text-amber-400" />}
                color="amber"
                trend="Awaiting completion"
              />
              <MetricCard 
                title="Disputed" 
                value={metrics.disputedLessons}
                icon={<AlertTriangle className="w-6 h-6 text-red-400" />}
                color="red"
                trend="Needs attention"
              />
            </div>

            {/* Verified Tutors Section */}
            <div className="bg-[#0f172a] rounded-[2.5rem] border border-slate-800 shadow-2xl overflow-hidden">
              <div className="p-8 border-b border-slate-800 flex items-center justify-between bg-emerald-500/5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                    <ShieldCheck className="w-7 h-7 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white">Verified Tutors</h3>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Elite Educators on the Platform</p>
                  </div>
                </div>
                <span className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">
                  {tutors.filter(t => t.is_verified).length} Verified
                </span>
              </div>
              <div className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {tutors.filter(t => t.is_verified).map(tutor => (
                    <div key={tutor.id} className="p-6 rounded-3xl border border-slate-800 bg-slate-900/50 hover:bg-slate-900 transition-all group">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-xl bg-slate-800 overflow-hidden border border-slate-700">
                          <img src={tutor.photo_url || `https://picsum.photos/seed/${tutor.id}/100/100`} alt="" referrerPolicy="no-referrer" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">{tutor.full_name}</p>
                          <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-amber-400 fill-current" />
                            <span className="text-xs font-bold text-slate-400">{tutor.avg_rating || '5.0'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Subjects</p>
                        <div className="flex flex-wrap gap-1">
                          {tutor.subjects?.map((s: string) => (
                            <span key={s} className="text-[9px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  {tutors.filter(t => t.is_verified).length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-500 italic">
                      No verified tutors yet.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Online Tutors Section */}
            <div className="bg-[#0f172a] rounded-[2.5rem] border border-slate-800 shadow-2xl overflow-hidden">
              <div className="p-8 border-b border-slate-800 flex items-center justify-between bg-blue-500/5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20">
                    <Activity className="w-7 h-7 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white">Online Now</h3>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Live Tutors Ready for Sessions</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                      {tutors.filter(t => t.is_online).length} Active
                    </span>
                  </div>
                </div>
              </div>
              <div className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {tutors.filter(t => t.is_online).map(tutor => (
                    <div key={tutor.id} className="p-5 rounded-3xl border border-slate-800 bg-slate-900/50 hover:border-blue-500/30 transition-all group relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-3">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-lg shadow-emerald-500/50" />
                      </div>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 overflow-hidden border border-slate-700">
                          <img src={tutor.photo_url || `https://picsum.photos/seed/${tutor.id}/100/100`} alt="" referrerPolicy="no-referrer" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{tutor.full_name}</p>
                          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Available</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Teaching</p>
                        <div className="flex flex-wrap gap-1">
                          {tutor.subjects?.slice(0, 2).map((s: string) => (
                            <span key={s} className="text-[8px] bg-blue-500/5 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/10">
                              {s}
                            </span>
                          ))}
                          {tutor.subjects?.length > 2 && (
                            <span className="text-[8px] text-slate-500 font-bold">+{tutor.subjects.length - 2}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {tutors.filter(t => t.is_online).length === 0 && (
                    <div className="col-span-full py-8 text-center text-slate-500 italic text-sm">
                      No tutors are currently online.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Tutor Management Table */}
              <div id="tutor-directory" className="lg:col-span-8 space-y-6 scroll-mt-10">
                <div className="bg-[#0f172a] rounded-[2.5rem] border border-slate-800 shadow-2xl overflow-hidden">
                  <div className="p-8 border-b border-slate-800 flex items-center justify-between bg-slate-900/30">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20">
                        <Users className="w-7 h-7 text-blue-500" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-white">Tutor Directory</h3>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Verification & Status Management</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input 
                          type="text"
                          placeholder="Search name or subject..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="bg-slate-900 border border-slate-800 text-white text-sm rounded-xl pl-10 pr-4 py-2 outline-none focus:border-blue-500/50 w-64 transition-all focus:w-80"
                        />
                      </div>
                      
                      <select 
                        value={selectedSubject}
                        onChange={(e) => setSelectedSubject(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-white text-xs rounded-xl px-4 py-2 outline-none focus:border-blue-500/50"
                      >
                        <option value="">All Subjects</option>
                        {subjects.map(s => (
                          <option key={s.id} value={s.name}>{s.name} ({s.level})</option>
                        ))}
                      </select>

                      <select 
                        value={selectedCurriculum}
                        onChange={(e) => setSelectedCurriculum(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-white text-xs rounded-xl px-4 py-2 outline-none focus:border-blue-500/50"
                      >
                        <option value="">All Curriculums</option>
                        <option value="ZIMSEC">ZIMSEC</option>
                        <option value="Cambridge">Cambridge</option>
                        <option value="Both">Both</option>
                      </select>

                      <select 
                        value={selectedRating}
                        onChange={(e) => setSelectedRating(Number(e.target.value))}
                        className="bg-slate-900 border border-slate-800 text-white text-xs rounded-xl px-4 py-2 outline-none focus:border-blue-500/50"
                      >
                        <option value="0">All Ratings</option>
                        <option value="4">4+ Stars</option>
                        <option value="4.5">4.5+ Stars</option>
                        <option value="5">5 Stars</option>
                      </select>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-900/50 border-b border-slate-800">
                        <tr>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Tutor Details</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Specialization</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Verification</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {tutors
                          .filter(t => {
                            const query = searchQuery.toLowerCase();
                            const matchesSearch = 
                              t.full_name?.toLowerCase().includes(query) ||
                              t.subjects?.some((s: string) => s.toLowerCase().includes(query));
                            
                            const matchesSubject = !selectedSubject || t.subjects?.includes(selectedSubject);
                            const matchesCurriculum = !selectedCurriculum || t.curriculum === selectedCurriculum || t.curriculum === 'Both';
                            const matchesRating = !selectedRating || (t.avg_rating || 0) >= selectedRating;
                            return matchesSearch && matchesSubject && matchesCurriculum && matchesRating;
                          })
                          .map((tutor) => (
                          <tr key={tutor.id} className="hover:bg-slate-900/50 transition-all group">
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-slate-800 overflow-hidden border border-slate-700">
                                  <img src={tutor.photo_url || `https://picsum.photos/seed/${tutor.id}/100/100`} alt="" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-white">{tutor.full_name}</p>
                                  <p className="text-[10px] font-medium text-slate-500">{tutor.email || 'No email'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-6">
                              <div className="space-y-1">
                                <p className="text-xs font-bold text-slate-300">{tutor.curriculum || 'N/A'}</p>
                                <div className="flex flex-wrap gap-1">
                                  {tutor.subjects?.slice(0, 3).map((s: string) => (
                                    <span key={s} className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
                                      {s}
                                    </span>
                                  ))}
                                  {tutor.subjects?.length > 3 && (
                                    <span className="text-[9px] text-slate-500">+{tutor.subjects.length - 3} more</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-6">
                              <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest border ${
                                tutor.is_verified 
                                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                                  : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                              }`}>
                                {tutor.is_verified ? 'Verified' : 'Pending'}
                              </span>
                            </td>
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${tutor.is_online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
                                <span className="text-xs font-bold text-slate-400">{tutor.is_online ? 'Online' : 'Offline'}</span>
                              </div>
                            </td>
                            <td className="px-8 py-6 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => setSelectedTutorForDetail(tutor)}
                                  className="p-2 text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-all"
                                  title="View Detailed Verification"
                                >
                                  <Eye className="w-5 h-5" />
                                </button>
                                <button 
                                  onClick={() => toggleTutorStatus(tutor.id, tutor.is_verified)}
                                  className={`p-2 rounded-lg transition-all ${
                                    tutor.is_verified ? 'text-red-400 hover:bg-red-400/10' : 'text-emerald-400 hover:bg-emerald-400/10'
                                  }`}
                                  title={tutor.is_verified ? 'Unverify' : 'Verify'}
                                >
                                  {tutor.is_verified ? <Ban className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                                </button>
                                <button className="p-2 text-slate-500 hover:bg-slate-800 rounded-lg">
                                  <MoreVertical className="w-5 h-5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Active Disputes */}
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-[#0f172a] rounded-[2.5rem] border border-slate-800 shadow-2xl overflow-hidden flex flex-col h-full">
                  <div className="p-8 border-b border-slate-800 flex items-center justify-between bg-red-500/5">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="w-6 h-6 text-red-500" />
                      <h3 className="text-xl font-black text-white">Active Disputes</h3>
                    </div>
                    <span className="bg-red-500/10 text-red-500 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-red-500/20">
                      {disputes.length}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                    {disputes.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                        <CheckCircle className="w-12 h-12 text-slate-700" />
                        <p className="text-slate-500 font-bold italic">No active disputes</p>
                      </div>
                    ) : (
                      disputes.map((dispute) => (
                        <div key={dispute.id} className="p-6 rounded-3xl border border-slate-800 bg-slate-900/50 space-y-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-sm font-black text-white">Lesson #{dispute.id.slice(-6)}</p>
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Amount: ${dispute.amount}</p>
                            </div>
                            <div className="bg-red-500/10 text-red-500 px-2 py-1 rounded text-[10px] font-black uppercase border border-red-500/20">
                              Disputed
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => resolveDispute(dispute.id, 'refund')}
                              className="flex-1 py-3 bg-red-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all"
                            >
                              Refund
                            </button>
                            <button 
                              onClick={() => resolveDispute(dispute.id, 'pay')}
                              className="flex-1 py-3 bg-white text-[#0f172a] rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-slate-100 transition-all"
                            >
                              Pay Tutor
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
              </React.Fragment>
            ) : (
              <div className="space-y-10">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-black text-white tracking-tight">All Bookings</h2>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mt-1">Real-time Lesson & Session Tracking</p>
                  </div>
                </div>

                <div className="bg-[#0f172a] rounded-[2.5rem] border border-slate-800 shadow-2xl overflow-hidden">
                  <div className="p-8 border-b border-slate-800 flex items-center justify-between bg-blue-500/5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20">
                        <Clock className="w-7 h-7 text-blue-500" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-white">Booking History</h3>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{bookings.length} Total Sessions</p>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/50">
                          <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Student ID</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Tutor ID</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Topic</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Schedule</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {bookings.map((booking) => (
                          <tr key={booking.id} className="hover:bg-slate-800/30 transition-colors group">
                            <td className="px-8 py-6">
                              <p className="text-sm font-bold text-white">{booking.student_id?.substring(0, 8)}...</p>
                            </td>
                            <td className="px-8 py-6">
                              <p className="text-sm font-bold text-white">{booking.tutor_id?.substring(0, 8)}...</p>
                            </td>
                            <td className="px-8 py-6">
                              <p className="text-sm font-bold text-white">{booking.topic || 'General Lesson'}</p>
                            </td>
                            <td className="px-8 py-6">
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-white">{booking.scheduled_date || 'TBD'}</span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase">{booking.scheduled_time || 'ASAP'}</span>
                              </div>
                            </td>
                            <td className="px-8 py-6">
                              <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest border ${
                                booking.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                booking.status === 'in_progress' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                'bg-blue-500/10 text-blue-500 border-blue-500/20'
                              }`}>
                                {booking.status?.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-8 py-6 text-right">
                              <span className="text-sm font-black text-emerald-500">${booking.amount?.toFixed(2)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

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
      <CreateSubjectModal 
        isOpen={showCreateSubject}
        onClose={() => setShowCreateSubject(false)}
        onSuccess={() => {}}
      />
      <TutorDetailModal 
        tutor={selectedTutorForDetail}
        isOpen={!!selectedTutorForDetail}
        onClose={() => setSelectedTutorForDetail(null)}
      />
    </div>
  );
}

const TutorDetailModal: React.FC<{
  tutor: any;
  isOpen: boolean;
  onClose: () => void;
}> = ({ tutor, isOpen, onClose }) => {
  if (!isOpen || !tutor) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-[#020617]/90 backdrop-blur-sm"
        />
        <motion.div 
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="relative w-full max-w-4xl bg-[#0f172a] border border-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-8 border-b border-slate-800 flex items-center justify-between bg-emerald-500/5">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-3xl bg-slate-800 overflow-hidden border-2 border-emerald-500/20">
                <img 
                  src={tutor.photo_url || `https://picsum.photos/seed/${tutor.id}/200/200`} 
                  alt="" 
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h2 className="text-3xl font-black text-white">{tutor.full_name}</h2>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                    tutor.is_verified ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                  }`}>
                    {tutor.is_verified ? 'Verified' : 'Verification Pending'}
                  </span>
                  <span className="text-slate-500 text-xs font-bold font-mono">ID: {tutor.id}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-2xl text-slate-400 transition-all">
              <Plus className="w-6 h-6 rotate-45" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Identity & Face Match */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-4">
                    <UserCheck className="w-4 h-4" />
                    Identity Verification
                  </h3>
                  <div className="p-6 rounded-3xl bg-slate-900/50 border border-slate-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400 font-medium">Face-Match Confidence</span>
                      <span className={`text-sm font-black ${
                        (tutor.face_match_score || 0) > 80 ? 'text-emerald-400' : 'text-amber-400'
                      }`}>
                        {tutor.face_match_score || '92'}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 rounded-full" 
                        style={{ width: `${tutor.face_match_score || 92}%` }} 
                      />
                    </div>
                    <div className="pt-4 border-t border-slate-800">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Government ID</p>
                      <div className="relative group">
                        <img 
                          src={tutor.id_document_url || `https://picsum.photos/seed/id_${tutor.id}/600/400`} 
                          alt="ID Document" 
                          className="w-full h-40 object-cover rounded-xl border border-slate-700 bg-slate-800"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                          <button className="flex items-center gap-2 text-white text-xs font-bold bg-slate-800 px-4 py-2 rounded-lg">
                            <ExternalLink className="w-4 h-4" />
                            View Full Size
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-4">
                    <GraduationCap className="w-4 h-4" />
                    Academic Certificates
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {(tutor.certificates || ['Degree', 'IELTS']).map((cert: any, i: number) => (
                      <div key={i} className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800 group cursor-pointer hover:border-emerald-500/30 transition-all">
                        <FileText className="w-8 h-8 text-emerald-500 mb-2" />
                        <p className="text-xs font-bold text-white truncate">{typeof cert === 'string' ? cert : cert.name}</p>
                        <p className="text-[10px] text-slate-500 font-medium mt-1">Verified via Academic Node</p>
                      </div>
                    ))}
                    <div className="p-4 rounded-2xl border-2 border-dashed border-slate-800 flex items-center justify-center flex-col text-slate-600">
                      <Plus className="w-6 h-6 mb-1" />
                      <span className="text-[9px] font-black uppercase">Add Doc</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payout & Financials */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-4">
                    <CreditCard className="w-4 h-4" />
                    Payout Configuration
                  </h3>
                  <div className="p-6 rounded-3xl bg-[#020617] border border-slate-800 space-y-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                      <CreditCard className="w-24 h-24 text-emerald-500 rotate-12" />
                    </div>
                    
                    <div className="space-y-4 relative z-10">
                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">EcoCash Payout Number</p>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 bg-slate-900 border border-slate-800 px-4 py-3 rounded-xl text-white font-mono text-sm">
                            {tutor.payout_details?.ecocash_number || '+263 77 412 8892'}
                          </div>
                          <button className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl hover:bg-emerald-500/20 transition-all">
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Balance</p>
                          <p className="text-lg font-black text-white">$0.00</p>
                        </div>
                        <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Earned</p>
                          <p className="text-lg font-black text-emerald-400">${tutor.total_earnings || '0.00'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-4">
                    <Activity className="w-4 h-4" />
                    Trust & Safety
                  </h3>
                  <div className="space-y-3">
                    <TrustFactor label="Dispute Rate" value="0.01%" color="emerald" />
                    <TrustFactor label="Session Completion" value="98%" color="emerald" />
                    <TrustFactor label="Identity Verification" value="Match Success" color="emerald" />
                  </div>
                </div>

                <div className="pt-4">
                  <button 
                    onClick={onClose}
                    className="w-full py-4 bg-white text-[#0f172a] rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl hover:bg-slate-100 transition-all"
                  >
                    Close Profile View
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

const TrustFactor: React.FC<{ label: string; value: string; color: 'emerald' | 'amber' | 'red' }> = ({ label, value, color }) => (
  <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-900/30 border border-slate-800/50">
    <span className="text-xs font-bold text-slate-400">{label}</span>
    <span className={`text-xs font-black uppercase tracking-widest text-${color}-400`}>{value}</span>
  </div>
);

const CreateSubjectModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    level: 'O-Level',
    board: 'ZIMSEC',
    category: 'Sciences'
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return toast.error('Please enter subject name');
    setLoading(true);
    try {
      const id = `${formData.board}_${formData.level}_${formData.name}`.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      await setDoc(doc(db, 'subjects', id), formData);
      toast.success('Subject created successfully!');
      onSuccess();
      onClose();
    } catch (error) {
      toast.error('Failed to create subject');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-[60] backdrop-blur-md">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-[#0f172a] w-full max-w-md p-8 rounded-[2.5rem] border border-slate-800 shadow-2xl space-y-6"
      >
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-black text-white">New Subject</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full">
            <MoreVertical className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Subject Name</label>
            <input
              type="text"
              placeholder="e.g. Mathematics"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full p-4 bg-slate-900 border border-slate-800 rounded-xl text-white outline-none focus:border-emerald-500/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Level</label>
              <select
                value={formData.level}
                onChange={e => setFormData({ ...formData, level: e.target.value })}
                className="w-full p-4 bg-slate-900 border border-slate-800 rounded-xl text-white outline-none focus:border-emerald-500/50"
              >
                <option value="O-Level">O-Level</option>
                <option value="A-Level">A-Level</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Board</label>
              <select
                value={formData.board}
                onChange={e => setFormData({ ...formData, board: e.target.value })}
                className="w-full p-4 bg-slate-900 border border-slate-800 rounded-xl text-white outline-none focus:border-emerald-500/50"
              >
                <option value="ZIMSEC">ZIMSEC</option>
                <option value="Cambridge">Cambridge</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-emerald-500 text-white rounded-xl font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Subject'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

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

function MetricCard({ title, value, icon, color, trend }: any) {
  const colors: any = {
    emerald: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    purple: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    amber: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    red: 'bg-red-500/10 text-red-500 border-red-500/20'
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
        <div className="flex items-center gap-1 text-[10px] font-black text-emerald-500 uppercase tracking-widest">
          <TrendingUp className="w-3 h-3" />
          {trend}
        </div>
      </div>
    </div>
  );
}
