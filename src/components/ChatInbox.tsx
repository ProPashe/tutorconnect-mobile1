import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import ChatRoom from './ChatRoom';
import { MessageSquare } from 'lucide-react';

export default function ChatInbox() {
  const { user, profile } = useAuth();
  const [rooms, setRooms] = useState<any[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'chat_rooms'),
      where(profile?.role === 'student' ? 'student_id' : 'tutor_id', '==', user.uid),
      orderBy('updated_at', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setRooms(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'chat_rooms');
    });
    return () => unsubscribe();
  }, [user, profile]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-1 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-50 bg-slate-50 font-bold text-slate-800 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-tutor-blue" />
          Messages
        </div>
        <div className="divide-y divide-slate-50">
          {rooms.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No conversations yet</div>
          ) : (
            rooms.map(room => (
              <button
                key={room.id}
                onClick={() => setSelectedRoom(room)}
                className={`w-full p-4 text-left hover:bg-slate-50 transition-colors flex items-center gap-3 ${
                  selectedRoom?.id === room.id ? 'bg-slate-50 border-l-4 border-tutor-blue' : ''
                }`}
              >
                <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center font-bold text-slate-500">
                  {(profile?.role === 'student' ? room.tutor_name : room.student_name)?.[0] || '?'}
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-900">
                    {profile?.role === 'student' ? room.tutor_name : room.student_name}
                  </div>
                  <div className="text-xs text-slate-500 truncate w-32">Click to open chat</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="md:col-span-2">
        {selectedRoom ? (
          <ChatRoom 
            roomId={selectedRoom.id} 
            otherName={profile?.role === 'student' ? selectedRoom.tutor_name : selectedRoom.student_name} 
          />
        ) : (
          <div className="h-[500px] bg-white rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 space-y-2">
            <MessageSquare className="w-12 h-12 opacity-20" />
            <p>Select a conversation to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}
