import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ShieldAlert, Lock, Mail, Key, ArrowRight, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

export default function AdminLogin() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { signInWithEmail, profile } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      // After login, we wait for profile to be fetched by AuthContext
      // But for the UI flow, we'll just move to step 2
      setStep(2);
      toast.success('Credentials verified. Please enter 2FA code.');
    } catch (error: any) {
      toast.error(error.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handle2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Simulating 2FA verification
    // In a real app, this would call a backend function to verify the code
    setTimeout(() => {
      if (twoFactorCode === '123456') {
        if (profile?.role?.toLowerCase() === 'admin' || profile?.role?.toLowerCase() === 'super-admin') {
          toast.success('Super-Admin Access Granted');
          navigate('/admin/finance');
        } else {
          toast.error('Unauthorized access attempt logged.');
          navigate('/404');
        }
      } else {
        toast.error('Invalid 2FA code');
      }
      setLoading(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#001F3F] flex items-center justify-center p-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(40,167,69,0.1),transparent_50%)]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden relative z-10"
      >
        <div className="p-8 bg-slate-50 border-b border-slate-100 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-[#001F3F] rounded-2xl flex items-center justify-center mb-4 shadow-xl">
            <ShieldAlert className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-black text-[#001F3F] tracking-tight">Admin Secure Portal</h1>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-1">Authorized Personnel Only</p>
        </div>

        <div className="p-8">
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.form 
                key="step1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onSubmit={handleLogin} 
                className="space-y-6"
              >
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Admin Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input 
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-medium"
                      placeholder="admin@tutorconnect.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Secure Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input 
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-medium"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-[#001F3F] text-white rounded-2xl font-black shadow-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Authenticate'}
                  <ArrowRight className="w-5 h-5" />
                </button>
              </motion.form>
            ) : (
              <motion.form 
                key="step2"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onSubmit={handle2FA} 
                className="space-y-6"
              >
                <div className="text-center space-y-2 mb-6">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                    <Key className="w-6 h-6 text-emerald-600" />
                  </div>
                  <h3 className="font-bold text-slate-900">Two-Factor Authentication</h3>
                  <p className="text-xs text-slate-500">Enter the 6-digit code sent to your device</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 text-center block">Verification Code</label>
                  <input 
                    type="text"
                    required
                    maxLength={6}
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value)}
                    className="w-full text-center text-3xl tracking-[0.5em] py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-black"
                    placeholder="000000"
                  />
                </div>

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black shadow-xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? 'Validating...' : 'Verify & Enter'}
                  <ShieldCheck className="w-5 h-5" />
                </button>

                <p className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                  Demo Code: 123456
                </p>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
