/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';
import StudentDashboard from './pages/StudentDashboard';
import TutorDashboard from './pages/TutorDashboard';
import StudentRegistration from './pages/StudentRegistration';
import TutorRegistration from './pages/TutorRegistration';
import TutorWallet from './pages/TutorWallet';
import LessonRoom from './pages/LessonRoom';
import { Toaster } from 'react-hot-toast';
import { seedSubjects } from './lib/seeder';
import { LogOut, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

import AdminDashboard from './pages/AdminDashboard';
import AdminFinancialDashboard from './pages/AdminFinancialDashboard';
import AdminLogin from './pages/AdminLogin';
import NotFound from './pages/NotFound';

function AppRoutes() {
  const { user, profile, activeRole, loading, logout, setActiveRole } = useAuth();
  const navigate = useNavigate();
  const location = window.location.pathname;
  const isAdminRoute = location.startsWith('/admin') || location === '/404';
  const isSystemAdmin = (profile?.role?.toLowerCase() === 'admin' || profile?.role?.toLowerCase() === 'super-admin') || 
                        (["mudzimwapanashe123@gmail.com", "mudzimwapanashe506@gmail.com"].includes(user?.email || ""));

  useEffect(() => {
    if (user && isSystemAdmin) {
      seedSubjects();
    }
  }, [user, isSystemAdmin]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-t-tutor-blue"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {user && !isAdminRoute && (
        <nav className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xl text-tutor-blue tracking-tight">TutorConnect</span>
            </div>
            <div className="flex items-center gap-6">
              {isSystemAdmin ? (
                <div className="flex items-center gap-2 mr-4 border-r border-slate-200 pr-4">
                  <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                    <button
                      onClick={() => {
                        setActiveRole('admin');
                        navigate('/admin/users');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                        activeRole === 'admin' && location.includes('/admin/users') ? 'bg-white shadow-sm text-tutor-blue' : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Control
                    </button>
                    <button
                      onClick={() => {
                        setActiveRole('admin');
                        navigate('/admin/finance');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                        activeRole === 'admin' && location.includes('/admin/finance') ? 'bg-white shadow-sm text-tutor-blue' : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Finance
                    </button>
                    <button
                      onClick={() => {
                        setActiveRole('tutor');
                        navigate('/dashboard');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                        activeRole === 'tutor' ? 'bg-white shadow-sm text-tutor-blue' : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Tutor
                    </button>
                    <button
                      onClick={() => {
                        setActiveRole('student');
                        navigate('/dashboard');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                        activeRole === 'student' ? 'bg-white shadow-sm text-tutor-blue' : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Student
                    </button>
                  </div>
                </div>
              ) : null}
              <span className="text-sm font-medium text-slate-600">
                {profile?.full_name}
              </span>
              <button 
                onClick={() => logout()}
                className="text-slate-400 hover:text-red-500 transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </nav>
      )}
      <Routes>
        <Route path="/" element={
          !user ? <LandingPage /> : 
          isSystemAdmin ? <LandingPage /> :
          <Navigate to="/dashboard" />
        } />
        <Route path="/registration" element={user && (profile?.role?.toLowerCase() === 'student' || isSystemAdmin) && !profile?.is_registered ? <StudentRegistration /> : <Navigate to="/dashboard" />} />
        <Route path="/tutor-registration" element={user && (profile?.role?.toLowerCase() === 'tutor' || isSystemAdmin) && !profile?.is_registered ? <TutorRegistration /> : <Navigate to="/dashboard" />} />
        <Route path="/lesson/:lessonId" element={user ? <LessonRoom /> : <Navigate to="/" />} />
        <Route path="/tutor/wallet" element={user && profile?.role?.toLowerCase() === 'tutor' ? <TutorWallet /> : <Navigate to="/" />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={!user ? <Navigate to="/admin/login" /> : (isSystemAdmin ? <AdminDashboard /> : <Navigate to="/404" />)} />
        <Route path="/admin/users" element={!user ? <Navigate to="/admin/login" /> : (isSystemAdmin ? <AdminDashboard /> : <Navigate to="/404" />)} />
        <Route path="/admin/finance" element={!user ? <Navigate to="/admin/login" /> : (isSystemAdmin ? <AdminFinancialDashboard /> : <Navigate to="/404" />)} />
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<NotFound />} />
        <Route path="/dashboard" element={
          user ? (
            profile ? (
              activeRole === 'student' ? (
                (profile.is_registered || isSystemAdmin) ? <StudentDashboard /> : <Navigate to="/registration" />
              ) : 
              activeRole === 'tutor' ? (
                (profile.is_registered || isSystemAdmin) ? <TutorDashboard /> : <Navigate to="/tutor-registration" />
              ) :
              (activeRole === 'admin' || isSystemAdmin) ? <Navigate to="/admin/finance" /> : <Navigate to="/404" />
            ) : (
              <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-t-tutor-blue"></div>
              </div>
            )
          ) : <Navigate to="/" />
        } />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
        <Toaster position="top-center" />
      </Router>
    </AuthProvider>
  );
}
