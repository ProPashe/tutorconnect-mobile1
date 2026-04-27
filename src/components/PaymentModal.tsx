import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck, Smartphone, CreditCard, CheckCircle2, XCircle, FileText, RefreshCcw, MessageSquare } from 'lucide-react';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  amount: number;
  tutorName: string;
  lessonTitle: string;
  bidId: string;
  studentId: string;
  studentEmail?: string;
}

export default function PaymentModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  amount, 
  tutorName, 
  lessonTitle,
  bidId,
  studentId,
  studentEmail
}: PaymentModalProps) {
  const [step, setStep] = useState<'method' | 'gateway' | 'pin' | 'simulating' | 'success' | 'failure' | 'redirecting'>('method');
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [transactionId] = useState(() => `TXN-${Math.random().toString(36).substr(2, 9).toUpperCase()}`);
  const [loading, setLoading] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState<string>('');

  const handlePay = async () => {
    if (!selectedMethod) return;
    
    if (selectedMethod === 'paynow') {
      setLoading(true);
      try {
        const response = await fetch('/api/payments/initiate-paynow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bidId,
            studentId,
            email: studentEmail
          })
        });
        
        const result = await response.json();
        if (result.success && result.redirectUrl) {
          setRedirectUrl(result.redirectUrl);
          setStep('redirecting');
          // Small delay to show the redirecting state
          setTimeout(() => {
            window.open(result.redirectUrl, '_blank');
          }, 1500);
        } else {
          throw new Error(result.error || 'Failed to initiate Paynow payment');
        }
      } catch (error) {
        console.error('Paynow error:', error);
        setStep('failure');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (selectedMethod === 'wallet') {
      setLoading(true);
      try {
        const response = await fetch('/api/bids/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId,
            bidId
          })
        });
        
        const result = await response.json();
        if (result.success) {
          setStep('success');
          onSuccess();
        } else {
          throw new Error(result.error || 'Failed to accept bid via wallet');
        }
      } catch (error) {
        console.error('Wallet payment error:', error);
        setStep('failure');
      } finally {
        setLoading(false);
      }
      return;
    }
  };

  const handleAuthorize = () => {
    setStep('pin');
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) return;
    setStep('simulating');
    simulateProcess();
  };

  const simulateProcess = () => {
    setTimeout(() => {
      // 90% success rate for simulation
      const isSuccess = Math.random() > 0.1;
      if (isSuccess) {
        setStep('success');
        onSuccess();
      } else {
        setStep('failure');
      }
    }, 3000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zim-navy/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/20"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-student-green/10 rounded-lg flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-student-green" />
                </div>
                <h3 className="font-black text-zim-navy tracking-tight">
                  {step === 'gateway' ? 'EcoCash Gateway' : 
                   step === 'pin' ? 'Secure Authorization' : 
                   step === 'success' ? 'Payment Successful' :
                   step === 'failure' ? 'Payment Failed' :
                   step === 'redirecting' ? 'Redirecting to Paynow' :
                   'Secure Escrow Payment'}
                </h3>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-8 space-y-8">
              {step === 'method' ? (
                <>
                  {/* Session Details */}
                  <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Paying For Session</p>
                      <h4 className="text-lg font-black text-zim-navy leading-tight">{lessonTitle}</h4>
                      <p className="text-sm font-bold text-slate-500">with {tutorName}</p>
                    </div>
                    <div className="pt-4 border-t border-slate-200 flex justify-between items-end">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Amount</span>
                      <span className="text-3xl font-black text-zim-navy tracking-tighter">${amount.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Payment Options */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Select Payment Method</p>
                    
                    <PaymentOption 
                      id="paynow"
                      selected={selectedMethod === 'paynow'}
                      onClick={() => setSelectedMethod('paynow')}
                      icon={<div className="w-10 h-10 bg-[#0055A4] rounded-xl flex items-center justify-center font-black text-white text-[10px] leading-none">Pay<br/>Now</div>}
                      title="Paynow"
                      subtitle="EcoCash, OneMoney, Visa/Mastercard"
                    />

                    <PaymentOption 
                      id="wallet"
                      selected={selectedMethod === 'wallet'}
                      onClick={() => setSelectedMethod('wallet')}
                      icon={<div className="w-10 h-10 bg-student-green rounded-xl flex items-center justify-center text-white"><ShieldCheck className="w-5 h-5" /></div>}
                      title="Student Wallet"
                      subtitle={`Balance: $${amount.toFixed(2)}+`}
                    />
                  </div>

                  {/* Call to Action */}
                  <button 
                    onClick={handlePay}
                    disabled={!selectedMethod || loading}
                    className={`w-full py-5 rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-xl transition-all flex items-center justify-center gap-2 ${
                      selectedMethod && !loading
                        ? 'bg-student-green text-white shadow-green-200 hover:scale-[1.02] active:scale-95' 
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {loading ? 'Processing...' : 'Proceed to Payment'}
                    {!loading && <Smartphone className="w-5 h-5" />}
                  </button>

                  <p className="text-[10px] text-center text-slate-400 font-medium px-4">
                    Your funds are protected by <span className="text-student-green font-bold">TutorConnect Escrow</span>. 
                    Tutors only get paid after you confirm the lesson.
                  </p>
                </>
              ) : step === 'gateway' ? (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-8"
                >
                  <div className="text-center space-y-2">
                    <div className="inline-block px-4 py-1 bg-[#ED1C24]/10 rounded-full">
                      <span className="text-[10px] font-black text-[#ED1C24] uppercase tracking-widest">Secure Gateway</span>
                    </div>
                    <h4 className="text-2xl font-black text-zim-navy tracking-tight">Payment to TutorConnect</h4>
                  </div>

                  <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Merchant</span>
                      <span className="text-sm font-black text-zim-navy">TutorConnect Zimbabwe</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Reference</span>
                      <span className="text-sm font-black text-zim-navy truncate max-w-[150px]">{lessonTitle}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Amount</span>
                      <span className="text-lg font-black text-[#ED1C24]">${amount.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Registered EcoCash Number</label>
                      <div className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-zim-navy flex items-center gap-3">
                        <Smartphone className="w-4 h-4 text-slate-400" />
                        <span>077 **** 123</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed text-center px-2">
                      Confirm payment details and prepare to enter your <span className="font-bold text-zim-navy">secure PIN</span> on the next authorization prompt.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <button 
                      onClick={handleAuthorize}
                      className="w-full py-5 bg-[#ED1C24] text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-xl shadow-red-200 hover:scale-[1.02] active:scale-95 transition-all"
                    >
                      Authorize Payment
                    </button>
                    <button 
                      onClick={() => setStep('method')}
                      className="w-full text-xs font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              ) : step === 'pin' ? (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-8"
                >
                  <div className="text-center space-y-2">
                    <div className="inline-block px-4 py-1 bg-student-green/10 rounded-full">
                      <span className="text-[10px] font-black text-student-green uppercase tracking-widest">Official EcoCash Secure Page</span>
                    </div>
                    <h4 className="text-2xl font-black text-zim-navy tracking-tight">Secure EcoCash Authorization</h4>
                  </div>

                  <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Recipient</span>
                      <span className="text-sm font-black text-zim-navy">TutorConnect</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Amount Due</span>
                      <span className="text-2xl font-black text-zim-navy tracking-tighter">${amount.toFixed(2)}</span>
                    </div>
                  </div>

                  <form onSubmit={handlePinSubmit} className="space-y-6">
                    <div className="space-y-2 text-center">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Enter EcoCash PIN</label>
                      <div className="flex justify-center gap-3">
                        {[0, 1, 2, 3].map((i) => (
                          <div 
                            key={i}
                            className={`w-12 h-16 rounded-2xl border-2 flex items-center justify-center text-2xl font-black transition-all ${
                              pin.length > i ? 'border-student-green bg-green-50 text-zim-navy' : 'border-slate-100 bg-slate-50'
                            }`}
                          >
                            {pin.length > i ? '•' : ''}
                          </div>
                        ))}
                      </div>
                      <input 
                        type="password"
                        maxLength={4}
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                        className="sr-only"
                        autoFocus
                      />
                    </div>

                    <div className="space-y-4">
                      <button 
                        type="submit"
                        disabled={pin.length < 4}
                        className={`w-full py-5 rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-xl transition-all ${
                          pin.length === 4 
                            ? 'bg-zim-navy text-white shadow-slate-200 hover:scale-[1.02] active:scale-95' 
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        Authorize
                      </button>
                      <button 
                        type="button"
                        onClick={() => {
                          setStep('gateway');
                          setPin('');
                        }}
                        className="w-full text-xs font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </motion.div>
              ) : step === 'success' ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="py-6 text-center space-y-8"
                >
                  <div className="flex justify-center">
                    <div className="w-24 h-24 bg-student-green/10 rounded-full flex items-center justify-center border-4 border-student-green/20">
                      <CheckCircle2 className="w-12 h-12 text-student-green" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-3xl font-black text-zim-navy tracking-tighter">Payment Successful!</h4>
                    <p className="text-slate-500 font-medium">Your lesson with {tutorName} is now secured.</p>
                  </div>

                  <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-4 text-left">
                    <div className="grid grid-cols-2 gap-y-4">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Transaction ID</p>
                        <p className="text-xs font-bold text-zim-navy">{transactionId}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</p>
                        <p className="text-xs font-bold text-zim-navy">{new Date().toLocaleDateString()}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount Paid</p>
                        <p className="text-sm font-black text-student-green">${amount.toFixed(2)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tutor</p>
                        <p className="text-sm font-black text-zim-navy">{tutorName}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <button 
                      onClick={() => {
                        onClose();
                        setStep('method');
                        setSelectedMethod(null);
                      }}
                      className="w-full py-5 bg-zim-navy text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-xl hover:scale-[1.02] active:scale-95 transition-all"
                    >
                      Back to Dashboard
                    </button>
                    <button 
                      onClick={() => window.print()}
                      className="w-full py-4 bg-white text-zim-navy border-2 border-slate-100 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                    >
                      <FileText className="w-4 h-4" />
                      View Receipt
                    </button>
                  </div>
                </motion.div>
              ) : step === 'failure' ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="py-6 text-center space-y-8"
                >
                  <div className="flex justify-center">
                    <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center border-4 border-red-500/20">
                      <XCircle className="w-12 h-12 text-red-500" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-3xl font-black text-zim-navy tracking-tighter">Payment Failed</h4>
                    <p className="text-slate-500 font-medium px-4">
                      We couldn't process your payment. Please try again or contact support.
                    </p>
                  </div>

                  <div className="bg-red-50/50 rounded-3xl p-6 border border-red-100 space-y-3 text-left">
                    <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">Common Reasons</p>
                    <ul className="text-xs font-medium text-slate-600 space-y-2">
                      <li className="flex items-center gap-2">• Insufficient EcoCash balance</li>
                      <li className="flex items-center gap-2">• Incorrect PIN entered</li>
                      <li className="flex items-center gap-2">• Transaction timed out</li>
                    </ul>
                  </div>

                  <div className="space-y-3">
                    <button 
                      onClick={() => {
                        setStep('method');
                        setPin('');
                      }}
                      className="w-full py-5 bg-red-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-xl shadow-red-200 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <RefreshCcw className="w-4 h-4" />
                      Retry Payment
                    </button>
                    <button 
                      onClick={() => alert('Support contact: support@tutorconnect.co.zw')}
                      className="w-full py-4 bg-white text-zim-navy border-2 border-slate-100 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Contact Support
                    </button>
                  </div>
                </motion.div>
              ) : step === 'redirecting' ? (
                <div className="py-12 text-center space-y-8">
                  <div className="relative w-24 h-24 mx-auto">
                    <div className="absolute inset-0 border-4 border-slate-100 rounded-full" />
                    <div className="absolute inset-0 border-4 border-[#0055A4] rounded-full border-t-transparent animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <CreditCard className="w-8 h-8 text-[#0055A4] animate-pulse" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h4 className="text-2xl font-black text-zim-navy tracking-tight">Opening Paynow</h4>
                    <p className="text-slate-500 font-medium max-w-[240px] mx-auto">
                      We are opening the secure Paynow gateway in a new tab.
                    </p>
                    {redirectUrl && (
                      <button 
                        onClick={() => window.open(redirectUrl, '_blank')}
                        className="text-xs font-bold text-student-green hover:underline mt-4 flex items-center gap-2 mx-auto"
                      >
                        <RefreshCcw className="w-3 h-3" />
                        Didn't open? Click here
                      </button>
                    )}
                  </div>
                </div>
              ) : step === 'simulating' ? (
                <div className="py-12 text-center space-y-8">
                  <div className="relative w-24 h-24 mx-auto">
                    <div className="absolute inset-0 border-4 border-slate-100 rounded-full" />
                    <div className="absolute inset-0 border-4 border-student-green rounded-full border-t-transparent animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Smartphone className="w-8 h-8 text-student-green animate-pulse" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h4 className="text-2xl font-black text-zim-navy tracking-tight">Processing Payment</h4>
                    <p className="text-slate-500 font-medium max-w-[240px] mx-auto">
                      Please check your phone for the <span className="text-[#ED1C24] font-bold">EcoCash</span> USSD prompt to authorize.
                    </p>
                  </div>
                  <div className="pt-8">
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex items-center gap-3 justify-center">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Waiting for authorization...</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function PaymentOption({ id, selected, onClick, icon, title, subtitle }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all group ${
        selected 
          ? 'border-student-green bg-green-50/50 shadow-lg shadow-green-100/50' 
          : 'border-slate-100 hover:border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-center gap-4">
        {icon}
        <div className="text-left">
          <div className="font-black text-zim-navy tracking-tight">{title}</div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{subtitle}</div>
        </div>
      </div>
      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
        selected ? 'border-student-green bg-student-green' : 'border-slate-200'
      }`}>
        {selected && <div className="w-2 h-2 bg-white rounded-full" />}
      </div>
    </button>
  );
}
