import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, getDocs, getDoc, increment, orderBy, limit, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from '../firebase';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import socket from '../lib/socket';
import { 
  Power, 
  DollarSign, 
  Clock, 
  CheckCircle, 
  MessageSquare, 
  AlertCircle, 
  Bell, 
  ChevronRight, 
  Wallet, 
  ShieldCheck, 
  Star,
  Smartphone,
  Calendar,
  ArrowRight,
  ArrowLeft,
  Search,
  Camera,
  Upload,
  Globe,
  Video,
  ExternalLink,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import ChatInbox from '../components/ChatInbox';
import TopUpModal from '../components/TopUpModal';
import { formatDistanceToNow, isToday, isTomorrow, isThisWeek, parseISO, format } from 'date-fns';

export default function TutorDashboard() {
  const { user, profile, tutorProfile, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'chat' | 'profile'>('dashboard');
  const [requests, setRequests] = useState<any[]>([]);
  const [myBids, setMyBids] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [upcomingLessons, setUpcomingLessons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [lastSeen, setLastSeen] = useState<Date | null>(null);
  const [meetingLinks, setMeetingLinks] = useState<Record<string, { link: string, type: 'zoom' | 'meet' }>>({});
  const [showTopUpModal, setShowTopUpModal] = useState(false);

  // Presence Manager
  useEffect(() => {
    if (!user || !tutorProfile?.is_online) return;

    const updatePresence = async () => {
      try {
        await updateDoc(doc(db, 'tutor_profiles', user.uid), {
          last_seen: serverTimestamp()
        });
        setLastSeen(new Date());
      } catch (e) {
        console.warn('Presence update failed:', e);
      }
    };

    updatePresence();
    const interval = setInterval(updatePresence, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [user, tutorProfile?.is_online]);

  const toggleOnlineStatus = async () => {
    if (!user || isTogglingStatus) return;
    setIsTogglingStatus(true);
    try {
      const newStatus = !tutorProfile?.is_online;
      await updateDoc(doc(db, 'tutor_profiles', user.uid), {
        is_online: newStatus
      });
      await refreshProfile();
      toast.success(newStatus ? 'You are now Online!' : 'You are now Offline', {
        icon: newStatus ? '✅' : '🌙'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'tutor_status');
    } finally {
      setIsTogglingStatus(false);
    }
  };

  useEffect(() => {
    if (!user || !profile) return;
    
    let isMounted = true;
    const unsubs: (() => void)[] = [];

    const fetchData = async () => {
      try {
        const subSnap = await getDocs(collection(db, 'subjects'));
        if (!isMounted) return;
        setSubjects(subSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        // Fetch Bids
        const bidsQ = query(collection(db, 'bids'), where('tutor_id', '==', user.uid));
        const unsubBids = onSnapshot(bidsQ, (snap) => {
          if (!isMounted) return;
          setMyBids(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
          if (isMounted) handleFirestoreError(error, OperationType.GET, 'bids');
        });
        unsubs.push(unsubBids);

        // Fetch Upcoming Lessons
        const lessonsQ = query(
          collection(db, 'lessons'), 
          where('tutor_id', '==', user.uid),
          where('status', 'in', ['paid_escrow', 'in_progress', 'completed', 'disputed', 'cancelled']),
          orderBy('created_at', 'desc'),
          limit(10)
        );
        const unsubLessons = onSnapshot(lessonsQ, (snap) => {
          if (!isMounted) return;
          setUpcomingLessons(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
          if (isMounted) handleFirestoreError(error, OperationType.GET, 'lessons');
        });
        unsubs.push(unsubLessons);

        if (isMounted) setLoading(false);
      } catch (error) {
        if (isMounted) {
          handleFirestoreError(error, OperationType.GET, 'initial_data');
          setLoading(false);
        }
      }
    };
    
    fetchData();

    // Listen for all open requests
    const q = query(collection(db, 'lesson_requests'), where('status', '==', 'open'));
    const unsubRequests = onSnapshot(q, (snap) => {
      if (!isMounted) return;
      const allReqs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRequests(allReqs);
    }, (error) => {
      if (isMounted) handleFirestoreError(error, OperationType.GET, 'lesson_requests');
    });
    unsubs.push(unsubRequests);

    socket.on('request_received', (data) => {
      if (!isMounted) return;
      setRequests(prev => [data, ...prev.filter(r => r.id !== data.id)]);
      toast(`New request in ${data.topic}!`, { icon: '🔔' });
    });

    return () => {
      isMounted = false;
      unsubs.forEach(unsub => unsub());
      socket.off('request_received');
    };
  }, [user, profile]);

  const [showPayoutConfirm, setShowPayoutConfirm] = useState(false);
  const [payoutLessonId, setPayoutLessonId] = useState<string | null>(null);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verifyingPayout, setVerifyingPayout] = useState(false);

  // Filter requests based on tutor's subjects
  const matchedRequests = requests.filter(req => 
    tutorProfile?.subjects?.includes(req.subject_id)
  );

  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [bidAmount, setBidAmount] = useState<string>('');
  const [requestBids, setRequestBids] = useState<any[]>([]);
  const [showMatchesOnly, setShowMatchesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'price_high' | 'price_low' | 'bids_most'>('newest');
  const [filterSubject, setFilterSubject] = useState<string>('');
  const [filterCurriculum, setFilterCurriculum] = useState<string>('');
  const [filterLevel, setFilterLevel] = useState<string>('');
  const [filterMaxBids, setFilterMaxBids] = useState<number | null>(null);

  const getFilteredRequests = (reqs: any[]) => {
    return reqs.filter(req => {
      const matchesSubject = !filterSubject || req.subject_id === filterSubject;
      
      // Find subject details for curriculum/level checks
      const subject = subjects.find(s => s.id === req.subject_id);
      const matchesCurriculum = !filterCurriculum || subject?.board === filterCurriculum;
      const matchesLevel = !filterLevel || subject?.level === filterLevel;
      const matchesBids = filterMaxBids === null || (req.bid_count || 0) <= filterMaxBids;

      return matchesSubject && matchesCurriculum && matchesLevel && matchesBids;
    });
  };

  const getSortedRequests = (reqs: any[]) => {
    return [...reqs].sort((a, b) => {
      switch (sortBy) {
        case 'price_high':
          return b.offered_price - a.offered_price;
        case 'price_low':
          return a.offered_price - b.offered_price;
        case 'bids_most':
          return (b.bid_count || 0) - (a.bid_count || 0);
        case 'newest':
        default:
          const dateA = a.created_at?.toDate?.() || new Date(0);
          const dateB = b.created_at?.toDate?.() || new Date(0);
          return dateB.getTime() - dateA.getTime();
      }
    });
  };

  const displayedRequests = getSortedRequests(getFilteredRequests(showMatchesOnly ? matchedRequests : requests));

  const profileClarity = tutorProfile?.verification_score || 0;

  const getGroupedLessons = () => {
    const groups: Record<string, any[]> = {
      'Today': [],
      'Tomorrow': [],
      'This Week': [],
      'Upcoming': [],
      'Past/Other': []
    };

    upcomingLessons.forEach(lesson => {
      let date: Date | null = null;
      if (lesson.scheduled_date) {
        date = parseISO(lesson.scheduled_date);
      } else if (lesson.created_at) {
        date = lesson.created_at.toDate();
      }

      if (!date) {
        groups['Past/Other'].push(lesson);
        return;
      }

      if (isToday(date)) {
        groups['Today'].push(lesson);
      } else if (isTomorrow(date)) {
        groups['Tomorrow'].push(lesson);
      } else if (isThisWeek(date)) {
        groups['This Week'].push(lesson);
      } else if (date > new Date()) {
        groups['Upcoming'].push(lesson);
      } else {
        groups['Past/Other'].push(lesson);
      }
    });

    return groups;
  };

  const groupedLessons = getGroupedLessons();

  useEffect(() => {
    if (selectedRequest) {
      const q = query(collection(db, 'bids'), where('request_id', '==', selectedRequest.id));
      const unsubscribe = onSnapshot(q, (snap) => {
        setRequestBids(snap.docs.map(doc => doc.data()));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `bids/${selectedRequest.id}`);
      });
      return () => unsubscribe();
    }
  }, [selectedRequest]);

  const placeBid = async () => {
    if (!user || !profile || !selectedRequest) return;
    const amount = parseFloat(bidAmount);
    if (isNaN(amount) || amount <= 0) return toast.error('Please enter a valid amount');
    
    if (profileClarity < 60 && !tutorProfile?.is_verified) {
      return toast.error('Unlock Premium Bidding by reaching 60% Verification');
    }

    setLoading(true);
    try {
      // Prevent Double Booking Check
      if (selectedRequest.scheduled_date && selectedRequest.scheduled_time) {
        const q = query(
          collection(db, 'lessons'),
          where('tutor_id', '==', user.uid),
          where('scheduled_date', '==', selectedRequest.scheduled_date),
          where('scheduled_time', '==', selectedRequest.scheduled_time),
          where('status', 'in', ['paid_escrow', 'in_progress'])
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          setLoading(false);
          return toast.error('You already have a lesson scheduled for this time slot!');
        }
      }

      const response = await fetch('/api/bids/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tutorId: user.uid,
          requestId: selectedRequest.id,
          amount: amount,
          message: 'I can help you with this topic!'
        })
      });

      let result;
      const text = await response.text();
      try {
        result = JSON.parse(text);
      } catch (e) {
        console.error('Failed to parse JSON response:', text);
        throw new Error(`Server returned non-JSON response: ${text.substring(0, 100)}...`);
      }

      if (!response.ok) {
        if (result.error === 'INSUFFICIENT_FUNDS') {
          setShowTopUpModal(true);
          throw new Error('Insufficient funds. Please top up your wallet.');
        }
        throw new Error(result.error || 'Failed to place bid');
      }

      toast.success('Bid placed successfully!');
      setSelectedRequest(null);
      refreshProfile();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const scrollToMarketplace = () => {
    const el = document.getElementById('marketplace-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const startSession = async (lesson: any) => {
    const currentInput = meetingLinks[lesson.id];
    const link = currentInput?.link || lesson.meeting_link;
    
    if (!link) {
      toast.error("Please provide a meeting link first!");
      return;
    }

    try {
      // If there's a new link in the input that hasn't been saved yet
      if (currentInput?.link && currentInput.link !== lesson.meeting_link) {
        const updateRes = await fetch('/api/lessons/update-meeting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lessonId: lesson.id,
            tutorId: user?.uid,
            meetingLink: currentInput.link,
            meetingType: currentInput.type
          })
        });
        
        if (!updateRes.ok) {
          const err = await updateRes.json();
          throw new Error(err.error || "Failed to save meeting link before starting");
        }
      }

      const response = await fetch('/api/lessons/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId: lesson.id,
          tutorId: user?.uid
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to start session");
      }

      toast.success(`Opening session for ${lesson.topic || 'Lesson'}...`, {
        icon: '🚀',
        duration: 4000
      });
      
      window.open(link, '_blank');
      refreshProfile(); // Refresh to get updated meeting link in lesson object
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleCompleteLesson = (lessonId: string) => {
    setPayoutLessonId(lessonId);
    setShowPayoutConfirm(true);
  };

  const confirmAndCompleteLesson = async () => {
    if (!user || !payoutLessonId || !profile) return;
    
    setVerifyingPayout(true);
    try {
      const isPasswordUser = user.providerData.some(p => p.providerId === 'password');
      
      if (isPasswordUser) {
        if (!confirmPassword) throw new Error('Password is required');
        const credential = EmailAuthProvider.credential(user.email!, confirmPassword);
        await reauthenticateWithCredential(user, credential);
      } else {
        // For Google users, we'll use a specific confirmation phrase to prevent accidents
        if (confirmPassword !== 'CONFIRM') {
          throw new Error('Please type "CONFIRM" to release funds');
        }
      }
      
      const response = await fetch('/api/lessons/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId: payoutLessonId,
          userId: user.uid
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to complete lesson');
      }

      toast.success('Lesson completed! Funds released.');
      setShowPayoutConfirm(false);
      setPayoutLessonId(null);
      setConfirmPassword('');
      refreshProfile();
    } catch (error: any) {
      console.error('Payout error:', error);
      toast.error(error.message || 'Verification failed');
    } finally {
      setVerifyingPayout(false);
    }
  };

  const handleCancelLesson = async (lessonId: string) => {
    if (!window.confirm('Are you sure you want to cancel this lesson? Funds will be refunded to the student.')) return;
    
    try {
      const response = await fetch('/api/lessons/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId,
          userId: user?.uid,
          reason: 'Cancelled by tutor'
        })
      });

      if (!response.ok) throw new Error('Failed to cancel lesson');
      
      toast.success('Lesson cancelled and request re-opened.');
      refreshProfile();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleUpdateMeeting = async (lessonId: string) => {
    const data = meetingLinks[lessonId];
    if (!data?.link) return toast.error("Please enter a meeting link");
    
    try {
      const response = await fetch('/api/lessons/update-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId,
          tutorId: user?.uid,
          meetingLink: data.link,
          meetingType: data.type
        })
      });
      
      if (response.ok) {
        toast.success("Meeting link updated!");
      } else {
        const err = await response.json();
        throw new Error(err.error || "Failed to update meeting link");
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'paid_escrow':
        return { label: 'Scheduled', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' };
      case 'in_progress':
        return { label: 'In Progress', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' };
      case 'completed':
        return { label: 'Completed', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' };
      case 'cancelled':
        return { label: 'Cancelled', color: 'bg-slate-500/10 text-slate-500 border-slate-500/20' };
      case 'disputed':
        return { label: 'Disputed', color: 'bg-red-500/10 text-red-500 border-red-500/20' };
      default:
        return { label: status, color: 'bg-slate-500/10 text-slate-500 border-slate-500/20' };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#001F3F]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#28A745]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <header className="bg-[#001F3F] text-white p-6 rounded-b-[2.5rem] shadow-xl">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/10 border-2 border-[#28A745] overflow-hidden">
              <img 
                src={profile?.photo_url || `https://picsum.photos/seed/${user?.uid}/100/100`} 
                alt="" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h1 className="text-xl font-bold">Welcome Back, Tutor {profile?.full_name?.split(' ')[0]}!</h1>
              <button 
                onClick={toggleOnlineStatus}
                disabled={isTogglingStatus}
                className="flex items-center gap-2 mt-1 hover:opacity-80 transition-opacity disabled:opacity-50"
              >
                <div className={`w-2.5 h-2.5 rounded-full ${tutorProfile?.is_online ? 'bg-[#28A745] shadow-[0_0_8px_rgba(40,167,69,0.5)]' : 'bg-slate-400'}`} />
                <span className={`text-xs font-bold uppercase tracking-widest ${tutorProfile?.is_online ? 'text-[#28A745]' : 'text-white/60'}`}>
                  {tutorProfile?.is_online ? 'Online' : 'Offline'}
                </span>
                {tutorProfile?.is_online && (
                  <span className="text-[10px] text-white/40 font-medium">
                    (Live for {lastSeen ? formatDistanceToNow(lastSeen) : 'just now'})
                  </span>
                )}
                <span className="text-[10px] text-white/30 font-medium">(Click to toggle)</span>
              </button>
              <div className="flex gap-2 mt-2">
                {tutorProfile?.verification_status?.face_match === 'verified' && (
                  <div className="flex items-center gap-1 bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border border-blue-500/30">
                    <ShieldCheck className="w-3 h-3" />
                    AI Verified
                  </div>
                )}
                {(tutorProfile?.avg_rating || 0) >= 4.8 && (tutorProfile?.total_lessons || 0) > 5 && (
                  <div className="flex items-center gap-1 bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border border-yellow-500/30">
                    <Star className="w-3 h-3 fill-current" />
                    Top Rated
                  </div>
                )}
                {(tutorProfile?.subjects?.length || 0) > 5 && (
                  <div className="flex items-center gap-1 bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border border-emerald-500/30">
                    <CheckCircle className="w-3 h-3" />
                    Subject Expert
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-colors">
              <Bell className="w-6 h-6" />
              <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-[#001F3F]" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-8">
        {activeTab === 'dashboard' && (
          <>
            {/* Wallet Card */}
            <Link to="/tutor/wallet" className="block bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 relative overflow-hidden group hover:border-zim-green transition-all">
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform">
                <Wallet className="w-32 h-32 text-[#001F3F]" />
              </div>
              <div className="relative space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-[#001F3F] font-black text-sm uppercase tracking-widest">Wallet & EcoCash Balance</h3>
                  <div className="bg-[#28A745]/10 text-[#28A745] px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                    {tutorProfile?.payout_method} Verified
                  </div>
                </div>
                <div className="flex items-end gap-4">
                  <div className="text-5xl font-black text-[#001F3F]">${profile?.wallet_balance?.toFixed(2)}</div>
                  <div className="mb-1 text-slate-400 font-bold">Available</div>
                </div>
                <div className="flex items-center gap-6 pt-6 border-t border-slate-50">
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Free Bids Left</div>
                    <div className="text-lg font-bold text-zim-navy">{tutorProfile?.free_bids_remaining ?? 0}</div>
                  </div>
                  <div className="h-8 w-px bg-slate-100" />
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Held in Escrow</div>
                    <div className="text-lg font-bold text-zim-navy">$0.00</div>
                  </div>
                  <div className="h-8 w-px bg-slate-100" />
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-[#28A745] group-hover:underline">View Wallet Details</span>
                    <span className="text-[10px] font-bold text-tutor-blue">Transaction History</span>
                  </div>
                </div>
              </div>
            </Link>

            <div id="marketplace-section" className="space-y-4 scroll-mt-24">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-[#001F3F] uppercase tracking-tight">Marketplace</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {showMatchesOnly ? `${matchedRequests.length} Matches Found` : `${requests.length} Total Requests`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select 
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-white border-2 border-slate-100 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 outline-none focus:border-tutor-blue transition-all"
                  >
                    <option value="newest">Newest First</option>
                    <option value="price_high">Highest Budget</option>
                    <option value="price_low">Lowest Budget</option>
                    <option value="bids_most">Most Bids</option>
                  </select>
                  <button 
                    onClick={() => setShowMatchesOnly(!showMatchesOnly)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${
                      showMatchesOnly 
                        ? 'bg-[#28A745] text-white border-[#28A745]' 
                        : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    {showMatchesOnly ? 'Showing Matches' : 'Show Matches Only'}
                  </button>
                </div>
              </div>

              {/* Filter Bar */}
              <div className="flex flex-wrap gap-2">
                <select 
                  value={filterSubject}
                  onChange={(e) => setFilterSubject(e.target.value)}
                  className="bg-white border-2 border-slate-100 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 outline-none focus:border-tutor-blue transition-all"
                >
                  <option value="">All Subjects</option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.level})</option>
                  ))}
                </select>

                <select 
                  value={filterCurriculum}
                  onChange={(e) => setFilterCurriculum(e.target.value)}
                  className="bg-white border-2 border-slate-100 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 outline-none focus:border-tutor-blue transition-all"
                >
                  <option value="">All Curriculums</option>
                  <option value="ZIMSEC">ZIMSEC</option>
                  <option value="Cambridge">Cambridge</option>
                </select>

                <select 
                  value={filterLevel}
                  onChange={(e) => setFilterLevel(e.target.value)}
                  className="bg-white border-2 border-slate-100 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 outline-none focus:border-tutor-blue transition-all"
                >
                  <option value="">All Levels</option>
                  <option value="O-Level">O-Level</option>
                  <option value="A-Level">A-Level</option>
                </select>

                <select 
                  value={filterMaxBids === null ? '' : filterMaxBids.toString()}
                  onChange={(e) => setFilterMaxBids(e.target.value === '' ? null : Number(e.target.value))}
                  className="bg-white border-2 border-slate-100 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 outline-none focus:border-tutor-blue transition-all"
                >
                  <option value="">Any Bid Count</option>
                  <option value="0">0 Bids</option>
                  <option value="5">Up to 5 Bids</option>
                  <option value="10">Up to 10 Bids</option>
                </select>

                {(filterSubject || filterCurriculum || filterLevel || filterMaxBids !== null) && (
                  <button 
                    onClick={() => {
                      setFilterSubject('');
                      setFilterCurriculum('');
                      setFilterLevel('');
                      setFilterMaxBids(null);
                    }}
                    className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:underline"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-6 px-6">
                {displayedRequests.length > 0 ? displayedRequests.map(req => {
                  const subject = subjects.find(s => s.id === req.subject_id);
                  const isMatch = tutorProfile?.subjects?.includes(req.subject_id);
                  return (
                    <div key={req.id} className={`min-w-[280px] bg-white p-6 rounded-[2rem] shadow-sm border-2 transition-all space-y-4 shrink-0 ${
                      isMatch ? 'border-[#28A745]/30 ring-4 ring-[#28A745]/5' : 'border-slate-100'
                    }`}>
                      <div className="flex justify-between items-start">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden">
                            <img src={`https://picsum.photos/seed/${req.student_id}/100/100`} alt="" referrerPolicy="no-referrer" />
                          </div>
                          {isMatch && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#28A745] rounded-full flex items-center justify-center border-2 border-white">
                              <CheckCircle className="w-2 h-2 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-bold text-slate-400 uppercase">Budget</div>
                          <div className="text-lg font-black text-[#28A745]">${req.offered_price.toFixed(2)}</div>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-900">{req.student_name}</h4>
                          {isMatch && <span className="text-[8px] font-black bg-[#28A745]/10 text-[#28A745] px-1.5 py-0.5 rounded uppercase">Match</span>}
                        </div>
                        <div className="text-xs text-slate-400 font-bold uppercase tracking-tighter">
                          {subject ? `${subject.board} ${subject.level} • ${subject.name}` : req.topic}
                        </div>
                        <div className="flex gap-2 mt-1">
                          <span className="text-[8px] font-black bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase">
                            {req.format === 'online' ? 'Online' : req.format === 'whatsapp' ? 'WhatsApp' : 'In-Person'}
                          </span>
                          <span className="text-[8px] font-black bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase">
                            {req.urgency === 'asap' ? 'Today' : req.urgency === 'tomorrow' ? 'Tomorrow' : req.scheduled_date} @ {req.scheduled_time || 'ASAP'}
                          </span>
                          <span className="text-[8px] font-black bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded uppercase">
                            {req.bid_count || 0} Bids
                          </span>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          setSelectedRequest(req);
                          setBidAmount(req.offered_price.toString());
                        }}
                        className="w-full py-3 bg-[#001F3F] text-white rounded-xl font-bold text-xs hover:bg-[#002f5f] transition-all flex items-center justify-center gap-2"
                      >
                        View & Bid
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  );
                }) : (
                  <div className="w-full p-12 bg-white rounded-[2rem] border-2 border-dashed border-slate-200 text-center space-y-2">
                    <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-slate-400 font-medium italic">
                      {showMatchesOnly ? "No matches for your subjects yet." : "No live requests available."}
                    </p>
                    {!showMatchesOnly && (
                      <button 
                        onClick={() => setActiveTab('profile')}
                        className="text-xs font-bold text-tutor-blue hover:underline"
                      >
                        Update your subjects in profile
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Schedule: Upcoming Lessons */}
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black text-[#001F3F] uppercase tracking-tight">Upcoming Lessons</h2>
                <Calendar className="w-5 h-5 text-slate-400" />
              </div>
              <div className="space-y-8">
                {upcomingLessons.length > 0 ? Object.entries(groupedLessons).map(([groupName, lessons]) => {
                  if (lessons.length === 0) return null;
                  return (
                    <div key={groupName} className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-slate-100" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{groupName}</span>
                        <div className="h-px flex-1 bg-slate-100" />
                      </div>
                      <div className="space-y-4">
                        {lessons.map(lesson => (
                          <div key={lesson.id} className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className="bg-white p-3 rounded-xl shadow-sm">
                                  <Clock className="w-5 h-5 text-tutor-blue" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <div className="font-bold text-slate-900">{lesson.topic || 'Session with Student'}</div>
                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest border ${getStatusConfig(lesson.status).color}`}>
                                      {getStatusConfig(lesson.status).label}
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-400 font-medium">
                                    {lesson.scheduled_date ? `${lesson.scheduled_date} @ ${lesson.scheduled_time || 'ASAP'}` : (lesson.created_at ? formatDistanceToNow(lesson.created_at.toDate(), { addSuffix: true }) : 'Scheduled')}
                                  </div>
                                  {lesson.student_phone && (
                                    <div className="text-[10px] font-black text-student-green uppercase tracking-widest mt-1">
                                      Student Phone: {lesson.student_phone}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {lesson.status === 'paid_escrow' && (
                                <button 
                                  onClick={() => handleCancelLesson(lesson.id)}
                                  className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-all active:scale-95"
                                  title="Cancel Lesson"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>

                            {(lesson.status === 'paid_escrow' || lesson.status === 'in_progress') && (
                              <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Meeting Setup</div>
                                  {lesson.meeting_link && (
                                    <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 uppercase">
                                      <CheckCircle className="w-3 h-3" />
                                      Link Ready
                                    </div>
                                  )}
                                </div>
                                
                                <div className="flex gap-2">
                                  <div className="flex-1 relative">
                                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input 
                                      type="text"
                                      placeholder="Zoom or Google Meet Link"
                                      value={meetingLinks[lesson.id]?.link || lesson.meeting_link || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setMeetingLinks(prev => ({
                                          ...prev,
                                          [lesson.id]: { link: val, type: val.includes('zoom') ? 'zoom' : 'meet' }
                                        }));
                                      }}
                                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs focus:ring-2 focus:ring-tutor-blue outline-none transition-all"
                                    />
                                  </div>
                                  <button 
                                    onClick={() => handleUpdateMeeting(lesson.id)}
                                    className="px-4 py-2 bg-tutor-blue text-white rounded-xl text-xs font-bold hover:opacity-90 transition-all"
                                  >
                                    Save
                                  </button>
                                </div>

                                <div className="flex gap-2">
                                  <button 
                                    onClick={() => window.open('https://meet.google.com/new', '_blank')}
                                    className="flex-1 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-1"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    New Google Meet
                                  </button>
                                  <button 
                                    onClick={() => window.open('https://zoom.us/start/videomeeting', '_blank')}
                                    className="flex-1 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-1"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    New Zoom
                                  </button>
                                </div>
                              </div>
                            )}
                            <div className="flex flex-col gap-2">
                              {(lesson.status === 'paid_escrow' || lesson.status === 'in_progress') && (
                                <>
                                  <div className="flex gap-2">
                                    <Link 
                                      to={`/lesson/${lesson.id}`}
                                      className="flex-1 py-3 bg-[#28A745] text-white rounded-xl font-bold text-xs shadow-lg shadow-green-100 hover:opacity-90 transition-all active:scale-95 flex items-center justify-center gap-2"
                                    >
                                      <Video className="w-4 h-4" />
                                      Enter AI Classroom
                                    </Link>
                                    <button 
                                      onClick={() => handleCompleteLesson(lesson.id)}
                                      className="flex-1 py-3 bg-[#001F3F] text-white rounded-xl font-bold text-xs shadow-lg shadow-blue-100 hover:opacity-90 transition-all active:scale-95 flex items-center justify-center gap-2"
                                    >
                                      <CheckCircle className="w-4 h-4" />
                                      Complete
                                    </button>
                                  </div>
                                  {lesson.meeting_link && (
                                    <button 
                                      onClick={() => startSession(lesson)}
                                      className="w-full py-2 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-1"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      Open Zoom/Meet Link
                                    </button>
                                  )}
                            </>
                          )}
                          {lesson.status === 'completed' && (
                                <div className="flex-1 py-3 bg-emerald-50 text-emerald-600 rounded-xl font-bold text-xs flex items-center justify-center gap-2">
                                  <CheckCircle className="w-4 h-4" />
                                  Lesson Completed
                                </div>
                              )}
                              {lesson.status === 'cancelled' && (
                                <div className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold text-xs flex items-center justify-center gap-2">
                                  <X className="w-4 h-4" />
                                  Lesson Cancelled
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }) : (
                  <div className="text-center py-8 text-slate-400 italic">No upcoming lessons.</div>
                )}
              </div>
            </div>

            {/* Profile Stats */}
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-yellow-50 flex items-center justify-center">
                  <Star className="w-6 h-6 text-yellow-500 fill-current" />
                </div>
                <div>
                  <div className="text-2xl font-black text-[#001F3F]">{tutorProfile?.avg_rating || '5.0'}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Average Rating</div>
                </div>
              </div>
              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-[#28A745]" />
                </div>
                <div>
                  <div className="text-2xl font-black text-[#001F3F]">{tutorProfile?.total_lessons || 0}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lessons Done</div>
                </div>
              </div>
            </div>

            {/* Verification Progress Footer */}
            <div className="bg-[#001F3F] p-8 rounded-[2.5rem] text-white space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">Profile Clarity: {tutorProfile?.is_verified ? 100 : profileClarity}%</h3>
                  {(!tutorProfile?.is_verified && profileClarity < 60) && (
                    <p className="text-white/60 text-xs font-medium mt-1">
                      Please upload ID for 60% Verification (Unlock Premium Bidding)
                    </p>
                  )}
                  {(!tutorProfile?.is_verified && profileClarity >= 60) && (
                    <p className="text-[#28A745] text-xs font-bold mt-1 uppercase tracking-widest flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Bidding Unlocked
                    </p>
                  )}
                  {tutorProfile?.is_verified && (
                    <p className="text-[#28A745] text-xs font-bold mt-1 uppercase tracking-widest flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Verified Premium Tutor
                    </p>
                  )}
                </div>
                <ShieldCheck className={`w-10 h-10 ${tutorProfile?.is_verified ? 'text-[#28A745]' : 'text-white/20'}`} />
              </div>
              <div className="w-full bg-white/10 h-3 rounded-full overflow-hidden">
                <motion.div 
                  className="bg-[#28A745] h-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${tutorProfile?.is_verified ? 100 : profileClarity}%` }}
                  transition={{ duration: 1 }}
                />
              </div>
            </div>
          </>
        )}

        {activeTab === 'chat' && <ChatInbox />}
        
        {activeTab === 'profile' && (
          <ProfileEdit tutorProfile={tutorProfile} subjects={subjects} />
        )}

        {/* Bid Modal */}
        <AnimatePresence>
          {selectedRequest && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4">
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                className="bg-white w-full max-w-lg rounded-t-[2.5rem] md:rounded-[2.5rem] p-8 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto"
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setSelectedRequest(null)}
                      className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5 text-slate-600" />
                    </button>
                    <h2 className="text-2xl font-black text-[#001F3F]">Place Your Bid</h2>
                  </div>
                  <button onClick={() => setSelectedRequest(null)} className="p-2 bg-slate-100 rounded-full">
                    <Power className="w-5 h-5 text-slate-400 rotate-45" />
                  </button>
                </div>

                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Student Budget</div>
                      <div className="text-3xl font-black text-[#28A745]">${selectedRequest.offered_price.toFixed(2)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Topic</div>
                      <div className="font-bold text-[#001F3F]">{selectedRequest.topic}</div>
                    </div>
                  </div>

                  {selectedRequest.description && (
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Problem Details</div>
                      <p className="text-sm text-slate-500 font-medium leading-relaxed bg-white p-3 rounded-xl border border-slate-100">
                        {selectedRequest.description}
                      </p>
                    </div>
                  )}

                  {selectedRequest.problem_image && (
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Snapped Problem</div>
                      <div className="relative group cursor-zoom-in">
                        <img 
                          src={selectedRequest.problem_image} 
                          alt="Problem" 
                          className="w-full h-48 object-cover rounded-xl shadow-sm border border-slate-200"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all rounded-xl flex items-center justify-center">
                          <Search className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-all" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-[#001F3F] uppercase tracking-widest">Market Activity</h3>
                  <div className="space-y-2 max-h-32 overflow-y-auto pr-2">
                    {requestBids.length > 0 ? requestBids.map((b, i) => (
                      <div key={i} className="flex justify-between items-center text-xs p-2 bg-slate-50 rounded-lg">
                        <span className="text-slate-500 font-medium">Tutor Bid</span>
                        <span className="font-bold text-[#001F3F]">${b.amount.toFixed(2)}</span>
                      </div>
                    )) : (
                      <p className="text-xs text-slate-400 italic">No other bids yet. Be the first!</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Your Competitive Offer ($)</label>
                  <input 
                    type="number" 
                    value={bidAmount}
                    onChange={e => setBidAmount(e.target.value)}
                    className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-2xl font-black text-[#001F3F] focus:border-[#28A745] outline-none transition-all"
                  />
                </div>

                <button 
                  onClick={placeBid}
                  disabled={loading}
                  className="w-full py-4 bg-[#28A745] text-white rounded-2xl font-black text-lg shadow-xl shadow-green-100 hover:scale-[1.02] transition-all disabled:opacity-50"
                >
                  {loading ? 'Processing...' : (tutorProfile?.free_bids_remaining > 0 ? 'Submit Free Bid' : 'Submit Bid ($0.50)')}
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>

      {/* Top Up Modal */}
      <TopUpModal 
        isOpen={showTopUpModal}
        onClose={() => setShowTopUpModal(false)}
        userId={user?.uid || ''}
        userEmail={user?.email || ''}
      />

      {/* Payout Security Confirmation Modal */}
      <AnimatePresence>
        {showPayoutConfirm && (
          <div className="fixed inset-0 bg-[#001F3F]/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden text-center"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-[#28A745]" />
              
              <div className="space-y-4">
                <div className="w-16 h-16 bg-[#28A745]/10 rounded-full flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-8 h-8 text-[#28A745]" />
                </div>
                <h2 className="text-2xl font-black text-[#001F3F]">Security Check</h2>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">
                  {user?.providerData.some(p => p.providerId === 'password')
                    ? "Enter your account password to release the funds from escrow to your wallet."
                    : "Type 'CONFIRM' below to authorize the fund release for this lesson."}
                </p>
              </div>

              <div className="mt-8 space-y-4">
                <input 
                  type={user?.providerData.some(p => p.providerId === 'password') ? "password" : "text"}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder={user?.providerData.some(p => p.providerId === 'password') ? "Your Password" : "Type CONFIRM"}
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-center font-bold text-[#001F3F] focus:border-[#28A745] outline-none transition-all placeholder:text-slate-300"
                  autoFocus
                  onKeyPress={(e) => e.key === 'Enter' && confirmAndCompleteLesson()}
                />

                <div className="flex flex-col gap-2">
                  <button 
                    onClick={confirmAndCompleteLesson}
                    disabled={verifyingPayout}
                    className="w-full py-4 bg-[#001F3F] text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-900/20 hover:scale-[1.02] transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {verifyingPayout ? 'Authorizing...' : 'Release Funds Now'}
                  </button>
                  <button 
                    onClick={() => {
                      setShowPayoutConfirm(false);
                      setConfirmPassword('');
                    }}
                    disabled={verifyingPayout}
                    className="w-full py-4 text-slate-400 font-bold text-sm hover:text-[#001F3F] transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Persistent Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 z-30">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex-1 py-4 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              activeTab === 'dashboard' ? 'bg-[#001F3F] text-white' : 'bg-slate-50 text-slate-400'
            }`}
          >
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-4 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              activeTab === 'chat' ? 'bg-[#001F3F] text-white' : 'bg-slate-50 text-slate-400'
            }`}
          >
            Messages
          </button>
          <button 
            onClick={() => setActiveTab('profile')}
            className={`flex-1 py-4 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              activeTab === 'profile' ? 'bg-[#001F3F] text-white' : 'bg-slate-50 text-slate-400'
            }`}
          >
            Profile
          </button>
        </div>
        <div className="max-w-4xl mx-auto mt-4">
          <button 
            onClick={scrollToMarketplace}
            className="w-full py-4 bg-[#28A745] text-white rounded-2xl font-black text-sm shadow-xl shadow-green-100 flex items-center justify-center gap-3 hover:scale-[1.02] transition-all active:scale-[0.98]"
          >
            Go to All Live Requests ({requests.length})
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </nav>
    </div>
  );
}

const ProfileEdit = ({ tutorProfile, subjects }: { tutorProfile: any, subjects: any[] }) => {
  const { user, profile, refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editData, setEditData] = useState({
    full_name: profile?.full_name || '',
    phone: profile?.phone || '',
    photo_url: profile?.photo_url || '',
    bio: tutorProfile?.bio || '',
    teaching_experience: tutorProfile?.teaching_experience || '',
    languages: tutorProfile?.languages || [],
    levels: tutorProfile?.levels || [],
    selectedSubjects: tutorProfile?.subjects || [],
    payout_method: tutorProfile?.payout_method || 'ecocash',
    payout_details: tutorProfile?.payout_details || {}
  });
  const [saving, setSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      return toast.error('Image too large. Max 5MB.');
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_DIM = 800;

        if (width > height) {
          if (width > MAX_DIM) {
            height *= MAX_DIM / width;
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width *= MAX_DIM / height;
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        setEditData({ ...editData, photo_url: compressedBase64 });
        setIsUploading(false);
        toast.success('Photo uploaded and optimized!');
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      // Use setDoc with merge: true to ensure documents exist
      await setDoc(doc(db, 'users', user.uid), {
        full_name: editData.full_name,
        phone: editData.phone,
        photo_url: editData.photo_url
      }, { merge: true });

      await setDoc(doc(db, 'tutor_profiles', user.uid), {
        bio: editData.bio,
        teaching_experience: editData.teaching_experience,
        languages: editData.languages,
        levels: editData.levels,
        subjects: editData.selectedSubjects,
        payout_method: editData.payout_method,
        payout_details: editData.payout_details
      }, { merge: true });

      await refreshProfile();
      toast.success('Profile updated successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `profile_update/${user.uid}`);
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-8">
      <div className="flex items-center justify-between border-b border-slate-50 pb-4">
        <h2 className="text-2xl font-bold text-[#001F3F]">Edit Profile</h2>
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2 bg-[#001F3F] text-white rounded-xl font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <Clock className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          Save Changes
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Full Name</label>
          <input
            type="text"
            value={editData.full_name}
            onChange={e => setEditData({ ...editData, full_name: e.target.value })}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#001F3F]/20"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Phone Number</label>
          <input
            type="text"
            value={editData.phone}
            onChange={e => setEditData({ ...editData, phone: e.target.value })}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#001F3F]/20"
          />
        </div>
      </div>

      <div className="space-y-4">
        <label className="text-xs font-bold text-slate-500 uppercase">Profile Photo</label>
        <div className="flex items-center gap-6">
          <div className="relative group">
            <div className="w-24 h-24 rounded-2xl bg-slate-100 border-2 border-slate-200 overflow-hidden relative">
              {editData.photo_url ? (
                <img src={editData.photo_url} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-300">
                  <Camera className="w-8 h-8" />
                </div>
              )}
              {isUploading && (
                <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-[#001F3F] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-2 -right-2 p-2 bg-[#001F3F] text-white rounded-xl shadow-lg hover:scale-110 transition-all"
            >
              <Upload className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-sm font-bold text-slate-700">Upload a professional photo</p>
            <p className="text-xs text-slate-400">This helps students trust you. Max 5MB, JPEG/PNG.</p>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-500 uppercase">Bio (Min 20 words)</label>
        <textarea
          rows={4}
          value={editData.bio}
          onChange={e => setEditData({ ...editData, bio: e.target.value })}
          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#001F3F]/20"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Teaching Experience</label>
          <select
            value={editData.teaching_experience}
            onChange={e => setEditData({ ...editData, teaching_experience: e.target.value })}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#001F3F]/20"
          >
            <option value="0-1">0-1 Years</option>
            <option value="1-3">1-3 Years</option>
            <option value="3-5">3-5 Years</option>
            <option value="5+">5+ Years</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Payout Method</label>
          <select
            value={editData.payout_method}
            onChange={e => setEditData({ 
              ...editData, 
              payout_method: e.target.value,
              payout_details: {} // Reset details on method change
            })}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#001F3F]/20"
          >
            <option value="ecocash">EcoCash</option>
            <option value="innbucks">Innbucks</option>
            <option value="bank">Bank Transfer</option>
          </select>
        </div>
      </div>

      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
            {editData.payout_method === 'bank' ? <ShieldCheck className="w-6 h-6 text-blue-500" /> : <Smartphone className="w-6 h-6 text-emerald-500" />}
          </div>
          <div>
            <h3 className="text-sm font-black text-[#001F3F] uppercase tracking-wider">
              {editData.payout_method === 'bank' ? 'Bank Account Information' : 'Mobile Wallet Details'}
            </h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase">Used for secure settlements</p>
          </div>
        </div>

        {editData.payout_method === 'bank' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase">Bank Name</label>
              <input
                type="text"
                value={editData.payout_details?.bank_name || ''}
                onChange={e => setEditData({ 
                  ...editData, 
                  payout_details: { ...editData.payout_details, bank_name: e.target.value } 
                })}
                placeholder="e.g. CABS, Steward Bank"
                className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#001F3F]/20 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase">Account Name</label>
              <input
                type="text"
                value={editData.payout_details?.account_name || ''}
                onChange={e => setEditData({ 
                  ...editData, 
                  payout_details: { ...editData.payout_details, account_name: e.target.value } 
                })}
                placeholder="Name as it appears on bank"
                className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#001F3F]/20 text-sm"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-black text-slate-400 uppercase">Account Number</label>
              <input
                type="text"
                value={editData.payout_details?.account_number || ''}
                onChange={e => setEditData({ 
                  ...editData, 
                  payout_details: { ...editData.payout_details, account_number: e.target.value } 
                })}
                placeholder="Your 10-15 digit account number"
                className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#001F3F]/20 text-sm"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1 pt-2">
            <label className="text-[10px] font-black text-slate-400 uppercase">Mobile Number</label>
            <input
              type="text"
              value={editData.payout_details?.phone || ''}
              onChange={e => setEditData({ 
                ...editData, 
                payout_details: { ...editData.payout_details, phone: e.target.value } 
              })}
              placeholder="+263 7x xxx xxxx"
              className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#001F3F]/20 text-sm"
            />
          </div>
        )}
      </div>

      <div className="space-y-4">
        <label className="text-xs font-bold text-slate-500 uppercase">Teaching Subjects</label>
        <div className="flex flex-wrap gap-2">
          {subjects.map(subject => (
            <button
              key={subject.id}
              type="button"
              onClick={() => {
                const isSelected = editData.selectedSubjects.includes(subject.id);
                setEditData({
                  ...editData,
                  selectedSubjects: isSelected 
                    ? editData.selectedSubjects.filter((id: string) => id !== subject.id)
                    : [...editData.selectedSubjects, subject.id]
                });
              }}
              className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                editData.selectedSubjects.includes(subject.id)
                  ? 'bg-[#001F3F] text-white border-[#001F3F]'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-[#001F3F]'
              }`}
            >
              {subject.name} ({subject.level})
            </button>
          ))}
        </div>
      </div>
    </form>
  );
};
