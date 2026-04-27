import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileQuestion, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-24 h-24 bg-white rounded-3xl shadow-xl flex items-center justify-center mb-8">
        <FileQuestion className="w-12 h-12 text-slate-300" />
      </div>
      <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-4">404 - Page Not Found</h1>
      <p className="text-slate-500 max-w-md mb-8 font-medium">
        The page you are looking for doesn't exist or has been moved. 
        Please check the URL or return to the home page.
      </p>
      <button 
        onClick={() => navigate('/')}
        className="flex items-center gap-2 px-8 py-4 bg-[#001F3F] text-white rounded-2xl font-bold shadow-lg hover:bg-slate-800 transition-all"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Home
      </button>
    </div>
  );
}
