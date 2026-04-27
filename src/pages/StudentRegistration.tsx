import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, updateDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { 
  User, 
  BookOpen, 
  MapPin, 
  ShieldCheck, 
  Camera, 
  ChevronRight, 
  ChevronLeft,
  ArrowLeft,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';

const ZIMBABWE_CITIES = [
  'Harare', 'Bulawayo', 'Chitungwiza', 'Mutare', 'Epworth', 'Gweru', 'Kwekwe', 'Kadoma', 'Masvingo', 'Chinhoyi'
];

export default function StudentRegistration() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [allSubjects, setAllSubjects] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    full_name: profile?.full_name || '',
    email: profile?.email || '',
    phone: '',
    photo_url: '',
    curriculum: 'ZIMSEC' as 'ZIMSEC' | 'Cambridge',
    academic_level: 'O-Level' as 'O-Level' | 'A-Level',
    subjects: [] as string[],
    city: '',
    otp: '',
    referral_code_input: ''
  });

  const [codeSent, setCodeSent] = useState(false);

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const snap = await getDocs(collection(db, 'subjects'));
        setAllSubjects(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'subjects');
      }
    };
    fetchSubjects();
  }, []);

  const handleSendOTP = () => {
    if (!formData.phone) {
      return toast.error('Please enter your phone number first');
    }
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      setCodeSent(true);
      toast.success(`Verification code sent to ${formData.phone}`);
      setStep(4); // Jump to verification step
    }, 1500);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      return toast.error('Image must be less than 5MB');
    }

    setUploadingImage(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.src = reader.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Compress to JPEG with 0.7 quality
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setFormData(prev => ({ ...prev, photo_url: compressedDataUrl }));
        setUploadingImage(false);
        toast.success('Photo uploaded and optimized!');
      };
    };
    reader.onerror = () => {
      setUploadingImage(false);
      toast.error('Failed to read file');
    };
    reader.readAsDataURL(file);
  };

  const filteredSubjects = allSubjects.filter(s => 
    s.board === formData.curriculum && s.level === formData.academic_level
  );

  const handleNext = () => {
    // Validation
    if (step === 1) {
      if (!formData.full_name || !formData.email || !formData.phone) {
        return toast.error('Please fill in all required fields');
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        return toast.error('Please enter a valid email address');
      }
    } else if (step === 2) {
      if (formData.subjects.length === 0) {
        return toast.error('Please select at least one subject of interest');
      }
    } else if (step === 3) {
      if (!formData.city) {
        return toast.error('Please select your city');
      }
    }

    setStep(s => s + 1);
  };
  const handleBack = () => setStep(s => s - 1);

  const toggleSubject = (id: string) => {
    setFormData(prev => ({
      ...prev,
      subjects: prev.subjects.includes(id) 
        ? prev.subjects.filter(s => s !== id)
        : [...prev.subjects, id]
    }));
  };

  const handleSubmit = async () => {
    if (!user) return;
    
    if (formData.otp !== '123456') {
      return toast.error('Invalid verification code. Please use 123456 for demo.');
    }

    setLoading(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      // Remove otp and referral_code_input from data sent to firestore
      const { otp, referral_code_input, ...profileData } = formData;
      
      // Generate a unique referral code for this user
      const myReferralCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      await updateDoc(userRef, {
        ...profileData,
        referral_code: myReferralCode,
        referred_by: referral_code_input || null,
        is_registered: true,
        updated_at: serverTimestamp()
      });
      await refreshProfile();
      toast.success('Registration complete!');
      navigate('/dashboard');
    } catch (error) {
      console.error('Registration Error:', error);
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      toast.error('Failed to save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-slate-900">Account Creation</h2>
              <p className="text-slate-500 text-sm">Let's establish your presence</p>
            </div>

            <div className="flex justify-center">
              <div className="relative group">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  accept="image/*"
                  className="hidden"
                />
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center border-2 border-dashed border-slate-300 group-hover:border-student-green transition-colors overflow-hidden cursor-pointer relative"
                >
                  {uploadingImage ? (
                    <Loader2 className="w-8 h-8 text-student-green animate-spin" />
                  ) : formData.photo_url ? (
                    <img src={formData.photo_url} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-8 h-8 text-slate-400" />
                  )}
                </div>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 p-2 bg-student-green text-white rounded-full shadow-lg hover:scale-110 transition-transform"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Full Name</label>
                <input 
                  type="text"
                  value={formData.full_name}
                  onChange={e => setFormData({...formData, full_name: e.target.value})}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-student-green outline-none"
                  placeholder="Enter your full name"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Email Address</label>
                <input 
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-student-green outline-none"
                  placeholder="e.g. name@example.com"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Referral Code (Optional)</label>
                <input 
                  type="text"
                  value={formData.referral_code_input}
                  onChange={e => setFormData({...formData, referral_code_input: e.target.value.toUpperCase()})}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-student-green outline-none"
                  placeholder="Enter code if you were invited"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Phone Number</label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <input 
                      type="tel"
                      value={formData.phone}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-student-green outline-none"
                      placeholder="+263 7XX XXX XXX"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 italic">Used for 2FA and secure login</p>
              </div>
            </div>
          </motion.div>
        );
      case 2:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-slate-900">Academic Profile</h2>
              <p className="text-slate-500 text-sm">Personalize your learning engine</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Default Curriculum</label>
                <div className="grid grid-cols-2 gap-3">
                  {['ZIMSEC', 'Cambridge'].map(c => (
                    <button
                      key={c}
                      onClick={() => setFormData({...formData, curriculum: c as any})}
                      className={`p-4 rounded-xl border-2 font-bold transition-all ${formData.curriculum === c ? 'border-student-green bg-green-50 text-student-green' : 'border-slate-100 text-slate-400'}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Academic Level</label>
                <div className="grid grid-cols-2 gap-3">
                  {['O-Level', 'A-Level'].map(l => (
                    <button
                      key={l}
                      onClick={() => setFormData({...formData, academic_level: l as any})}
                      className={`p-4 rounded-xl border-2 font-bold transition-all ${formData.academic_level === l ? 'border-student-green bg-green-50 text-student-green' : 'border-slate-100 text-slate-400'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Subjects of Interest</label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border border-slate-100 rounded-xl">
                  {filteredSubjects.map(s => (
                    <button
                      key={s.id}
                      onClick={() => toggleSubject(s.id)}
                      className={`p-2 rounded-lg text-xs font-medium border transition-all ${formData.subjects.includes(s.id) ? 'bg-student-green text-white border-student-green' : 'bg-white text-slate-600 border-slate-200'}`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        );
      case 3:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-slate-900">Location</h2>
              <p className="text-slate-500 text-sm">Marketplace filtering for compatibility</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">City / Province</label>
                <div className="grid grid-cols-2 gap-2">
                  {ZIMBABWE_CITIES.map(city => (
                    <button
                      key={city}
                      onClick={() => setFormData({...formData, city})}
                      className={`p-3 rounded-xl border-2 text-sm font-bold transition-all ${formData.city === city ? 'border-student-green bg-green-50 text-student-green' : 'border-slate-100 text-slate-400'}`}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        );
      case 4:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-slate-900">Verification</h2>
              <p className="text-slate-500 text-sm">CS "Liveness" Check</p>
            </div>

            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <ShieldCheck className="w-8 h-8 text-student-green" />
              </div>
              
              {!codeSent ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">We need to verify your phone number: <span className="font-bold">{formData.phone || 'Not provided'}</span></p>
                  <button 
                    onClick={handleSendOTP}
                    disabled={loading || !formData.phone}
                    className="w-full py-3 bg-student-green text-white rounded-xl font-bold shadow-lg shadow-green-100 hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {loading ? 'Sending...' : 'Send Verification Code'}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600">Enter the 6-digit code sent to <span className="font-bold">{formData.phone}</span></p>
                    <div className="flex justify-center gap-2">
                      {[1,2,3,4,5,6].map(i => (
                        <div key={i} className="w-10 h-12 bg-white border-2 border-slate-200 rounded-lg flex items-center justify-center font-bold text-xl">
                          {formData.otp[i-1] || ''}
                        </div>
                      ))}
                    </div>
                    <input 
                      type="text" 
                      maxLength={6}
                      value={formData.otp}
                      onChange={e => setFormData({...formData, otp: e.target.value})}
                      className="absolute opacity-0 pointer-events-none"
                      autoFocus
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <button 
                      onClick={() => setFormData({...formData, otp: '123456'})}
                      className="text-xs font-bold text-student-green hover:underline"
                    >
                      Auto-fill (Demo: 123456)
                    </button>
                    <button 
                      onClick={handleSendOTP}
                      className="text-xs font-bold text-slate-400 hover:text-slate-600"
                    >
                      Resend Code
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 relative">
      <button 
        onClick={() => navigate('/')}
        className="absolute top-8 left-8 flex items-center gap-2 text-slate-400 hover:text-slate-600 font-bold text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Home
      </button>
      <div className="w-full max-w-lg space-y-8">
        {/* Progress Bar */}
        <div className="flex justify-between items-center px-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${step >= i ? 'bg-student-green text-white shadow-lg shadow-green-100' : 'bg-slate-100 text-slate-400'}`}>
                {step > i ? <CheckCircle2 className="w-5 h-5" /> : i}
              </div>
              {i < 4 && <div className={`w-12 h-1 transition-all ${step > i ? 'bg-student-green' : 'bg-slate-100'}`} />}
            </div>
          ))}
        </div>

        <div className="min-h-[400px]">
          <AnimatePresence mode="wait">
            {renderStep()}
          </AnimatePresence>
        </div>

        <div className="flex gap-4 pt-8">
          {step > 1 && (
            <button
              onClick={handleBack}
              className="flex-1 p-4 border-2 border-slate-100 rounded-2xl font-bold text-slate-400 flex items-center justify-center gap-2 hover:bg-slate-50 transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
              Back
            </button>
          )}
          <button
            onClick={step === 4 ? handleSubmit : handleNext}
            disabled={loading}
            className="flex-[2] p-4 bg-student-green text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-green-100 disabled:opacity-50"
          >
            {loading ? 'Processing...' : step === 4 ? 'Complete Registration' : 'Continue'}
            {!loading && <ChevronRight className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function Plus(props: any) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}
