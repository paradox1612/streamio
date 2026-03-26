import React from 'react';

export default function StatCard({ icon: Icon, label, value, sub, color = 'text-indigo-400' }) {
  return (
    <div className="panel-soft group p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <span className="metric-label">{label}</span>
        {Icon && (
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
            <Icon className={`h-5 w-5 ${color} opacity-80 transition-opacity group-hover:opacity-100`} />
          </span>
        )}
      </div>
      <div className="metric-value mb-2">{value}</div>
      {sub && <div className="text-sm text-slate-300/70">{sub}</div>}
    </div>
  );
}
