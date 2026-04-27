import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Phone, CreditCard, BookOpen, Award, CheckCircle, ChevronRight, ChevronLeft, ArrowLeft, Upload, Camera, Globe, Briefcase, DollarSign, Wallet, ShieldCheck, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { seedSubjects } from '../lib/seeder';
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

const STEPS = [
  { id: 1, title: 'Basic Info', icon: User },
  { id: 2, title: 'Professional Profile', icon: Briefcase },
  { id: 3, title: 'Verification Vault', icon: ShieldCheck },
  { id: 4, title: 'Teaching Perimeter', icon: BookOpen },
  { id: 5, title: 'Financial Setup', icon: Wallet }
];

export default function TutorRegistration() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [allSubjects, setAllSubjects] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    // Phase 1
    full_name: profile?.full_name || '',
    email: profile?.email || '',
    phone: '',
    national_id_number: '',
    // Phase 2
    bio: '',
    teaching_experience: '',
    languages: [] as string[],
    photo_url: profile?.photo_url || '',
    // Phase 3
    id_document_url: '',
    certificate_url: '',
    qualification_url: '',
    // Phase 4
    curriculum: 'ZIMSEC' as 'ZIMSEC' | 'Cambridge' | 'Both',
    levels: [] as string[],
    subjects: [] as string[],
    // Phase 5
    payout_method: 'EcoCash' as 'EcoCash' | 'InnBucks' | 'Bank Transfer',
    payout_details: ''
  });

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        let snap = await getDocs(collection(db, 'subjects'));
        if (snap.empty) {
          try {
            await seedSubjects();
            snap = await getDocs(collection(db, 'subjects'));
          } catch (e) {
            console.warn('Failed to seed subjects, likely not an admin:', e);
          }
        }
        setAllSubjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error('Error fetching subjects:', error);
      }
    };
    fetchSubjects();
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({});
  const [activeUploadField, setActiveUploadField] = useState<string | null>(null);
  const [isAiVerifying, setIsAiVerifying] = useState(false);
  const [aiVerificationResult, setAiVerificationResult] = useState<{
    matches: boolean;
    confidence: number;
    details: string;
  } | null>(null);

  const verifyIdentityWithAI = async (idBase64: string, selfieBase64: string) => {
    if (isAiVerifying) return;
    setIsAiVerifying(true);
    const toastId = toast.loading('AI is scanning documents and performing biometric match...');

    try {
      // Remove data URL prefix
      const idData = idBase64.split(',')[1];
      const selfieData = selfieBase64.split(',')[1];

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              {
                text: `You are an Identity Verification Expert for TutorConnect Zimbabwe. 
                Below are two images: a National ID/Passport and a live selfie. 
                Task:
                1. Determine if the person in the selfie matches the person on the ID.
                2. Verify if the ID looks authentic (Zimbabwean National ID or Passport).
                3. Return your final decision in JSON format.
                
                Expected JSON:
                {
                  "matches": boolean,
                  "confidence": number (0-100),
                  "details": "Short explanation of the match or discrepancy"
                }`
              },
              { inlineData: { mimeType: "image/jpeg", data: idData } },
              { inlineData: { mimeType: "image/jpeg", data: selfieData } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json"
        }
      });

      const result = JSON.parse(response.text || '{}');
      setAiVerificationResult(result);
      
      if (result.matches) {
        toast.success(`Biometric Match Successful (${result.confidence}%)`, { id: toastId });
      } else {
        toast.error('Biometric Match Failed: The selfie does not match the ID.', { id: toastId, duration: 6000 });
      }
    } catch (error) {
      console.error('AI Verification Error:', error);
      toast.error('AI verification service is temporarily unavailable. An admin will verify manually.', { id: toastId });
    } finally {
      setIsAiVerifying(false);
    }
  };

  useEffect(() => {
    // Automatically trigger AI verification when both are uploaded in phase 3
    if (currentStep === 3 && formData.id_document_url && formData.photo_url && !aiVerificationResult && !isAiVerifying) {
      verifyIdentityWithAI(formData.id_document_url, formData.photo_url);
    }
  }, [currentStep, formData.id_document_url, formData.photo_url]);

  const handleFileSelect = (field: string) => {
    setActiveUploadField(field);
    fileInputRef.current?.click();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeUploadField) return;

    // Check file size
    const isImage = file.type.startsWith('image/');
    const maxSize = isImage ? 5 * 1024 * 1024 : 500 * 1024; // 5MB for images, 500KB for PDFs
    
    if (file.size > maxSize) {
      return toast.error(`File is too large. Max size for ${isImage ? 'images' : 'PDFs'} is ${isImage ? '5MB' : '500KB'}.`);
    }

    // Simulate upload progress
    setUploadProgress(prev => ({ ...prev, [activeUploadField]: 0 }));
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 30;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        
        const reader = new FileReader();
        reader.onloadend = () => {
          if (isImage) {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;

              // Max dimension 1200px (increased from 800 for better quality)
              const MAX_DIM = 1200;
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
              
              // Compress to 0.7 quality
              const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
              
              setFormData(prev => ({ ...prev, [activeUploadField]: compressedBase64 }));
              setUploadProgress(prev => ({ ...prev, [activeUploadField]: 100 }));
              toast.success('Image uploaded and optimized!');
            };
            img.src = reader.result as string;
          } else {
            // For PDFs, just use the base64 as is (already checked size)
            setFormData(prev => ({ ...prev, [activeUploadField]: reader.result as string }));
            setUploadProgress(prev => ({ ...prev, [activeUploadField]: 100 }));
            toast.success('PDF uploaded successfully!');
          }
          
          if (activeUploadField === 'certificate_url') {
            toast('AI is analyzing your certificate...', { icon: '⏳' });
          }
        };
        reader.readAsDataURL(file);
      }
      setUploadProgress(prev => ({ ...prev, [activeUploadField]: Math.min(progress, 100) }));
    }, 200);
  };

  const handleNext = () => {
    // Validation
    if (currentStep === 1) {
      if (!formData.full_name || !formData.phone || !formData.email || !formData.national_id_number) {
        return toast.error('Please fill in all basic information');
      }
    } else if (currentStep === 2) {
      if (!formData.photo_url || !formData.bio || !formData.teaching_experience || formData.languages.length === 0) {
        return toast.error('Please complete your professional profile');
      }
      if (formData.bio.split(' ').length < 20) {
        return toast.error('Your bio is too short. Please provide at least 20 words.');
      }
    } else if (currentStep === 3) {
      if (!formData.id_document_url || !formData.certificate_url) {
        return toast.error('Please upload your ID and at least one Academic Certificate');
      }
    } else if (currentStep === 4) {
      if (formData.levels.length === 0 || formData.subjects.length === 0) {
        return toast.error('Please select your teaching levels and subjects');
      }
    }

    setCurrentStep(prev => Math.min(prev + 1, STEPS.length));
  };
  const handlePrev = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  const handleSubmit = async () => {
    if (!user) return;
    
    // Step 5 Validation
    if (!formData.payout_method || !formData.payout_details) {
      return toast.error('Please provide your payout information');
    }

    setLoading(true);
    try {
      // 1. Update main user profile
      await updateDoc(doc(db, 'users', user.uid), {
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        photo_url: formData.photo_url,
        is_registered: true,
        updated_at: serverTimestamp()
      });

      // 2. Create/Update tutor profile
      await setDoc(doc(db, 'tutor_profiles', user.uid), {
        national_id_number: formData.national_id_number,
        bio: formData.bio,
        teaching_experience: formData.teaching_experience,
        languages: formData.languages,
        id_document_url: formData.id_document_url,
        certificate_url: formData.certificate_url,
        qualification_url: formData.qualification_url,
        curriculum: formData.curriculum,
        levels: formData.levels,
        subjects: formData.subjects,
        payout_method: formData.payout_method,
        payout_details: formData.payout_details,
        is_verified: false,
        is_online: false,
        free_bids_remaining: 3,
        verification_status: {
          id: aiVerificationResult?.matches ? 'verified' : 'pending',
          certificates: 'checking', 
          face_match: aiVerificationResult?.matches ? 'verified' : 'failed',
          payout: formData.payout_details ? 'verified' : 'missing',
          ai_confidence: aiVerificationResult?.confidence || 0,
          ai_details: aiVerificationResult?.details || ''
        },
        verification_score: aiVerificationResult?.matches ? 85 : 40, 
        total_rating_sum: 0,
        total_ratings: 0,
        avg_rating: 0,
        created_at: serverTimestamp()
      });

      await refreshProfile();
      toast.success('Onboarding complete! Welcome to TutorConnect.');
      navigate('/dashboard');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `tutor_profiles/${user.uid}`);
      toast.error('Failed to complete registration');
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Full Legal Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input 
                    type="text"
                    value={formData.full_name}
                    onChange={e => setFormData({...formData, full_name: e.target.value})}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-tutor-blue outline-none"
                    placeholder="As it appears on your ID"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Email Address</label>
                <div className="relative">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input 
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-tutor-blue outline-none"
                    placeholder="your@email.com"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Phone Number (WhatsApp)</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input 
                    type="tel"
                    value={formData.phone}
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-tutor-blue outline-none"
                    placeholder="+263 7..."
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">National ID Number</label>
                <div className="relative">
                  <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input 
                    type="text"
                    value={formData.national_id_number}
                    onChange={e => setFormData({...formData, national_id_number: e.target.value})}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-tutor-blue outline-none"
                    placeholder="XX-XXXXXXX-X-XX"
                  />
                </div>
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Profile Picture</label>
                <div className="flex items-center gap-6">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-2xl bg-slate-100 border-2 border-slate-200 overflow-hidden relative">
                      {formData.photo_url ? (
                        <img src={formData.photo_url} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <Camera className="w-8 h-8" />
                        </div>
                      )}
                      {uploadProgress['photo_url'] !== undefined && uploadProgress['photo_url'] < 100 && (
                        <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                          <div className="w-6 h-6 border-2 border-tutor-blue border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleFileSelect('photo_url')}
                      className="absolute -bottom-2 -right-2 p-2 bg-tutor-blue text-white rounded-xl shadow-lg hover:scale-110 transition-all"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-bold text-slate-700">Upload a professional photo</p>
                    <p className="text-xs text-slate-400">Required for Biometric Match. Max 5MB.</p>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Professional Bio</label>
                <textarea 
                  value={formData.bio}
                  onChange={e => setFormData({...formData, bio: e.target.value})}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-tutor-blue outline-none h-32 resize-none"
                  placeholder="Summarize your teaching style and experience (max 200 words)"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Teaching Experience</label>
                <input 
                  type="text"
                  value={formData.teaching_experience}
                  onChange={e => setFormData({...formData, teaching_experience: e.target.value})}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-tutor-blue outline-none"
                  placeholder="e.g. 5 years at Prince Edward School"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Languages</label>
                <div className="flex flex-wrap gap-2">
                  {['English', 'Shona', 'Ndebele'].map(lang => (
                    <button
                      key={lang}
                      onClick={() => {
                        const langs = formData.languages.includes(lang)
                          ? formData.languages.filter(l => l !== lang)
                          : [...formData.languages, lang];
                        setFormData({...formData, languages: langs});
                      }}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                        formData.languages.includes(lang)
                          ? 'bg-tutor-blue text-white'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6">
            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex gap-3">
              <ShieldCheck className="w-6 h-6 text-tutor-blue shrink-0" />
              <p className="text-sm text-blue-700 font-medium">
                Upload high-resolution documents. Our AI will verify these in real-time.
              </p>
            </div>
            <div className="space-y-4">
              {aiVerificationResult && (
                <div className={`p-4 rounded-2xl border flex items-center gap-4 ${
                  aiVerificationResult.matches ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'
                }`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    aiVerificationResult.matches ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                  }`}>
                    {aiVerificationResult.matches ? <CheckCircle className="w-6 h-6" /> : <X className="w-6 h-6" />}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-black uppercase tracking-wider ${
                      aiVerificationResult.matches ? 'text-emerald-700' : 'text-red-700'
                    }`}>
                      {aiVerificationResult.matches ? 'AI Identity Verified' : 'Identity Conflict Detected'}
                    </p>
                    <p className="text-xs text-slate-500 font-medium">
                      Confidence Level: {aiVerificationResult.confidence}% • {aiVerificationResult.details}
                    </p>
                  </div>
                </div>
              )}
              {[
                { label: 'National ID / Passport', key: 'id_document_url' },
                { label: 'Academic Certificates', key: 'certificate_url' },
                { label: 'Teaching Qualifications (Optional)', key: 'qualification_url' }
              ].map(doc => (
                <div key={doc.key} className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">{doc.label}</label>
                  <div className="relative group">
                    <input 
                      type="text"
                      value={(formData as any)[doc.key]}
                      onChange={e => setFormData({...formData, [doc.key]: e.target.value})}
                      className="w-full pl-4 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-tutor-blue outline-none"
                      placeholder="Paste document URL or upload"
                    />
                    <button 
                      onClick={() => handleFileSelect(doc.key)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white rounded-lg shadow-sm border border-slate-100 text-slate-400 group-hover:text-tutor-blue transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                  </div>
                  {uploadProgress[doc.key] !== undefined && uploadProgress[doc.key] < 100 && (
                    <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mt-1">
                      <motion.div 
                        className="bg-tutor-blue h-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress[doc.key]}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Primary Curriculum</label>
                <div className="grid grid-cols-3 gap-2">
                  {['ZIMSEC', 'Cambridge', 'Both'].map(c => (
                    <button
                      key={c}
                      onClick={() => setFormData({...formData, curriculum: c as any})}
                      className={`py-3 rounded-xl text-sm font-bold transition-all ${
                        formData.curriculum === c
                          ? 'bg-tutor-blue text-white'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Academic Levels</label>
                <div className="grid grid-cols-2 gap-2">
                  {['O-Level', 'A-Level'].map(l => (
                    <button
                      key={l}
                      onClick={() => {
                        const levels = formData.levels.includes(l)
                          ? formData.levels.filter(lvl => lvl !== l)
                          : [...formData.levels, l];
                        setFormData({...formData, levels});
                      }}
                      className={`py-3 rounded-xl text-sm font-bold transition-all ${
                        formData.levels.includes(l)
                          ? 'bg-tutor-blue text-white'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Subjects</label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 border border-slate-100 rounded-xl">
                  {allSubjects.filter(s => formData.curriculum === 'Both' || s.board === formData.curriculum).length === 0 && (
                    <div className="col-span-2 py-4 text-center text-xs text-slate-400 italic">
                      No subjects found for this curriculum.
                    </div>
                  )}
                  {allSubjects.filter(s => 
                    (formData.curriculum === 'Both' || s.board === formData.curriculum) &&
                    (formData.levels.length === 0 || formData.levels.includes(s.level))
                  ).map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        const subs = formData.subjects.includes(s.id)
                          ? formData.subjects.filter(id => id !== s.id)
                          : [...formData.subjects, s.id];
                        setFormData({...formData, subjects: subs});
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold text-left transition-all ${
                        formData.subjects.includes(s.id)
                          ? 'bg-student-green text-white'
                          : 'bg-slate-50 text-slate-500 border border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      {s.name} ({s.level})
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Add Custom Subject</label>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    id="custom-subject"
                    className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-tutor-blue"
                    placeholder="e.g. Further Mathematics"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const input = e.currentTarget;
                        const val = input.value.trim();
                        if (val && !formData.subjects.includes(val)) {
                          setFormData({ ...formData, subjects: [...formData.subjects, val] });
                          input.value = '';
                        }
                      }
                    }}
                  />
                  <button 
                    type="button"
                    onClick={() => {
                      const input = document.getElementById('custom-subject') as HTMLInputElement;
                      const val = input.value.trim();
                      if (val && !formData.subjects.includes(val)) {
                        setFormData({ ...formData, subjects: [...formData.subjects, val] });
                        input.value = '';
                      }
                    }}
                    className="p-3 bg-tutor-blue text-white rounded-xl"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                {formData.subjects.filter(s => !allSubjects.find(as => as.id === s)).length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.subjects.filter(s => !allSubjects.find(as => as.id === s)).map(s => (
                      <div key={s} className="flex items-center gap-2 px-3 py-1 bg-student-green text-white rounded-full text-xs font-bold">
                        {s}
                        <X className="w-3 h-3 cursor-pointer" onClick={() => setFormData({...formData, subjects: formData.subjects.filter(id => id !== s)})} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Preferred Payout Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {['EcoCash', 'InnBucks', 'Bank Transfer'].map(m => (
                    <button
                      key={m}
                      onClick={() => setFormData({...formData, payout_method: m as any})}
                      className={`py-3 rounded-xl text-xs font-bold transition-all ${
                        formData.payout_method === m
                          ? 'bg-tutor-blue text-white'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">
                  {formData.payout_method === 'Bank Transfer' ? 'Account & Branch Details' : 'Mobile Number'}
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input 
                    type="text"
                    value={formData.payout_details}
                    onChange={e => setFormData({...formData, payout_details: e.target.value})}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-tutor-blue outline-none"
                    placeholder={formData.payout_method === 'Bank Transfer' ? 'Acc: 123456... Branch: 001' : '07...'}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-tutor-blue rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Tutor Onboarding</h1>
              <p className="text-xs text-slate-400 font-medium">Phase {currentStep} of {STEPS.length}</p>
            </div>
          </div>
          <button 
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-600 font-bold text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-100 h-1">
        <motion.div 
          className="bg-tutor-blue h-full"
          initial={{ width: 0 }}
          animate={{ width: `${(currentStep / STEPS.length) * 100}%` }}
        />
      </div>

      {/* Main Content */}
      <input 
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept="image/*,application/pdf"
      />
      <div className="flex-1 p-6">
        <div className="max-w-2xl mx-auto">
          {/* Step Indicators */}
          <div className="flex justify-between mb-12">
            {STEPS.map(step => {
              const Icon = step.icon;
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;
              return (
                <div key={step.id} className="flex flex-col items-center gap-2">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    isActive ? 'bg-tutor-blue text-white scale-110 shadow-lg shadow-blue-100' : 
                    isCompleted ? 'bg-student-green text-white' : 'bg-white text-slate-300 border border-slate-200'
                  }`}>
                    {isCompleted ? <CheckCircle className="w-6 h-6" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? 'text-tutor-blue' : 'text-slate-400'}`}>
                    {step.title.split(' ')[0]}
                  </span>
                </div>
              );
            })}
          </div>

          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100"
          >
            <h2 className="text-2xl font-bold text-slate-900 mb-2">{STEPS[currentStep-1].title}</h2>
            <p className="text-slate-400 text-sm mb-8 font-medium">Please provide accurate information to speed up verification.</p>
            
            {renderStep()}

            <div className="flex gap-4 mt-12">
              {currentStep > 1 && (
                <button
                  onClick={handlePrev}
                  className="flex-1 py-4 bg-slate-50 text-slate-600 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-100 transition-all"
                >
                  <ChevronLeft className="w-5 h-5" />
                  Back
                </button>
              )}
              {currentStep < STEPS.length ? (
                <button
                  onClick={handleNext}
                  className="flex-[2] py-4 bg-tutor-blue text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-blue-100"
                >
                  Continue
                  <ChevronRight className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-[2] py-4 bg-student-green text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-green-100 disabled:opacity-50"
                >
                  {loading ? 'Completing...' : 'Complete Onboarding'}
                  <CheckCircle className="w-5 h-5" />
                </button>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
