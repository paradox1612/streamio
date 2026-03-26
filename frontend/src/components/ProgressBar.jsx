import React from 'react';

export default function ProgressBar({ value, max = 100, color = 'bg-indigo-500', label = null, showLabel = false }) {
  const percentage = Math.round((value / max) * 100);

  let colorClass = color;
  if (!color.includes('bg-')) {
    if (percentage >= 70) colorClass = 'bg-emerald-500';
    else if (percentage >= 40) colorClass = 'bg-amber-500';
    else colorClass = 'bg-red-500';
  }

  return (
    <div className="w-full">
      {(label || showLabel) && (
        <div className="mb-2 flex justify-between">
          <span className="text-xs font-medium text-slate-300/60">{label || 'Progress'}</span>
          <span className="text-xs font-semibold text-slate-100">{percentage}%</span>
        </div>
      )}
      <div className="h-2.5 w-full overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.05]">
        <div
          className={`h-full rounded-full ${colorClass} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
