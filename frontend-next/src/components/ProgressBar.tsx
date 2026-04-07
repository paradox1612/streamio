import React from 'react'

interface ProgressBarProps {
  value: number
  max?: number
  color?: string
  label?: string | null
  showLabel?: boolean
}

export default function ProgressBar({ value, max = 100, color, label = null, showLabel = false }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  let barColor = 'bg-brand-500'
  if (color) {
    if (color.includes('emerald') || color.includes('green')) barColor = 'bg-emerald-500'
    else if (color.includes('amber') || color.includes('yellow')) barColor = 'bg-amber-500'
    else if (color.includes('red')) barColor = 'bg-red-500'
    else barColor = 'bg-brand-500'
  }

  return (
    <div className="w-full">
      {(showLabel || label) && (
        <div className="mb-1 flex items-center justify-between text-xs text-slate-300/60">
          {label && <span>{label}</span>}
          {showLabel && <span>{Math.round(pct)}%</span>}
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
