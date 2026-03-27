import React, { useEffect, useRef, useState } from 'react';

/**
 * Sera UI – Progress Bar
 * Animated fill with shimmer effect, adapted to StreamBridge brand.
 */
const shimmerCss = `
  @keyframes sb-progress-shimmer {
    0%   { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
`;

export default function SeraProgressBar({
  value = 0,
  max = 100,
  label,
  showLabel = false,
  size = 'md',        // 'sm' | 'md' | 'lg'
  color = 'brand',   // 'brand' | 'emerald' | 'amber' | 'red'
  animated = true,
  className = '',
}) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  const [displayed, setDisplayed] = useState(0);
  const raf = useRef(null);
  const displayedRef = useRef(0);

  useEffect(() => {
    displayedRef.current = displayed;
  }, [displayed]);

  useEffect(() => {
    const start = performance.now();
    const from = displayedRef.current;
    const to = percent;
    const dur = 900;

    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayed(from + (to - from) * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [percent]);

  const heights = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-4' };

  const colorMap = {
    brand:   { track: 'bg-brand-500/20', fill: '#1491ff', glow: 'rgba(20,145,255,0.4)' },
    emerald: { track: 'bg-emerald-500/20', fill: '#34d399', glow: 'rgba(52,211,153,0.4)' },
    amber:   { track: 'bg-amber-500/20', fill: '#fbbf24', glow: 'rgba(251,191,36,0.4)' },
    red:     { track: 'bg-red-500/20', fill: '#f87171', glow: 'rgba(248,113,113,0.4)' },
  };

  const c = colorMap[color] || colorMap.brand;

  return (
    <div className={`w-full ${className}`}>
      <style>{shimmerCss}</style>
      {(label || showLabel) && (
        <div className="flex items-center justify-between mb-2">
          {label && <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300/55">{label}</span>}
          {showLabel && <span className="text-xs font-bold text-white tabular-nums">{Math.round(displayed)}%</span>}
        </div>
      )}
      <div className={`w-full rounded-full overflow-hidden ${heights[size] || heights.md} ${c.track}`}>
        <div
          className="h-full rounded-full relative overflow-hidden"
          style={{
            width: `${displayed}%`,
            background: c.fill,
            boxShadow: `0 0 8px ${c.glow}`,
            transition: 'width 0.05s linear',
          }}
        >
          {animated && (
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)',
                backgroundSize: '200% 100%',
                animation: 'sb-progress-shimmer 1.8s linear infinite',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
