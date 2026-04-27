import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Wallet, CreditCard, Smartphone, ShieldCheck, RefreshCcw } from 'lucide-react';
import toast from 'react-hot-toast';

interface TopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userEmail?: string;
}

export default function TopUpModal({ isOpen, onClose, userId, userEmail }: TopUpModalProps) {
  const [amount, setAmount] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'amount' | 'redirecting'>('amount');
  const [redirectUrl, setRedirectUrl] = useState<string>('');

  const handleTopUp = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return toast.error('Please enter a valid amount');
    }

    setLoading(true);
    try {
      const response = await fetch('/api/wallet/initiate-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          amount: numAmount,
          email: userEmail
        })
      });

      const result = await response.json();
      if (result.success && result.redirectUrl) {
        setRedirectUrl(result.redirectUrl);
        setStep('redirecting');
        setTimeout(() => {
          window.open(result.redirectUrl, '_blank');
          setLoading(false);
        }, 1500);
      } else {
        throw new Error(result.error || 'Failed to initiate top-up');
      }
    } catch (error: any) {
      toast.error(error.message);
      setLoading(false);
    }
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
                  <Wallet className="w-5 h-5 text-student-green" />
                </div>
                <h3 className="font-black text-zim-navy tracking-tight">
                  {step === 'redirecting' ? 'Redirecting to Paynow' : 'Top Up Wallet'}
                </h3>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-8 space-y-8">
              {step === 'amount' ? (
                <>
                  <div className="text-center space-y-2">
                    <p className="text-slate-500 text-sm font-medium">Add funds to your secure wallet via Paynow.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-2">
                      {[5, 10, 20, 50].map((val) => (
                        <button
                          key={val}
                          onClick={() => setAmount(val.toString())}
                          className={`py-3 rounded-xl text-sm font-black transition-all ${
                            amount === val.toString()
                              ? 'bg-student-green text-white shadow-lg shadow-green-100'
                              : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          ${val}
                        </button>
                      ))}
                    </div>

                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">$</span>
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Enter custom amount"
                        className="w-full pl-8 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-student-green outline-none font-black text-xl"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                      <div className="w-10 h-10 bg-[#0055A4] rounded-xl flex items-center justify-center font-black text-white text-[10px] leading-none shrink-0">Pay<br/>Now</div>
                      <div className="text-left">
                        <div className="text-xs font-black text-zim-navy">Paynow Gateway</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">EcoCash, OneMoney, Visa/Mastercard</div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleTopUp}
                    disabled={!amount || loading}
                    className={`w-full py-5 rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-xl transition-all flex items-center justify-center gap-2 ${
                      amount && !loading
                        ? 'bg-student-green text-white shadow-green-200 hover:scale-[1.02] active:scale-95'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {loading ? 'Processing...' : 'Proceed to Paynow'}
                    {!loading && <Smartphone className="w-5 h-5" />}
                  </button>

                  <p className="text-[10px] text-center text-slate-400 font-medium px-4">
                    Payments are processed securely via <span className="text-[#0055A4] font-bold">Paynow Zimbabwe</span>.
                  </p>
                </>
              ) : (
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
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
