export default function SectionDivider({ label, className = '' }: { label?: string; className?: string }) {
  if (!label) {
    return (
      <div className={`relative flex items-center ${className}`}>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-brand-400/25 to-transparent" />
      </div>
    )
  }

  return (
    <div className={`relative flex items-center gap-4 ${className}`}>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.1] to-white/[0.08]" />
      <span className="inline-flex flex-shrink-0 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400/60">
        {label}
      </span>
      <div className="h-px flex-1 bg-gradient-to-l from-transparent via-white/[0.1] to-white/[0.08]" />
    </div>
  )
}
