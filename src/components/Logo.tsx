import React from 'react';
import { ArrowUp } from 'lucide-react';

export function Logo({ className }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div className="relative w-32 h-32 flex items-center justify-center">
        <div className="flex items-end gap-1">
          <div className="flex flex-col items-center">
            <div className="w-8 h-16 bg-[#1a365d] relative rounded-t-lg">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[16px] border-l-transparent border-r-[16px] border-r-transparent border-b-[20px] border-b-[#1a365d]" />
            </div>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-8 h-16 bg-[#22c55e] relative rounded-t-lg">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[16px] border-l-transparent border-r-[16px] border-r-transparent border-b-[20px] border-b-[#22c55e]" />
            </div>
          </div>
        </div>
        <div className="absolute bottom-6 w-24 h-4 bg-gradient-to-r from-[#1a365d] to-[#22c55e] rounded-sm opacity-20" />
      </div>
      <h1 className="text-4xl font-bold text-[#1a365d] tracking-tight">
        TutorConnect
      </h1>
    </div>
  );
}
