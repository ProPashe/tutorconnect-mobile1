import React from 'react';
import { GraduationCap, User, ShieldCheck } from 'lucide-react';
import { Logo } from '../components/Logo';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';

export default function LandingPage() {
  const { signInWithGoogle, profile } = useAuth();
  const navigate = useNavigate();

  const handleRoleSelection = async (role: 'student' | 'tutor') => {
    await signInWithGoogle(role);
    navigate('/dashboard');
  };

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super-admin';
  const { logout, user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white shrink-0">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-12"
      >
        <Logo className="mb-12" />

        <div className="space-y-4">
          <button
            onClick={() => handleRoleSelection('tutor')}
            className="w-full bg-tutor-blue text-white p-8 rounded-2xl flex items-center justify-between group hover:opacity-90 transition-opacity"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/10 rounded-xl">
                <GraduationCap className="w-8 h-8" />
              </div>
              <span className="text-xl font-semibold uppercase tracking-wider">I am a Tutor</span>
            </div>
          </button>

          <button
            onClick={() => handleRoleSelection('student')}
            className="w-full bg-student-green text-white p-8 rounded-2xl flex items-center justify-between group hover:opacity-90 transition-opacity"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/10 rounded-xl">
                <User className="w-8 h-8" />
              </div>
              <span className="text-xl font-semibold uppercase tracking-wider">I am a Student</span>
            </div>
          </button>

          {isAdmin && (
            <Link
              to="/admin/finance"
              className="w-full bg-[#001F3F] text-white p-6 rounded-2xl flex items-center justify-center gap-3 hover:opacity-90 transition-opacity mt-8"
            >
              <ShieldCheck className="w-6 h-6 text-emerald-500" />
              <span className="font-bold uppercase tracking-widest text-sm">Go to Admin Panel</span>
            </Link>
          )}

          {user && (
            <div className="pt-8 border-t border-slate-100 mt-8 text-center">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                Logged in as {profile?.full_name || user.email}
              </p>
              <button
                onClick={() => logout()}
                className="text-xs font-black text-red-500 uppercase tracking-widest hover:underline"
              >
                Not you? Sign Out
              </button>
            </div>
          )}
        </div>

      </motion.div>
    </div>
  );
}
