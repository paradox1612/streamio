import React from 'react'

const pulseCss = `
  @keyframes sb-status-ring {
    0%   { transform: scale(1);   opacity: 0.75; }
    70%  { transform: scale(2.2); opacity: 0; }
    100% { transform: scale(2.2); opacity: 0; }
  }
  @keyframes sb-status-dot {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.55; }
  }
`

const STATUS: Record<string, { badge: string; dot: string; ring: string | null }> = {
  online:   { badge: 'border-emerald-400/25 bg-emerald-400/[0.09] text-emerald-100', dot: 'bg-emerald-400', ring: 'bg-emerald-400' },
  offline:  { badge: 'border-red-400/25 bg-red-400/[0.09] text-red-100',             dot: 'bg-red-400',     ring: null },
  checking: { badge: 'border-amber-400/25 bg-amber-400/[0.09] text-amber-100',       dot: 'bg-amber-400',   ring: 'bg-amber-400' },
  unknown:  { badge: 'border-slate-400/20 bg-slate-400/[0.08] text-slate-100',       dot: 'bg-slate-400',   ring: null },
}

interface StatusBadgeProps {
  status?: string
  pulse?: boolean
  size?: 'sm' | 'md'
}

export default function StatusBadge({ status = 'unknown', pulse = false, size = 'md' }: StatusBadgeProps) {
  const s = STATUS[status] || STATUS.unknown
  const label = status.charAt(0).toUpperCase() + status.slice(1)
  const doPulse = pulse && (status === 'online' || status === 'checking')
  const textSz = size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-[11px] sm:text-xs px-2.5 sm:px-3 py-1'

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border font-medium ${textSz} ${s.badge}`}>
      <style>{pulseCss}</style>
      <span className="relative inline-flex h-2 w-2 flex-shrink-0">
        {doPulse && s.ring && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${s.ring} opacity-75`}
            style={{ animation: 'sb-status-ring 1.6s cubic-bezier(0,0,0.2,1) infinite' }}
          />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${s.dot}`}
          style={doPulse ? { animation: 'sb-status-dot 1.6s ease-in-out infinite' } : undefined}
        />
      </span>
      {label}
    </span>
  )
}
