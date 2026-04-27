import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import * as fabricModule from 'fabric';
const fabric = (fabricModule as any).fabric || fabricModule;
import { 
  Video, 
  Mic, 
  MicOff, 
  VideoOff, 
  Share2, 
  LogOut, 
  MessageSquare, 
  PenTool, 
  Square, 
  Circle, 
  Type, 
  Eraser, 
  Brain,
  FileText,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export default function LessonRoom() {
  const { lessonId } = useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [lesson, setLesson] = useState<any>(null);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [activeTool, setActiveTool] = useState<'pen' | 'rect' | 'circle' | 'text' | 'eraser'>('pen');
  const [isAiSummarizing, setIsAiSummarizing] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);

  useEffect(() => {
    if (!lessonId) return;

    const unsub = onSnapshot(doc(db, 'lessons', lessonId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setLesson({ id: snap.id, ...data });
        
        // Sync whiteboard if data exists
        if (data.whiteboard_data && fabricRef.current) {
          const currentData = JSON.stringify(fabricRef.current.toJSON());
          if (data.whiteboard_data !== currentData) {
            fabricRef.current.loadFromJSON(data.whiteboard_data, () => {
              fabricRef.current?.renderAll();
            });
          }
        }
      } else {
        toast.error('Lesson not found');
        navigate('/dashboard');
      }
    });

    return () => unsub();
  }, [lessonId]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: 800,
      height: 600,
      backgroundColor: '#ffffff',
      isDrawingMode: true
    });

    fabricRef.current = canvas;

    canvas.on('object:added', () => saveCanvas());
    canvas.on('object:modified', () => saveCanvas());
    canvas.on('object:removed', () => saveCanvas());

    return () => {
      canvas.dispose();
    };
  }, []);

  const saveCanvas = () => {
    if (!fabricRef.current || !lessonId || !user) return;
    // Debounce this in production
    const json = JSON.stringify(fabricRef.current.toJSON());
    updateDoc(doc(db, 'lessons', lessonId), {
      whiteboard_data: json,
      last_updated_by: user.uid
    });
  };

  const handleToolChange = (tool: typeof activeTool) => {
    setActiveTool(tool);
    if (!fabricRef.current) return;

    fabricRef.current.isDrawingMode = tool === 'pen' || tool === 'eraser';
    
    if (tool === 'eraser') {
      fabricRef.current.freeDrawingBrush.color = '#ffffff';
      fabricRef.current.freeDrawingBrush.width = 20;
    } else if (tool === 'pen') {
      fabricRef.current.freeDrawingBrush.color = '#000000';
      fabricRef.current.freeDrawingBrush.width = 2;
    }
  };

  const generateAiSummary = async () => {
    if (!fabricRef.current || isAiSummarizing) return;
    
    setIsAiSummarizing(true);
    const tId = toast.loading('Gemini is reviewing lesson content...');
    
    try {
      // Export whiteboard as image
      const dataUri = fabricRef.current.toDataURL({ format: 'png' });
      const base64Data = dataUri.split(',')[1];

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              {
                text: "Based on this virtual classroom whiteboard and the lesson topic, generate a professional summary of the concepts covered, key takeaways for the student, and suggested follow-up exercises."
              },
              {
                inlineData: {
                  mimeType: "image/png",
                  data: base64Data
                }
              }
            ]
          }
        ]
      });

      const text = response.text || "No summary available.";
      setSummary(text);
      setShowSummary(true);
      toast.success('Lesson Summary Generated!', { id: tId });
      
      // Save summary to lesson
      if (lessonId) {
        await updateDoc(doc(db, 'lessons', lessonId), {
          ai_summary: text,
          summary_generated_at: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Summary Error:', error);
      toast.error('Failed to generate AI summary', { id: tId });
    } finally {
      setIsAiSummarizing(false);
    }
  };

  if (!lesson) return null;

  return (
    <div className="h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 p-4 flex items-center justify-between text-white">
        <div className="flex items-center gap-4">
          <div className="bg-zim-navy p-2 rounded-lg">
            <Video className="w-6 h-6 text-zim-green" />
          </div>
          <div>
            <h1 className="font-bold text-lg">{lesson.topic}</h1>
            <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">
              {profile?.role === 'tutor' ? `Teaching ${lesson.student_name}` : `Learning from ${lesson.tutor_name}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={generateAiSummary}
            disabled={isAiSummarizing}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-blue-900/40 disabled:opacity-50"
          >
            <Brain className={`w-4 h-4 ${isAiSummarizing ? 'animate-pulse' : ''}`} />
            AI Summary
          </button>
          <button 
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 text-red-400 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-600/30 transition-all"
          >
            <LogOut className="w-4 h-4" />
            End Session
          </button>
        </div>
      </header>

      {/* Main Area */}
      <main className="flex-1 flex overflow-hidden">
        {/* Whiteboard Section */}
        <div className="flex-1 p-8 flex items-center justify-center bg-[#f8fafc] relative">
          <div className="absolute top-4 left-4 flex flex-col gap-2 p-2 bg-white rounded-2xl shadow-xl border border-slate-100 z-10">
            <ToolButton active={activeTool === 'pen'} onClick={() => handleToolChange('pen')} icon={<PenTool className="w-5 h-5" />} label="Pen" />
            <ToolButton active={activeTool === 'rect'} onClick={() => handleToolChange('rect')} icon={<Square className="w-5 h-5" />} label="Rectangle" />
            <ToolButton active={activeTool === 'circle'} onClick={() => handleToolChange('circle')} icon={<Circle className="w-5 h-5" />} label="Circle" />
            <ToolButton active={activeTool === 'text'} onClick={() => handleToolChange('text')} icon={<Type className="w-5 h-5" />} label="Text" />
            <div className="h-px bg-slate-100 mx-2 my-1" />
            <ToolButton active={activeTool === 'eraser'} onClick={() => handleToolChange('eraser')} icon={<Eraser className="w-5 h-5" />} label="Eraser" />
          </div>

          <div className="bg-white shadow-2xl rounded-3xl overflow-hidden border-8 border-white">
            <canvas ref={canvasRef} />
          </div>
        </div>

        {/* Sidebar: Participants & Chat */}
        <aside className="w-80 bg-slate-800 border-l border-slate-700 flex flex-col p-6 space-y-8">
          <section className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Participants</h3>
            <div className="space-y-3">
              <ParticipantCard name={lesson.tutor_name} role="Tutor" isSelf={profile?.role === 'tutor'} />
              <ParticipantCard name={lesson.student_name} role="Student" isSelf={profile?.role === 'student'} />
            </div>
          </section>

          <section className="flex-1 flex flex-col min-h-0 space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Live Chat</h3>
            <div className="flex-1 bg-slate-900/50 rounded-2xl border border-slate-700/50 p-4 overflow-y-auto space-y-4 custom-scrollbar">
              <div className="text-center text-[10px] text-slate-600 font-bold uppercase py-2">Welcome to your lesson!</div>
            </div>
            <div className="flex items-center gap-2 bg-slate-700/50 p-2 rounded-2xl">
              <input 
                type="text" 
                placeholder="Message..." 
                className="flex-1 bg-transparent border-none text-sm text-white focus:ring-0 placeholder:text-slate-500"
              />
              <button className="bg-zim-green p-2 rounded-xl text-zim-navy">
                <Share2 className="w-4 h-4 mr-0.5" />
              </button>
            </div>
          </section>

          {/* Controls */}
          <section className="pt-6 border-t border-slate-700 flex justify-center gap-4">
            <ControlButton icon={isMicOn ? <Mic /> : <MicOff />} active={isMicOn} onClick={() => setIsMicOn(!isMicOn)} />
            <ControlButton icon={isVideoOn ? <Video /> : <VideoOff />} active={isVideoOn} onClick={() => setIsVideoOn(!isVideoOn)} />
          </section>
        </aside>
      </main>

      {/* Summary Modal */}
      <AnimatePresence>
        {showSummary && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-8 z-50 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-[3rem] overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
            >
              <div className="bg-zim-navy p-8 text-white flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="bg-white/10 p-3 rounded-2xl">
                    <Brain className="w-8 h-8 text-zim-green" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black">Gemini Lesson Report</h2>
                    <p className="text-white/40 text-[10px] font-black uppercase tracking-widest">{lesson.topic}</p>
                  </div>
                </div>
                <button onClick={() => setShowSummary(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-8 overflow-y-auto custom-scrollbar prose prose-slate max-w-none">
                <div className="whitespace-pre-wrap font-medium text-slate-700 leading-relaxed italic text-lg opacity-90 border-l-4 border-zim-green pl-6 mb-8">
                  "This report highlights the key learning milestones achieved during today's session."
                </div>
                <div className="space-y-6">
                  {summary?.split('\n').map((line, i) => (
                    <p key={i} className="text-slate-600">{line}</p>
                  ))}
                </div>
              </div>
              <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
                <button 
                  onClick={() => setShowSummary(false)}
                  className="flex-1 py-4 bg-zim-navy text-white rounded-2xl font-black uppercase tracking-widest text-xs"
                >
                  Close & Continue
                </button>
                <button 
                  onClick={() => window.print()}
                  className="px-6 py-4 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs"
                >
                  <FileText className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ToolButton({ active, onClick, icon, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={`p-3 rounded-xl transition-all group relative ${
        active ? 'bg-zim-navy text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
      }`}
      title={label}
    >
      {icon}
      {!active && (
        <span className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
          {label}
        </span>
      )}
    </button>
  );
}

function ControlButton({ icon, active, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
        active ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-red-500 text-white hover:bg-red-600 shadow-xl shadow-red-900/40'
      }`}
    >
      {React.cloneElement(icon, { size: 20 })}
    </button>
  );
}

function ParticipantCard({ name, role, isSelf }: any) {
  return (
    <div className="bg-slate-900/30 p-3 rounded-2xl border border-slate-700/50 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-slate-700 overflow-hidden">
        <img src={`https://picsum.photos/seed/${name}/100/100`} alt="" />
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white tracking-tight">{name}</span>
          {isSelf && <span className="text-[8px] bg-zim-green text-zim-navy px-1.5 py-0.5 rounded uppercase font-black tracking-tighter">You</span>}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{role}</span>
      </div>
    </div>
  );
}
