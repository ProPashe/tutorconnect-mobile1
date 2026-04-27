import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, getDocs, updateDoc, doc, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import socket from '../lib/socket';
import { 
  Plus, 
  Clock, 
  CheckCircle, 
  MessageSquare, 
  ChevronRight, 
  ChevronDown, 
  Flame, 
  Calendar,
  Star,
  ShieldCheck,
  Search,
  Bell,
  Menu,
  X,
  ArrowLeft,
  Filter,
  Video,
  ExternalLink
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

import PaymentModal from '../components/PaymentModal';
import ChatInbox from '../components/ChatInbox';
import ReviewModal from '../components/ReviewModal';
import TopUpModal from '../components/TopUpModal';
import { SUBJECTS_DATA } from '../data/subjects';

export default function StudentDashboard() {
  const { user, profile, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'chat'>('dashboard');
  const [requests, setRequests] = useState<any[]>([]);
  const [bidsByRequest, setBidsByRequest] = useState<Record<string, any[]>>({});
  const [subjects, setSubjects] = useState<any[]>([]);
  const [userProgress, setUserProgress] = useState<Record<string, any>>({});
  const [showForm, setShowForm] = useState(false);
  const [selectedBid, setSelectedBid] = useState<any>(null);
  const [pendingReview, setPendingReview] = useState<any>(null);
  const [curriculumMode, setCurriculumMode] = useState<'ZIMSEC' | 'Cambridge'>(profile?.curriculum || 'ZIMSEC');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sortBy, setSortBy] = useState<'rating' | 'price'>('rating');
  const [activeEscrows, setActiveEscrows] = useState<any[]>([]);
  const [activeLessons, setActiveLessons] = useState<any[]>([]);
  const [disputeLesson, setDisputeLesson] = useState<any>(null);
  const [selectedCurriculum, setSelectedCurriculum] = useState<'ZIMSEC' | 'Cambridge'>('ZIMSEC');
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [subjectSearch, setSubjectSearch] = useState('');
  const [formStep, setFormStep] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [showSubjectSelector, setShowSubjectSelector] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);

  const handleReferral = async () => {
    if (!user) return;
    try {
      const response = await fetch('/api/referrals/increment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: user.uid })
      });
      if (response.ok) {
        toast.success('Referral tracked! Keep going for rewards.');
        refreshProfile();
      }
    } catch (error) {
      console.error('Referral failed:', error);
    }
  };

  const handleTopUp = () => {
    setShowTopUpModal(true);
  };

  const [formData, setFormData] = useState({
    subject_id: '',
    topic: '',
    description: '',
    offered_price: '',
    problem_image: null as string | null,
    format: 'online' as 'online' | 'in_person' | 'whatsapp',
    urgency: 'asap' as 'asap' | 'tomorrow' | 'specific',
    scheduled_date: new Date().toISOString().split('T')[0],
    scheduled_time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
  });

  useEffect(() => {
    if (!user || !profile) return;

    let isMounted = true;
    const unsubs: (() => void)[] = [];

    const fetchSubjects = async () => {
      try {
        const snap = await getDocs(collection(db, 'subjects'));
        if (isMounted) setSubjects(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        if (isMounted) handleFirestoreError(error, OperationType.GET, 'subjects');
      }
    };
    fetchSubjects();

    if (user) {
      // Fetch Requests
      const q = query(collection(db, 'lesson_requests'), where('student_id', '==', user.uid));
      const unsubscribeRequests = onSnapshot(q, (snap) => {
        if (!isMounted) return;
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        setRequests(data.sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0)));
      }, (error) => {
        if (isMounted) handleFirestoreError(error, OperationType.GET, 'lesson_requests');
      });

      // Fetch Progress
      const pq = query(collection(db, 'user_progress'), where('student_id', '==', user.uid));
      const unsubscribeProgress = onSnapshot(pq, (snap) => {
        if (!isMounted) return;
        const progressMap: Record<string, any> = {};
        snap.docs.forEach(doc => {
          const data = doc.data();
          progressMap[data.subject_id] = { id: doc.id, ...data };
        });
        setUserProgress(progressMap);
      }, (error) => {
        if (isMounted) handleFirestoreError(error, OperationType.GET, 'user_progress');
      });

      // Fetch Active Lessons
      const lessonsQ = query(
        collection(db, 'lessons'),
        where('student_id', '==', user.uid),
        where('status', 'in', ['paid_escrow', 'in_progress', 'disputed'])
      );
      const unsubLessons = onSnapshot(lessonsQ, (snap) => {
        if (!isMounted) return;
        setActiveLessons(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => {
        if (isMounted) handleFirestoreError(error, OperationType.GET, 'lessons');
      });
      unsubs.push(unsubLessons);

      // Fetch Pending Reviews
      const rq = query(
        collection(db, 'lessons'), 
        where('student_id', '==', user.uid),
        where('status', '==', 'completed')
      );
      const unsubscribeReviews = onSnapshot(rq, (snap) => {
        if (!isMounted) return;
        const pending = snap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as any))
          .filter(l => !l.is_reviewed);
        
        if (pending.length > 0) {
          setPendingReview(pending[0]);
        } else {
          setPendingReview(null);
        }
      }, (error) => {
        if (isMounted) handleFirestoreError(error, OperationType.GET, 'lessons');
      });

      // Fetch Active Escrows
      const escrowQ = query(
        collection(db, 'escrow_holding'),
        where('student_id', '==', user.uid),
        where('status', 'in', ['LOCKED', 'DISPUTED'])
      );
      const unsubscribeEscrow = onSnapshot(escrowQ, (snap) => {
        if (!isMounted) return;
        setRequests(prev => prev); // Trigger re-render if needed
        setActiveEscrows(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => {
        if (isMounted) handleFirestoreError(error, OperationType.GET, 'escrow_holding');
      });

      // Fetch All Bids for this student to allow sorting requests
      const bidsQ = query(collection(db, 'bids'), where('student_id', '==', user.uid));
      const unsubscribeBids = onSnapshot(bidsQ, (snap) => {
        if (!isMounted) return;
        const grouped: Record<string, any[]> = {};
        snap.docs.forEach(doc => {
          const data = { id: doc.id, ...doc.data() } as any;
          if (!grouped[data.request_id]) grouped[data.request_id] = [];
          grouped[data.request_id].push(data);
        });
        setBidsByRequest(grouped);
      }, (error) => {
        if (isMounted) handleFirestoreError(error, OperationType.GET, 'bids');
      });

      return () => {
        isMounted = false;
        unsubs.forEach(unsub => unsub());
        unsubscribeRequests();
        unsubscribeProgress();
        unsubscribeReviews();
        unsubscribeEscrow();
        unsubscribeBids();
      };
    }
  }, [user, profile]);

  const toggleSubtopic = async (subjectId: string, subtopic: string) => {
    if (!user) return;
    const progressDocId = `${user.uid}_${subjectId}`;
    const progressRef = doc(db, 'user_progress', progressDocId);
    const currentProgress = userProgress[subjectId];

    try {
      if (!currentProgress) {
        await setDoc(progressRef, {
          student_id: user.uid,
          subject_id: subjectId,
          completed_subtopics: [subtopic],
          updated_at: serverTimestamp()
        });
      } else {
        const isCompleted = currentProgress.completed_subtopics.includes(subtopic);
        await updateDoc(progressRef, {
          completed_subtopics: isCompleted ? arrayRemove(subtopic) : arrayUnion(subtopic),
          updated_at: serverTimestamp()
        });
      }
    } catch (error) {
      toast.error('Failed to update progress');
    }
  };

  const handleAcceptBid = async () => {
    if (!selectedBid || !user || !profile) return;
    
    socket.emit('accept_bid', { request_id: selectedBid.request_id, tutor_id: selectedBid.tutor_id });
    toast.success('Payment successful! Funds held in escrow.');
    setSelectedBid(null);
    refreshProfile();
  };

  const handleCancelLesson = async (lessonId: string) => {
    if (!window.confirm('Are you sure you want to cancel this lesson? Funds will be refunded to your wallet.')) return;
    
    try {
      const response = await fetch('/api/lessons/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId,
          userId: user?.uid,
          reason: 'Cancelled by student'
        })
      });

      if (!response.ok) throw new Error('Failed to cancel lesson');
      
      toast.success('Lesson cancelled and request re-opened.');
      refreshProfile();
    } catch (error: any) {
      toast.error(error.message);
    }
  };
  const handleCompleteLesson = async (lessonId: string) => {
    if (!window.confirm('Are you sure you want to mark this lesson as complete? This will release the funds to the tutor.')) return;
    
    try {
      const response = await fetch('/api/lessons/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId })
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to complete lesson');
      
      toast.success('Lesson completed! Funds released to tutor.');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.subject_id || !formData.topic || !formData.offered_price) {
      return toast.error('Please fill all fields');
    }

    try {
      const docRef = await addDoc(collection(db, 'lesson_requests'), {
        student_id: user?.uid,
        student_name: profile?.full_name,
        subject_id: formData.subject_id,
        topic: formData.topic,
        description: formData.description,
        problem_image: formData.problem_image,
        format: formData.format,
        urgency: formData.urgency,
        scheduled_date: formData.scheduled_date,
        scheduled_time: formData.scheduled_time,
        offered_price: parseFloat(formData.offered_price),
        status: 'open',
        created_at: serverTimestamp()
      });

      socket.emit('new_request', {
        id: docRef.id,
        subject_id: formData.subject_id,
        topic: formData.topic,
        offered_price: parseFloat(formData.offered_price),
        student_name: profile?.full_name,
        format: formData.format,
        scheduled_time: formData.scheduled_time
      });

      setShowForm(false);
      setFormStep(1);
      setFormData({ 
        subject_id: '', 
        topic: '', 
        description: '', 
        offered_price: '', 
        problem_image: null,
        format: 'online',
        urgency: 'asap',
        scheduled_date: new Date().toISOString().split('T')[0],
        scheduled_time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
      });
      toast.success('Request posted successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'lesson_requests');
      toast.error('Failed to post request');
    }
  };

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
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_DIM = 1024;
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
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
        
        setFormData(prev => ({ ...prev, problem_image: compressedBase64 }));
        setIsUploading(false);
        toast.success('Problem snapped!');

        // Start AI Analysis
        setIsAiAnalyzing(true);
        const aiToast = toast.loading('Gemini is analyzing the problem...');
        try {
          const base64Data = compressedBase64.split(',')[1];
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [
              {
                parts: [
                  {
                    text: `Analyze this educational problem image. Extract:
                    1. A concise Topic name (e.g. "Quadratic Equations", "Ionic Bonding").
                    2. A detailed Description of the problem.
                    3. The most likely Subject (e.g. "Mathematics", "Biology").
                    4. Complexity level (1-10).
                    
                    Return as JSON.
                    {
                      "topic": string,
                      "description": string,
                      "subject": string,
                      "complexity": number
                    }`
                  },
                  {
                    inlineData: {
                      mimeType: "image/jpeg",
                      data: base64Data
                    }
                  }
                ]
              }
            ],
            config: {
              responseMimeType: "application/json"
            }
          });

          const result = JSON.parse(response.text || '{}');
          setFormData(prev => ({
            ...prev,
            topic: result.topic || prev.topic,
            description: result.description || prev.description
          }));
          
          // Try to match subject
          const matchedSubject = subjects.find(s => 
            s.name.toLowerCase().includes(result.subject.toLowerCase()) ||
            result.subject.toLowerCase().includes(s.name.toLowerCase())
          );
          if (matchedSubject) {
            setFormData(prev => ({ ...prev, subject_id: matchedSubject.id }));
          }

          toast.success('AI extracted topic & details!', { id: aiToast });
        } catch (error) {
          console.error('AI Analysis Error:', error);
          toast.error('AI couldn\'t analyze perfectly. Please fill details manually.', { id: aiToast });
        } finally {
          setIsAiAnalyzing(false);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateSubjects = async (newSubjects: string[]) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        subjects: newSubjects,
        updated_at: serverTimestamp()
      });
      await refreshProfile();
      toast.success('Focus subjects updated!');
      setShowSubjectSelector(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      toast.error('Failed to update subjects');
    }
  };

  const sortedRequests = [...requests].sort((a, b) => {
    const bidsA = bidsByRequest[a.id] || [];
    const bidsB = bidsByRequest[b.id] || [];
    
    if (bidsA.length === 0 && bidsB.length === 0) {
      return (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0);
    }
    if (bidsA.length === 0) return 1;
    if (bidsB.length === 0) return -1;

    if (sortBy === 'price') {
      const minA = Math.min(...bidsA.map(b => b.amount || Infinity));
      const minB = Math.min(...bidsB.map(b => b.amount || Infinity));
      return minA - minB;
    } else {
      const maxA = Math.max(...bidsA.map(b => b.tutor_rating || 0));
      const maxB = Math.max(...bidsB.map(b => b.tutor_rating || 0));
      return maxB - maxA;
    }
  });

  const focusSubjects = subjects.filter(s => profile?.subjects?.includes(s.id));

  return (
    <div className="flex h-[calc(100vh-64px)] bg-[#f8fafc] overflow-hidden">
      {/* Left Panel: Syllabus Navigation */}
      <div className={`bg-white border-r border-slate-200 transition-all duration-300 ${sidebarOpen ? 'w-80' : 'w-0 overflow-hidden'}`}>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Syllabus</h2>
            <div className="flex bg-slate-100 p-1 rounded-full">
              <button 
                onClick={() => setCurriculumMode('ZIMSEC')}
                className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all ${curriculumMode === 'ZIMSEC' ? 'bg-zim-navy text-white shadow-sm' : 'text-slate-400'}`}
              >
                ZIMSEC
              </button>
              <button 
                onClick={() => setCurriculumMode('Cambridge')}
                className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all ${curriculumMode === 'Cambridge' ? 'bg-zim-navy text-white shadow-sm' : 'text-slate-400'}`}
              >
                Cambridge
              </button>
            </div>
          </div>

          {/* Referral Section */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Refer & Earn</span>
              <div className="bg-zim-green/10 text-zim-green px-2 py-0.5 rounded text-[10px] font-bold">Active</div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 bg-white border border-slate-200 px-3 py-2 rounded-xl font-mono text-sm font-bold text-zim-navy">
                {profile?.referral_code || '---'}
              </div>
              <button 
                onClick={() => {
                  if (profile?.referral_code) {
                    navigator.clipboard.writeText(profile.referral_code);
                    toast.success('Code copied to clipboard!');
                  }
                }}
                className="bg-zim-navy text-white px-4 py-2 rounded-xl text-xs font-bold hover:opacity-90 transition-all"
              >
                Invite
              </button>
            </div>
            <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
              Share your code with friends. When they join, you both get a bonus!
            </p>
          </div>

          <div className="space-y-4">
            {subjects.filter(s => s.board === curriculumMode).map(subject => (
              <SyllabusItem 
                key={subject.id} 
                subject={subject} 
                progress={userProgress[subject.id]}
                onToggleSubtopic={(subtopic) => toggleSubtopic(subject.id, subtopic)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Center Panel: Main Dashboard */}
      <div className="flex-1 overflow-y-auto bg-[#f1f5f9]">
        {/* Mobile-style Header */}
        <div className="bg-zim-navy text-white p-4 flex items-center justify-between sticky top-0 z-10 md:hidden">
          <Menu className="w-6 h-6" onClick={() => setSidebarOpen(!sidebarOpen)} />
          <h1 className="text-lg font-bold">Dashboard</h1>
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5" />
            <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden border-2 border-white">
              <img src={profile?.photo_url || `https://picsum.photos/seed/${user?.uid}/100/100`} alt="" referrerPolicy="no-referrer" />
            </div>
          </div>
        </div>

        {/* Desktop Header */}
        <div className="hidden md:flex items-center justify-between p-6 bg-zim-navy text-white sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <Menu className="w-6 h-6 text-white/70 cursor-pointer" onClick={() => setSidebarOpen(!sidebarOpen)} />
            <h1 className="text-xl font-bold">Dashboard</h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="relative">
              <Bell className="w-6 h-6 text-white/70" />
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-zim-navy" />
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-bold">{profile?.full_name}</div>
                <div className="text-[10px] text-white/60 font-bold uppercase tracking-wider">{profile?.academic_level} Student</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden border-2 border-white/20 shadow-sm">
                <img src={profile?.photo_url || `https://picsum.photos/seed/${user?.uid}/100/100`} alt="" referrerPolicy="no-referrer" />
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8">
          {/* Quick-Access Exam Countdown */}
          <div className="bg-zim-green text-white p-6 rounded-[2rem] shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
              <Calendar className="w-24 h-24" />
            </div>
            <div className="relative flex items-center gap-4">
              <div className="bg-white/20 p-3 rounded-2xl">
                <Calendar className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-white/80 text-sm font-bold uppercase tracking-wider">Quick-Access Exam Countdown</h3>
                <div className="text-2xl font-black">28 days remaining</div>
              </div>
            </div>
          </div>

          {/* Daily Goal Streak */}
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-slate-900 font-bold">Daily Goal Streak</h3>
              <ChevronRight className="w-5 h-5 text-slate-400" />
            </div>
            <div className="flex justify-between items-center">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => {
                const isCompleted = i < 2;
                const isCurrent = i === 2;
                return (
                  <div key={day} className="flex flex-col items-center gap-2">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                      isCompleted ? 'bg-student-green text-white shadow-md shadow-green-100' : 
                      isCurrent ? 'bg-student-green text-white ring-4 ring-green-50' : 
                      'bg-slate-50 text-slate-400'
                    }`}>
                      {isCompleted ? <CheckCircle className="w-5 h-5" /> : i + 1}
                    </div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">{day}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Refer & Earn Card */}
          <div className="bg-gradient-to-br from-[#001F3F] to-[#003366] text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
              <Star className="w-32 h-32" />
            </div>
            <div className="relative space-y-6">
              <div className="space-y-2">
                <h3 className="text-zim-green font-black text-sm uppercase tracking-widest">Refer & Earn Rewards</h3>
                <div className="text-3xl font-black">Get $0.50 for every 5 referrals!</div>
                <p className="text-white/60 text-sm font-medium">Share your code and earn wallet credit automatically.</p>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex-1 bg-white/10 p-4 rounded-2xl border border-white/10 flex items-center justify-between">
                  <span className="font-mono font-bold text-lg">{profile?.referral_code}</span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(profile?.referral_code);
                      toast.success('Code copied!');
                    }}
                    className="text-zim-green font-bold text-xs hover:underline"
                  >
                    Copy
                  </button>
                </div>
                <div className="text-center px-4">
                  <div className="text-2xl font-black text-zim-green">{profile?.referral_count || 0}</div>
                  <div className="text-[10px] font-bold text-white/40 uppercase">Referrals</div>
                </div>
              </div>

              <button 
                onClick={handleReferral}
                className="w-full py-4 bg-zim-green text-zim-navy rounded-2xl font-black text-lg shadow-xl shadow-green-900/20 hover:scale-[1.02] transition-all"
              >
                Simulate Referral (Test)
              </button>
            </div>
          </div>

          {/* Active Escrows Section */}
          {activeEscrows.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Secure Escrow</h2>
                <ShieldCheck className="w-4 h-4 text-student-green" />
              </div>
              <div className="space-y-3">
                {activeEscrows.map((escrow) => (
                  <div key={escrow.id} className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-between group hover:border-red-100 transition-all">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                        escrow.status === 'DISPUTED' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                      }`}>
                        <ShieldCheck className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900 tracking-tight">
                          ${escrow.amount.toFixed(2)} Held Securely
                        </p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                          {escrow.status === 'DISPUTED' ? '⚠️ Funds Frozen' : 'Lesson Protection Active'}
                        </p>
                      </div>
                    </div>
                    {escrow.status !== 'DISPUTED' && (
                      <button 
                        onClick={() => setDisputeLesson({ id: escrow.lesson_id, amount: escrow.amount })}
                        className="text-[10px] font-black text-red-500 hover:text-red-600 uppercase tracking-widest p-2 hover:bg-red-50 rounded-xl transition-all"
                      >
                        Report Issue
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Lessons Section */}
          {activeLessons.length > 0 && (
            <div className="space-y-4 mb-8">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black text-[#001F3F] uppercase tracking-tight">Active Lessons</h2>
                <div className="bg-[#28A745]/10 text-[#28A745] px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                  {activeLessons.length} In Progress
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {activeLessons.map(lesson => (
                  <div key={lesson.id} className="bg-white p-6 rounded-[2rem] shadow-sm border-2 border-slate-100 space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden">
                          <img src={`https://picsum.photos/seed/${lesson.tutor_id}/100/100`} alt="" referrerPolicy="no-referrer" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900">{lesson.tutor_name}</h4>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{lesson.topic}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Escrow</div>
                        <div className="text-lg font-black text-[#28A745]">${lesson.amount.toFixed(2)}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className={`text-[8px] font-black px-2 py-1 rounded uppercase tracking-widest ${
                        lesson.status === 'disputed' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                      }`}>
                        {lesson.status.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium italic">
                        Started {formatDistanceToNow(lesson.created_at?.toDate() || new Date(), { addSuffix: true })}
                      </span>
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <Link 
                          to={`/lesson/${lesson.id}`}
                          className="flex-1 py-3 bg-zim-green text-zim-navy rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-green-100"
                        >
                          <Video className="w-4 h-4" />
                          Enter AI Classroom
                        </Link>
                        {lesson.meeting_link && (
                          <a 
                            href={lesson.meeting_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-50 transition-all"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Zoom/Meet
                          </a>
                        )}
                      </div>
                      
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleCompleteLesson(lesson.id)}
                          className="flex-1 py-3 bg-[#001F3F] text-white rounded-xl font-bold text-xs hover:bg-[#002f5f] transition-all"
                        >
                          Confirm Completion
                        </button>
                        <button 
                          onClick={() => setDisputeLesson(lesson)}
                          className="px-4 py-3 bg-red-50 text-red-600 rounded-xl font-bold text-xs hover:bg-red-100 transition-all"
                        >
                          Dispute
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Current Focus Cards */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Current Focus Cards</h2>
              <button 
                onClick={() => setShowSubjectSelector(true)}
                className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-full transition-all"
              >
                <Plus className="w-6 h-6" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {focusSubjects.length > 0 ? focusSubjects.map(subject => (
                <FocusCard 
                  key={subject.id} 
                  subject={subject} 
                  progress={userProgress[subject.id]}
                  onAdd={() => setShowSubjectSelector(true)}
                />
              )) : (
                <div className="col-span-2 p-12 bg-white rounded-[2rem] border-2 border-dashed border-slate-200 text-center space-y-4">
                  <p className="text-slate-400">No focus subjects selected yet.</p>
                  <button 
                    onClick={() => setShowSubjectSelector(true)}
                    className="text-zim-green font-bold hover:underline"
                  >
                    Add Subjects
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons Floating */}
          <div className="fixed bottom-8 right-8 flex flex-col gap-4 z-20">
            <button 
              onClick={() => setShowForm(true)}
              className="bg-zim-navy text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 font-bold hover:scale-105 transition-all group"
            >
              <div className="bg-white/20 p-2 rounded-lg group-hover:rotate-12 transition-transform">
                <MessageSquare className="w-5 h-5" />
              </div>
              Ask a Tutor
            </button>
            <button 
              onClick={() => toast('Quizzes coming soon! Stay tuned.', { icon: '🚀' })}
              className="bg-zim-navy text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 font-bold hover:scale-105 transition-all group"
            >
              <div className="bg-white/20 p-2 rounded-lg group-hover:rotate-12 transition-transform">
                <CheckCircle className="w-5 h-5" />
              </div>
              Take Quick Quiz
            </button>
          </div>
        </div>
      </div>

      {/* Right Panel: Reverse Bidding Feed */}
      <div className="w-96 bg-white border-l border-slate-200 overflow-y-auto hidden lg:block">
        <div className="p-6 space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Request Box</h2>
            <div className="flex items-center gap-2">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button 
                  onClick={() => setSortBy('rating')}
                  className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all uppercase tracking-widest ${sortBy === 'rating' ? 'bg-white text-zim-navy shadow-sm' : 'text-slate-400'}`}
                >
                  Rating
                </button>
                <button 
                  onClick={() => setSortBy('price')}
                  className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all uppercase tracking-widest ${sortBy === 'price' ? 'bg-white text-zim-navy shadow-sm' : 'text-slate-400'}`}
                >
                  Price
                </button>
              </div>
              <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                <Search className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Reverse Bidding Feed</h3>
            <div className="space-y-4">
              {sortedRequests.map(req => (
                <BiddingRequest 
                  key={req.id} 
                  request={req} 
                  bids={bidsByRequest[req.id] || []}
                  subjects={subjects} 
                  sortBy={sortBy}
                  onAccept={(bid) => setSelectedBid(bid)} 
                />
              ))}
              {sortedRequests.length === 0 && (
                <div className="text-center py-12 text-slate-400 italic bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  No active requests. Post one to see bids!
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg p-8 rounded-[2.5rem] shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar relative">
            {/* Progress Indicator */}
            <div className="absolute top-0 left-0 w-full h-1 bg-slate-100">
              <div 
                className="h-full bg-student-green transition-all duration-500" 
                style={{ width: `${(formStep / 3) * 100}%` }}
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              <div className="flex items-center gap-3">
                {formStep > 1 && (
                  <button 
                    onClick={() => setFormStep(prev => prev - 1)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5 text-slate-600" />
                  </button>
                )}
                <div>
                  <h2 className="text-2xl font-black text-slate-900">
                    {formStep === 1 ? 'Step 1: Academic Filter' : formStep === 2 ? 'Step 2: The Pain Point' : 'Step 3: Logistics & Budget'}
                  </h2>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                    {formStep === 1 ? 'What do you need help with?' : formStep === 2 ? 'Explain the exact problem' : 'Set the boundaries'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowForm(false);
                  setFormStep(1);
                }} 
                className="p-2 hover:bg-slate-100 rounded-full"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>

            {formStep === 1 && (
              <div className="space-y-6">
                {/* Curriculum Toggle */}
                <div className="flex p-1 bg-slate-100 rounded-2xl">
                  {(['ZIMSEC', 'Cambridge'] as const).map((curr) => (
                    <button
                      key={curr}
                      type="button"
                      onClick={() => {
                        setSelectedCurriculum(curr);
                        setSelectedLevel('');
                        setFormData({ ...formData, subject_id: '' });
                      }}
                      className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${
                        selectedCurriculum === curr 
                          ? 'bg-white text-zim-navy shadow-sm' 
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {curr}
                    </button>
                  ))}
                </div>

                {/* Level Selection */}
                <div className="grid grid-cols-2 gap-4">
                  {Object.keys(SUBJECTS_DATA[selectedCurriculum]).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => {
                        setSelectedLevel(lvl);
                        setFormData({ ...formData, subject_id: '' });
                      }}
                      className={`py-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-2 ${
                        selectedLevel === lvl 
                          ? 'border-student-green bg-green-50 text-student-green' 
                          : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200'
                      }`}
                    >
                      <span className="text-lg font-black">{lvl}</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest">Select Level</span>
                    </button>
                  ))}
                </div>

                {/* Subject Search & List */}
                {selectedLevel && (
                  <div className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input 
                        type="text"
                        placeholder="Search subjects..."
                        value={subjectSearch}
                        onChange={(e) => setSubjectSearch(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-student-green outline-none font-medium"
                      />
                    </div>

                    <div className="space-y-6 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                      {Object.entries(SUBJECTS_DATA[selectedCurriculum][selectedLevel as keyof typeof SUBJECTS_DATA['ZIMSEC']]).map(([category, subs]) => {
                        const filteredSubs = (subs as string[]).filter(s => s.toLowerCase().includes(subjectSearch.toLowerCase()));
                        if (filteredSubs.length === 0) return null;
                        
                        return (
                          <div key={category} className="space-y-2">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{category}</h4>
                            <div className="grid grid-cols-1 gap-2">
                              {filteredSubs.map(sub => {
                                const matchingSubject = subjects.find(s => 
                                  s.name.toLowerCase() === sub.toLowerCase() && 
                                  s.level.toLowerCase() === selectedLevel.toLowerCase() && 
                                  s.board.toLowerCase() === selectedCurriculum.toLowerCase()
                                );
                                const isSelected = formData.subject_id === matchingSubject?.id;
                                
                                return (
                                  <button
                                    key={sub}
                                    type="button"
                                    onClick={() => {
                                      if (matchingSubject) {
                                        setFormData({ ...formData, subject_id: matchingSubject.id });
                                      } else {
                                        console.error('Subject mismatch:', {
                                          lookingFor: { name: sub, level: selectedLevel, board: selectedCurriculum },
                                          availableSubjects: subjects.map(s => ({ name: s.name, level: s.level, board: s.board }))
                                        });
                                        toast.error(`Subject "${sub}" not found in database. Please contact support.`);
                                      }
                                    }}
                                    className={`w-full text-left p-4 rounded-2xl border transition-all ${
                                      isSelected
                                        ? 'border-student-green bg-green-50 text-student-green font-bold'
                                        : 'border-slate-100 hover:border-slate-200 text-slate-700'
                                    }`}
                                  >
                                    {sub}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <button
                  disabled={!formData.subject_id}
                  onClick={() => setFormStep(2)}
                  className="w-full py-4 bg-student-green text-white rounded-2xl font-bold shadow-lg shadow-green-100 hover:opacity-90 transition-all disabled:opacity-50"
                >
                  Continue to Step 2
                </button>
              </div>
            )}

            {formStep === 2 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Specific Topic</label>
                  <input 
                    type="text"
                    value={formData.topic}
                    onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-student-green outline-none font-medium"
                    placeholder="e.g. Calculus, Organic Chemistry, etc."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl h-32 focus:ring-2 focus:ring-student-green outline-none resize-none font-medium"
                    placeholder="Describe your problem in detail... (e.g. I have a mock exam next week and don't understand integration.)"
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Snap a Problem (Optional)</label>
                  <div className="relative">
                    <input 
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      id="problem-image-upload"
                    />
                    <label 
                      htmlFor="problem-image-upload"
                      className={`w-full py-8 border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
                        formData.problem_image 
                          ? 'border-student-green bg-green-50' 
                          : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      {formData.problem_image ? (
                        <div className="relative w-full px-4 flex flex-col items-center gap-2">
                          <img 
                            src={formData.problem_image} 
                            alt="Problem preview" 
                            className="h-32 rounded-xl object-cover shadow-md"
                          />
                          <span className="text-xs font-bold text-student-green">Problem Snapped! Tap to change.</span>
                        </div>
                      ) : (
                        <>
                          <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center">
                            <Plus className="w-6 h-6 text-slate-400" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-bold text-slate-900">Take a Photo</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase">Upload exam paper or question</p>
                          </div>
                        </>
                      )}
                    </label>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => setFormStep(1)}
                    className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                  >
                    Back
                  </button>
                  <button
                    disabled={!formData.topic || !formData.description}
                    onClick={() => setFormStep(3)}
                    className="flex-[2] py-4 bg-student-green text-white rounded-2xl font-bold shadow-lg shadow-green-100 hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    Continue to Step 3
                  </button>
                </div>
              </div>
            )}

            {formStep === 3 && (
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Format Toggle */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Lesson Format</label>
                  <div className="flex p-1 bg-slate-100 rounded-2xl gap-1">
                    {(['online', 'whatsapp', 'in_person'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setFormData({ ...formData, format: fmt })}
                        className={`flex-1 py-3 rounded-xl text-[10px] font-black transition-all uppercase tracking-tight ${
                          formData.format === fmt 
                            ? 'bg-white text-zim-navy shadow-sm' 
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {fmt === 'online' ? 'Online (Zoom/Meet)' : fmt === 'whatsapp' ? 'WhatsApp' : 'In-Person'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Urgency / Date */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">When do you need help?</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['asap', 'tomorrow', 'specific'] as const).map((urg) => (
                      <button
                        key={urg}
                        type="button"
                        onClick={() => {
                          setFormData({ 
                            ...formData, 
                            urgency: urg,
                            scheduled_date: urg === 'asap' 
                              ? new Date().toISOString().split('T')[0] 
                              : urg === 'tomorrow' 
                                ? new Date(Date.now() + 86400000).toISOString().split('T')[0]
                                : formData.scheduled_date
                          });
                        }}
                        className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                          formData.urgency === urg 
                            ? 'border-student-green bg-green-50 text-student-green' 
                            : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200'
                        }`}
                      >
                        {urg === 'asap' ? 'ASAP (Today)' : urg === 'tomorrow' ? 'Tomorrow' : 'Specific Date'}
                      </button>
                    ))}
                  </div>
                  {formData.urgency === 'specific' && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <input 
                        type="date"
                        value={formData.scheduled_date}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-student-green outline-none font-medium"
                      />
                      <input 
                        type="time"
                        value={formData.scheduled_time}
                        onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-student-green outline-none font-medium"
                      />
                    </div>
                  )}
                  {formData.urgency !== 'specific' && (
                    <div className="mt-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Select Time</label>
                      <input 
                        type="time"
                        value={formData.scheduled_time}
                        onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                        className="w-full mt-1 p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-student-green outline-none font-medium"
                      />
                    </div>
                  )}
                </div>

                {/* Max Budget */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Your Max Budget ($USD/hr)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.offered_price}
                      onChange={(e) => setFormData({ ...formData, offered_price: e.target.value })}
                      className="w-full pl-8 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-student-green outline-none font-black text-2xl"
                      placeholder="0.00"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest ml-1">
                    This cap ensures tutors don't bid ridiculous amounts.
                  </p>
                </div>

                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setFormStep(2)}
                    className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={!formData.offered_price}
                    className="flex-[2] py-4 bg-student-green text-white rounded-2xl font-bold shadow-lg shadow-green-100 hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    Post Request to Marketplace
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <PaymentModal 
        isOpen={!!selectedBid}
        onClose={() => setSelectedBid(null)}
        onSuccess={handleAcceptBid}
        amount={selectedBid?.amount || 0}
        tutorName={selectedBid?.tutor_name || ''}
        lessonTitle={requests.find(r => r.id === selectedBid?.request_id)?.topic || 'Lesson Session'}
        bidId={selectedBid?.id || ''}
        studentId={user?.uid || ''}
        studentEmail={user?.email || ''}
      />

      <ReviewModal 
        isOpen={!!pendingReview}
        lesson={pendingReview || {}}
        onClose={() => setPendingReview(null)}
      />

      <DisputeModal 
        isOpen={!!disputeLesson}
        onClose={() => setDisputeLesson(null)}
        lessonId={disputeLesson?.id || ''}
        amount={disputeLesson?.amount || 0}
        onSuccess={() => {
          toast.success('Dispute logged. Admin will review.');
        }}
      />

      <TopUpModal 
        isOpen={showTopUpModal}
        onClose={() => setShowTopUpModal(false)}
        userId={user?.uid || ''}
        userEmail={user?.email || ''}
      />

      <SubjectSelectorModal 
        isOpen={showSubjectSelector}
        onClose={() => setShowSubjectSelector(false)}
        currentSubjects={profile?.subjects || []}
        allSubjects={subjects}
        onUpdate={handleUpdateSubjects}
      />
    </div>
  );
}

const DisputeModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  lessonId: string;
  amount: number;
  onSuccess: () => void;
}> = ({ isOpen, onClose, lessonId, amount, onSuccess }) => {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!reason) {
      toast.error('Please select a reason');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/lessons/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId, reason, details })
      });
      if (response.ok) {
        toast.success('Dispute submitted. Funds are frozen.');
        onSuccess();
        onClose();
      } else {
        throw new Error('Failed to submit dispute');
      }
    } catch (error) {
      toast.error('Error submitting dispute');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-[60] backdrop-blur-md">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-white w-full max-w-md p-8 rounded-[3rem] shadow-2xl space-y-8 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-red-50 rounded-full -mr-16 -mt-16 blur-3xl opacity-50" />
        
        <div className="flex justify-between items-center relative z-10">
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-[#001F3F] tracking-tight">Dispute Resolution</h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Lesson #{lessonId.slice(-4)}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-blue-600" />
            </div>
            <p className="text-sm font-bold text-slate-600">Locked Amount</p>
          </div>
          <p className="text-2xl font-black text-[#001F3F] tracking-tighter">${amount.toFixed(2)} Held Securely</p>
        </div>

        <div className="space-y-4">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">What is the issue?</p>
          <div className="space-y-2">
            {[
              'Tutor did not show up',
              'Technical/Audio Issues',
              'Tutor ended lesson early'
            ].map((opt) => (
              <button
                key={opt}
                onClick={() => setReason(opt)}
                className={`w-full p-5 rounded-2xl border-2 text-left transition-all flex items-center justify-between group ${
                  reason === opt 
                    ? 'border-red-500 bg-red-50 text-red-700' 
                    : 'border-slate-100 hover:border-slate-200 text-slate-600'
                }`}
              >
                <span className="font-bold">{opt}</span>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                  reason === opt ? 'border-red-500 bg-red-500' : 'border-slate-200'
                }`}>
                  {reason === opt && <div className="w-2 h-2 bg-white rounded-full" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">Additional Details (Optional)</p>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-[2rem] h-24 focus:ring-2 focus:ring-red-500 outline-none resize-none font-medium text-slate-600 transition-all"
            placeholder="Tell us more about what happened..."
          />
        </div>

        <div className="space-y-4 pt-2">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-5 border-2 border-red-500 text-red-500 rounded-[2rem] font-black text-lg hover:bg-red-500 hover:text-white transition-all shadow-xl shadow-red-500/10 active:scale-95 disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Submit Dispute & Freeze Funds'}
          </button>
          <p className="text-[10px] text-center text-slate-400 font-bold leading-relaxed px-4">
            Our admin team reviews disputes within 12 hours. If the tutor is at fault, your funds will be instantly refunded to your balance.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

const SubjectSelectorModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  currentSubjects: string[];
  allSubjects: any[];
  onUpdate: (subjects: string[]) => void;
}> = ({ isOpen, onClose, currentSubjects, allSubjects, onUpdate }) => {
  const [selected, setSelected] = useState<string[]>(currentSubjects);
  const [curriculum, setCurriculum] = useState<'ZIMSEC' | 'Cambridge'>('ZIMSEC');
  const [level, setLevel] = useState<'O-Level' | 'A-Level'>('O-Level');

  useEffect(() => {
    if (isOpen) setSelected(currentSubjects);
  }, [currentSubjects, isOpen]);

  const toggleSubject = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  if (!isOpen) return null;

  const filtered = allSubjects.filter(s => s.board === curriculum && s.level === level);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-[60] backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-2xl p-8 rounded-[2.5rem] shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar"
      >
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-black text-slate-900">Focus Subjects</h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Select subjects you want to track</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <div className="flex gap-4">
          <div className="flex-1 space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Curriculum</label>
            <div className="flex p-1 bg-slate-100 rounded-xl">
              {(['ZIMSEC', 'Cambridge'] as const).map(c => (
                <button
                  key={c}
                  onClick={() => setCurriculum(c)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${curriculum === c ? 'bg-white text-zim-navy shadow-sm' : 'text-slate-500'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Level</label>
            <div className="flex p-1 bg-slate-100 rounded-xl">
              {(['O-Level', 'A-Level'] as const).map(l => (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${level === l ? 'bg-white text-zim-navy shadow-sm' : 'text-slate-500'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(s => (
            <button
              key={s.id}
              onClick={() => toggleSubject(s.id)}
              className={`p-4 rounded-2xl text-sm font-bold border-2 transition-all text-left flex items-center justify-between group ${
                selected.includes(s.id) 
                  ? 'border-zim-green bg-green-50 text-zim-green' 
                  : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-200'
              }`}
            >
              <span>{s.name}</span>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                selected.includes(s.id) ? 'bg-zim-green border-zim-green' : 'border-slate-200'
              }`}>
                {selected.includes(s.id) && <CheckCircle className="w-3 h-3 text-white" />}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-2 py-12 text-center text-slate-400 italic">
              No subjects found for this selection.
            </div>
          )}
        </div>

        <div className="pt-4">
          <button
            onClick={() => onUpdate(selected)}
            className="w-full py-4 bg-zim-navy text-white rounded-2xl font-bold shadow-xl hover:opacity-90 transition-all active:scale-[0.98]"
          >
            Save Focus Subjects ({selected.length})
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const SyllabusItem: React.FC<{ 
  subject: any, 
  progress?: any, 
  onToggleSubtopic: (subtopic: string) => void 
}> = ({ subject, progress, onToggleSubtopic }) => {
  const [expanded, setExpanded] = useState(false);
  const subtopics = ['Introduction', 'Core Concepts', 'Advanced Topics', 'Exam Practice'];
  
  return (
    <div className="space-y-2">
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-zim-green" />
          <span className="font-bold text-slate-700">{subject.name}</span>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />}
      </button>
      {expanded && (
        <div className="pl-8 space-y-2 border-l-2 border-slate-100 ml-4">
          {subtopics.map(topic => {
            const isCompleted = progress?.completed_subtopics?.includes(topic);
            return (
              <div 
                key={topic} 
                onClick={() => onToggleSubtopic(topic)}
                className="flex items-center justify-between py-1 group cursor-pointer"
              >
                <span className={`text-sm transition-colors ${isCompleted ? 'text-zim-green font-bold' : 'text-slate-500 group-hover:text-slate-900'}`}>{topic}</span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                  isCompleted ? 'bg-zim-green border-zim-green' : 'border-slate-200 group-hover:border-zim-green'
                }`}>
                  {isCompleted && <CheckCircle className="w-3 h-3 text-white" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const FocusCard: React.FC<{ subject: any, progress?: any, onAdd?: () => void }> = ({ subject, progress, onAdd }) => {
  const totalSubtopics = 4;
  const completedCount = progress?.completed_subtopics?.length || 0;
  const percentage = Math.round((completedCount / totalSubtopics) * 100);

  return (
    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6 hover:shadow-md transition-shadow group">
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
            {subject.level} {subject.board}
          </div>
          <h3 className="text-xl font-bold text-slate-900">{subject.name}</h3>
        </div>
        <button 
          onClick={onAdd}
          className="p-2 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <div className="flex justify-center py-4">
        <div className="relative w-32 h-32">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#f1f5f9" strokeWidth="8" />
            <circle 
              cx="50" cy="50" r="45" fill="none" stroke={percentage === 100 ? '#2E7D32' : '#1A237E'} 
              strokeWidth="8" strokeDasharray={`${percentage * 2.82} 282`} strokeLinecap="round" 
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-black text-slate-900">{percentage}%</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-slate-50">
        <div className="flex items-center gap-2">
          {percentage === 100 ? (
            <div className="flex items-center gap-1.5 text-zim-green font-bold text-xs">
              <CheckCircle className="w-4 h-4" />
              Completed
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-zim-navy font-bold text-xs">
              <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
              In Progress
            </div>
          )}
        </div>
        <button 
          onClick={() => toast('Syllabus view coming soon!', { icon: '📚' })}
          className="text-xs font-bold text-slate-400 hover:text-slate-900 transition-colors"
        >
          View Syllabus
        </button>
      </div>
    </div>
  );
};

const TutorStatus: React.FC<{ tutorId: string }> = ({ tutorId }) => {
  const [isOnline, setIsOnline] = useState<boolean>(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'tutor_profiles', tutorId), (snap) => {
      if (snap.exists()) {
        setIsOnline(snap.data().is_online || false);
      }
    });
    return () => unsub();
  }, [tutorId]);

  return (
    <div 
      className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ${
        isOnline ? 'bg-emerald-500' : 'bg-slate-300'
      }`}
      title={isOnline ? 'Online' : 'Offline'}
    />
  );
};

const TutorOnlineText: React.FC<{ tutorId: string }> = ({ tutorId }) => {
  const [isOnline, setIsOnline] = useState<boolean>(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'tutor_profiles', tutorId), (snap) => {
      if (snap.exists()) {
        setIsOnline(snap.data().is_online || false);
      }
    });
    return () => unsub();
  }, [tutorId]);

  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest ${isOnline ? 'text-emerald-500' : 'text-slate-400'}`}>
      {isOnline ? '• Online' : '• Offline'}
    </span>
  );
};

const BiddingRequest: React.FC<{ 
  request: any, 
  bids: any[],
  subjects: any[], 
  sortBy: 'rating' | 'price',
  onAccept: (bid: any) => void 
}> = ({ request, bids: initialBids, subjects, sortBy, onAccept }) => {
  const subject = subjects.find(s => s.id === request.subject_id);

  const sortedBids = [...initialBids].sort((a, b) => {
    if (sortBy === 'rating') {
      return (b.tutor_rating || 0) - (a.tutor_rating || 0);
    } else {
      return (a.amount || 0) - (b.amount || 0);
    }
  });

  const handleCounterOffer = (bid: any) => {
    const amount = prompt(`Enter counter offer for ${bid.tutor_name} (Current: $${bid.amount}):`);
    if (amount && !isNaN(parseFloat(amount))) {
      toast.success(`Counter offer of $${amount} sent to ${bid.tutor_name}`);
      // In a real app, this would update the bid status or create a notification
    }
  };

  return (
    <div className="bg-slate-50 rounded-[2rem] p-6 border border-slate-100 shadow-sm space-y-5 relative overflow-hidden group">
      {sortedBids.length > 0 && sortBy === 'rating' && (
        <div className="absolute top-0 right-0 py-1.5 px-4 bg-zim-navy text-white text-[8px] font-black uppercase tracking-[0.2em] rounded-bl-2xl shadow-lg z-10">
          AI Smart Match Active
        </div>
      )}
      <div className="space-y-1">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          {subject?.board} {subject?.level}-Level
        </div>
        <h4 className="text-lg font-black text-slate-900 group-hover:text-tutor-blue transition-colors">{subject?.name} - {request.topic}</h4>
      </div>

      <div className="space-y-4">
        {sortedBids.map((bid, index) => {
          const isTopMatch = index === 0 && sortBy === 'rating';
          return (
            <div key={bid.id} className={`p-5 rounded-2xl border-2 transition-all relative ${
              isTopMatch ? 'bg-white border-tutor-blue shadow-lg ring-4 ring-tutor-blue/5' : 'bg-white/80 border-slate-100 shadow-sm'
            }`}>
              {isTopMatch && (
                <div className="absolute -top-3 left-4 bg-tutor-blue text-white text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-md">
                  AI Top Pick
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 bg-slate-200 rounded-2xl overflow-hidden shadow-inner">
                      <img src={`https://picsum.photos/seed/${bid.tutor_id}/100/100`} alt="" referrerPolicy="no-referrer" />
                    </div>
                    <TutorStatus tutorId={bid.tutor_id} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-slate-900">{bid.tutor_name}</span>
                      {bid.is_verified !== false && (
                        <ShieldCheck className="w-3.5 h-3.5 text-tutor-blue" title="Background Checked" />
                      )}
                      <TutorOnlineText tutorId={bid.tutor_id} />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-1 bg-yellow-400/10 text-yellow-600 px-2 py-0.5 rounded text-[10px] font-bold">
                        <Star className="w-3 h-3 fill-current" />
                        {bid.tutor_rating || '5.0'}
                      </div>
                      {isTopMatch && (
                        <div className="text-[10px] font-black text-emerald-500 uppercase tracking-tighter">
                          Extreme Subject Match
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pricing</div>
                  <div className="text-xl font-black text-zim-navy">${bid.amount}</div>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button 
                  onClick={() => onAccept(bid)}
                  className={`flex-[2] py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-95 ${
                    isTopMatch ? 'bg-student-green text-white shadow-green-100' : 'bg-zim-navy text-white shadow-blue-100 hover:opacity-90'
                  }`}
                >
                  Accept & Escrow
                </button>
                <button 
                  onClick={() => handleCounterOffer(bid)}
                  className="flex-1 py-3 border-2 border-slate-100 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all hover:border-slate-200 active:scale-95"
                >
                  Counter
                </button>
              </div>
            </div>
          );
        })}
        {sortedBids.length === 0 && (
          <div className="text-center py-4 text-xs text-slate-400 italic">
            Waiting for tutors to bid...
          </div>
        )}
      </div>
    </div>
  );
};
