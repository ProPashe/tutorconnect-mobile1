import React, { useState } from 'react';
import { Star, X, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import toast from 'react-hot-toast';

interface ReviewModalProps {
  isOpen: boolean;
  lesson: any;
  onClose: () => void;
}

const TAGS = ['Punctual', 'Clear Explanation', 'Patient', 'Engaging', 'Knowledgeable'];

export default function ReviewModal({ isOpen, lesson, onClose }: ReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [outsidePayment, setOutsidePayment] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async () => {
    if (rating === 0) return toast.error('Please select a rating');
    if (outsidePayment === null) return toast.error('Please answer the payment safety question');

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'reviews'), {
        lesson_id: lesson.id,
        student_id: lesson.student_id,
        tutor_id: lesson.tutor_id,
        rating,
        tags: selectedTags,
        comment,
        outside_payment_attempt: outsidePayment,
        created_at: serverTimestamp()
      });

      // Mark lesson as reviewed
      await updateDoc(doc(db, 'lessons', lesson.id), {
        is_reviewed: true
      });

      toast.success('Review submitted! Bonus unlocked.');
      onClose();
    } catch (error) {
      console.error('Review Error:', error);
      toast.error('Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-zim-navy/60 backdrop-blur-sm flex items-center justify-center p-6 z-[60]">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
          >
            <div className="p-8 space-y-8">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-black text-zim-navy">
                  How was your session with {lesson.tutor_name || 'your tutor'}?
                </h2>
                <p className="text-slate-400 text-sm font-medium">Your feedback helps us maintain quality.</p>
              </div>

              {/* Star Rating */}
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(star)}
                    className="transition-transform hover:scale-110 active:scale-95"
                  >
                    <Star 
                      className={`w-10 h-10 ${
                        star <= (hoverRating || rating) 
                          ? 'text-yellow-400 fill-current' 
                          : 'text-slate-200'
                      }`} 
                    />
                  </button>
                ))}
              </div>

              {/* Quick Tags */}
              <div className="flex flex-wrap justify-center gap-2">
                {TAGS.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                      selectedTags.includes(tag)
                        ? 'bg-zim-green text-white shadow-md shadow-green-100'
                        : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              {/* Comment */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Share your thoughts (optional)</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl h-24 focus:ring-2 focus:ring-zim-green outline-none resize-none text-sm"
                  placeholder="What did you like most about this session?"
                />
              </div>

              {/* Safety Question */}
              <div className="bg-slate-50 p-5 rounded-2xl space-y-4">
                <p className="text-xs font-bold text-slate-600 text-center">
                  Did the tutor try to take payment outside the app?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setOutsidePayment(true)}
                    className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
                      outsidePayment === true
                        ? 'bg-red-500 text-white shadow-lg shadow-red-100'
                        : 'bg-white text-slate-400 border border-slate-100'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setOutsidePayment(false)}
                    className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
                      outsidePayment === false
                        ? 'bg-zim-green text-white shadow-lg shadow-green-100'
                        : 'bg-white text-slate-400 border border-slate-100'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-4 bg-zim-green text-white rounded-2xl font-black shadow-xl shadow-green-100 hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent animate-spin rounded-full" />
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Submit Review & Unlock Bonus
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
