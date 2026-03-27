import React from 'react';

/**
 * Sera UI – Section Divider
 * A decorative horizontal rule with optional centered label.
 * Adapted to StreamBridge palette.
 */
export default function SectionDivider({ label, className = '' }) {
  if (!label) {
    return (
      <div className={`relative flex items-center ${className}`}>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-brand-400/25 to-transparent" />
      </div>
    );
  }

  return (
    <div className={`relative flex items-center gap-4 ${className}`}>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.1] to-white/[0.08]" />
      <span className="flex-shrink-0 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400/60">
        {label}
      </span>
      <div className="flex-1 h-px bg-gradient-to-l from-transparent via-white/[0.1] to-white/[0.08]" />
    </div>
  );
}
