import React, { useRef, useEffect, useCallback } from 'react';

/**
 * Sera UI – Marquee Scroller
 * Smooth RAF-based horizontal scroll, pause-on-hover supported.
 */
function useAnimationFrame(callback) {
  const reqRef = useRef(null);
  const prevTimeRef = useRef(null);

  const animate = useCallback((time) => {
    if (prevTimeRef.current !== null) {
      callback(time, time - prevTimeRef.current);
    }
    prevTimeRef.current = time;
    reqRef.current = requestAnimationFrame(animate);
  }, [callback]);

  useEffect(() => {
    reqRef.current = requestAnimationFrame(animate);
    return () => { if (reqRef.current) cancelAnimationFrame(reqRef.current); };
  }, [animate]);
}

export default function Marquee({
  children,
  speed = 40,
  reverse = false,
  pauseOnHover = true,
  repeat = 4,
  className = '',
  itemClassName = '',
}) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const firstBlockRef = useRef(null);
  const animX = useRef(0);
  const paused = useRef(false);

  useAnimationFrame((_, delta) => {
    if (!contentRef.current || !firstBlockRef.current || paused.current) return;
    const blockW = firstBlockRef.current.offsetWidth;
    const gap = parseFloat(window.getComputedStyle(contentRef.current).columnGap || '0');
    const loop = blockW + gap;
    const dx = (speed * delta) / 1000;
    animX.current += reverse ? dx : -dx;
    if (Math.abs(animX.current) >= loop) animX.current = animX.current % loop;
    contentRef.current.style.transform = `translateX(${animX.current}px)`;
  });

  return (
    <div
      ref={containerRef}
      className={`group flex overflow-hidden [--gap:2rem] [gap:var(--gap)] ${className}`}
      onMouseEnter={() => { if (pauseOnHover) paused.current = true; }}
      onMouseLeave={() => { if (pauseOnHover) paused.current = false; }}
    >
      <div
        ref={contentRef}
        className="flex shrink-0 justify-around [gap:var(--gap)]"
      >
        {Array.from({ length: repeat }, (_, i) => (
          <div key={i} ref={i === 0 ? firstBlockRef : null} className={`flex gap-8 ${itemClassName}`}>
            {children}
          </div>
        ))}
      </div>
    </div>
  );
}
