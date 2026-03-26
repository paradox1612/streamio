import React from 'react';

export default function StatusBadge({ status, pulse = false }) {
  const colors = {
    online: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
    offline: 'border-red-400/20 bg-red-400/10 text-red-100',
    checking: 'border-amber-400/20 bg-amber-400/10 text-amber-100',
    unknown: 'border-slate-400/20 bg-slate-400/10 text-slate-100',
  };

  const statusColor = colors[status] || colors.unknown;
  const statusDot = {
    online: 'bg-emerald-400',
    offline: 'bg-red-400',
    checking: 'bg-amber-400',
    unknown: 'bg-slate-400',
  }[status] || 'bg-slate-400';

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${statusColor}`}>
      <span className={`w-2 h-2 rounded-full ${statusDot} ${pulse && status === 'online' ? 'animate-pulse-slow' : ''}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
