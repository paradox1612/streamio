import React from 'react';

export default function BrandMark({ compact = false }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`relative flex items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.04] shadow-[0_18px_45px_rgba(8,16,31,0.38)] ${compact ? 'h-11 w-11' : 'h-14 w-14'}`}>
        <div className="absolute inset-[5px] rounded-[14px] bg-gradient-to-br from-brand-400/30 via-cyan-200/10 to-white/[0.02]" />
        <div className="relative h-5 w-5 rounded-full border border-white/35">
          <div className="absolute left-1/2 top-[-1px] h-[calc(100%+2px)] w-[2px] -translate-x-1/2 bg-white/70" />
          <div className="absolute top-1/2 left-[-1px] h-[2px] w-[calc(100%+2px)] -translate-y-1/2 bg-white/70" />
        </div>
      </div>
      <div>
        <p className="eyebrow mb-1">Personal Media Bridge</p>
        <h1 className={`${compact ? 'text-lg' : 'text-xl'} font-bold text-white`}>StreamBridge</h1>
      </div>
    </div>
  );
}
