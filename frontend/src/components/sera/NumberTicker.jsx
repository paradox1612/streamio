import React, { useEffect, useState, useRef } from 'react';

/**
 * Sera UI – Number Ticker Counter
 * Animates from 0 to a target numeric value with easeOutQuart.
 */
export default function NumberTicker({
  value,
  duration = 1800,
  delay = 0,
  decimalPlaces = 0,
  prefix = '',
  suffix = '',
  className = '',
  formatFn = null,
  onComplete,
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const hasStarted = useRef(false);

  useEffect(() => {
    let animId;
    let timeoutId;

    const startAnimation = () => {
      const startTime = performance.now();

      const animate = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4); // easeOutQuart
        setDisplayValue(value * eased);
        if (progress < 1) {
          animId = requestAnimationFrame(animate);
        } else {
          setDisplayValue(value);
          onComplete?.();
        }
      };

      animId = requestAnimationFrame(animate);
    };

    timeoutId = setTimeout(startAnimation, delay);

    return () => {
      clearTimeout(timeoutId);
      if (animId) cancelAnimationFrame(animId);
    };
  }, [value, duration, delay, onComplete]);

  const formatted = formatFn
    ? formatFn(displayValue)
    : Number(displayValue.toFixed(decimalPlaces)).toLocaleString();

  return (
    <span className={`inline-block tabular-nums ${className}`}>
      {prefix}{formatted}{suffix}
    </span>
  );
}
