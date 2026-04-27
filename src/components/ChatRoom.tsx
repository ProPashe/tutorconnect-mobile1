import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import socket from '../lib/socket';
import { Send, Paperclip, Shield, FileText, Loader2, Download, Check, CheckCheck } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ChatRoom({ roomId, otherName }: { roomId: string, otherName: string }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, `chat_rooms/${roomId}/messages`),
      orderBy('created_at', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `chat_rooms/${roomId}/messages`);
    });

    socket.emit('join_chat', roomId);
    socket.on('receive_message', (data) => {
      // Real-time update handled by onSnapshot
    });

    socket.on('user_typing', (data) => {
      if (data.room_id === roomId && data.user_id !== user?.uid) {
        setIsOtherTyping(data.is_typing);
      }
    });

    return () => {
      unsubscribe();
      socket.off('receive_message');
      socket.off('user_typing');
    };
  }, [roomId, user]);

  // Read Receipts Logic
  useEffect(() => {
    if (!user || messages.length === 0) return;

    const unreadMessages = messages.filter(
      msg => msg.sender_id !== user.uid && !msg.is_read
    );

    if (unreadMessages.length > 0) {
      const batch = writeBatch(db);
      unreadMessages.forEach(msg => {
        const msgRef = doc(db, `chat_rooms/${roomId}/messages`, msg.id);
        batch.update(msgRef, { is_read: true });
      });
      batch.commit().catch(err => console.error("Error marking messages as read:", err));
    }
  }, [messages, user, roomId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const maskPhoneNumbers = (text: string) => {
    return text.replace(/\d{3,4}\s?\d{3}\s?\d{3,4}/g, '[HIDDEN]');
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const fileUrl = reader.result as string;
      
      await addDoc(collection(db, `chat_rooms/${roomId}/messages`), {
        sender_id: user.uid,
        message_text: `Shared a file: ${file.name}`,
        file_url: fileUrl,
        message_type: 'file',
        created_at: serverTimestamp(),
        is_read: false
      });

      // Update room timestamp for sorting in inbox
      await updateDoc(doc(db, 'chat_rooms', roomId), {
        updated_at: serverTimestamp()
      });

      socket.emit('send_message', { 
        room_id: roomId, 
        message_text: `Shared a file: ${file.name}`, 
        sender_id: user.uid,
        file_url: fileUrl,
        message_type: 'file'
      });
      
      setUploading(false);
      toast.success('File sent!');
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    // Clear typing status immediately on send
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    socket.emit('typing', { room_id: roomId, is_typing: false, user_id: user.uid });

    const maskedText = maskPhoneNumbers(newMessage);

    await addDoc(collection(db, `chat_rooms/${roomId}/messages`), {
      sender_id: user.uid,
      message_text: maskedText,
      created_at: serverTimestamp(),
      is_read: false
    });

    // Update room timestamp for sorting in inbox
    await updateDoc(doc(db, 'chat_rooms', roomId), {
      updated_at: serverTimestamp()
    });

    socket.emit('send_message', { room_id: roomId, message_text: maskedText, sender_id: user.uid });
    setNewMessage('');
  };

  return (
    <div className="flex flex-col h-[500px] bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-50 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-tutor-blue rounded-full flex items-center justify-center text-white font-bold">
            {otherName[0]}
          </div>
          <div>
            <div className="font-bold text-slate-900">{otherName}</div>
            <div className="text-xs text-green-500 flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              Online
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-white px-2 py-1 rounded-full border border-slate-100">
          <Shield className="w-3 h-3" />
          SECURE CHAT
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender_id === user?.uid ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-2xl text-sm relative group ${
                msg.sender_id === user?.uid
                  ? 'bg-tutor-blue text-white rounded-tr-none'
                  : 'bg-slate-100 text-slate-800 rounded-tl-none'
              }`}
            >
              {msg.message_type === 'file' ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 bg-black/10 p-2 rounded-lg">
                    <FileText className="w-5 h-5" />
                    <span className="truncate max-w-[150px]">{msg.message_text.replace('Shared a file: ', '')}</span>
                  </div>
                  <a 
                    href={msg.file_url} 
                    download 
                    className="flex items-center gap-1 text-[10px] font-bold hover:underline"
                  >
                    <Download className="w-3 h-3" />
                    DOWNLOAD
                  </a>
                </div>
              ) : (
                msg.message_text
              )}
              
              {msg.sender_id === user?.uid && (
                <div className="flex justify-end mt-1">
                  {msg.is_read ? (
                    <CheckCheck className="w-3 h-3 text-white/70" />
                  ) : (
                    <Check className="w-3 h-3 text-white/50" />
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {isOtherTyping && (
          <div className="flex justify-start">
            <div className="bg-slate-100 text-slate-400 px-4 py-2 rounded-2xl rounded-tl-none text-xs flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              {otherName} is typing...
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 border-t border-slate-50 flex gap-2">
        <input 
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
        />
        <button 
          type="button" 
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="p-2 text-slate-400 hover:text-tutor-blue disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
        </button>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => {
            setNewMessage(e.target.value);
            if (user) {
              socket.emit('typing', { room_id: roomId, is_typing: true, user_id: user.uid });
              
              if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
              typingTimeoutRef.current = setTimeout(() => {
                socket.emit('typing', { room_id: roomId, is_typing: false, user_id: user.uid });
              }, 2000);
            }
          }}
          placeholder="Type a message..."
          className="flex-1 p-2 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-tutor-blue/20"
        />
        <button
          type="submit"
          className="p-2 bg-tutor-blue text-white rounded-xl hover:opacity-90 transition-opacity"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}
