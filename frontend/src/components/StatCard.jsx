import React from 'react';

export default function StatCard({ icon: Icon, label, value, sub, color = 'text-indigo-400' }) {
  return (
    <div className="panel-soft group p-4 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-4 sm:mb-5">
        <span className="metric-label">{label}</span>
        {Icon && (
          <span className="flex h-10 w-10 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.04] sm:h-11 sm:w-11 sm:rounded-2xl">
            <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${color} opacity-80 transition-opacity group-hover:opacity-100`} />
          </span>
        )}
      </div>
      <div className="metric-value mb-2">{value}</div>
      {sub && <div className="text-sm leading-6 text-slate-300/70">{sub}</div>}
    </div>
  );
}
