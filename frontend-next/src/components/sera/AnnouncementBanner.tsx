'use client'

import React from 'react'
import { ArrowRight } from 'lucide-react'

interface AnnouncementBannerProps {
  children: React.ReactNode
  href?: string
  onClick?: () => void
  badge?: string
  showArrow?: boolean
  className?: string
}

export default function AnnouncementBanner({ children, href, onClick, badge, showArrow = true, className = '' }: AnnouncementBannerProps) {
  const inner = (
    <span className="flex items-center gap-2">
      {badge && (
        <span className="inline-flex items-center rounded-full bg-brand-500/20 border border-brand-400/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-brand-200">
          {badge}
        </span>
      )}
      <span className="text-[11px] font-semibold text-slate-200/80">{children}</span>
      {showArrow && <ArrowRight className="h-3 w-3 text-brand-300 flex-shrink-0" />}
    </span>
  )

  const base = `inline-flex items-center gap-2 rounded-full border border-brand-400/20 bg-brand-400/[0.08] px-3.5 py-1.5 backdrop-blur-sm transition-all duration-200 hover:border-brand-400/35 hover:bg-brand-400/[0.12] cursor-pointer ${className}`

  if (href) {
    return <a href={href} className={base} target="_blank" rel="noopener noreferrer">{inner}</a>
  }
  return <button type="button" onClick={onClick} className={base}>{inner}</button>
}
