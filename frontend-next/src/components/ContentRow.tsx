'use client'

import Link from 'next/link'
import { ChevronRight, Play, Tv2 } from 'lucide-react'

type ContentItem = {
  id: string
  title: string
  subtitle?: string | null
  image?: string | null
  href?: string
  progress?: number | null
  badge?: string | null
  meta?: string | null
  ctaLabel?: string | null
}

export default function ContentRow({
  title,
  eyebrow,
  items,
  emptyLabel,
}: {
  title: string
  eyebrow?: string
  items: ContentItem[]
  emptyLabel?: string
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
          <h2 className="section-title">{title}</h2>
        </div>
        <div className="hidden items-center gap-2 text-sm font-semibold text-slate-300/60 sm:flex">
          Scroll
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>

      {items.length > 0 ? (
        <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          {items.map((item) => {
            const card = (
              <>
                <div className="relative aspect-[2/3] overflow-hidden rounded-[22px] bg-surface-900">
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image}
                      alt={item.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-linear-to-br from-surface-800 to-surface-950 text-slate-300/40">
                      <Tv2 className="h-10 w-10" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" />
                  {item.progress !== null && item.progress !== undefined && (
                    <div className="absolute inset-x-3 bottom-3 h-1.5 overflow-hidden rounded-full bg-white/15">
                      <div
                        className="h-full rounded-full bg-brand-400"
                        style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }}
                      />
                    </div>
                  )}
                  {item.badge && (
                    <div className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                      {item.badge}
                    </div>
                  )}
                </div>
                <div className="space-y-1 px-1 pt-3">
                  <h3 className="line-clamp-2 text-sm font-semibold text-white">{item.title}</h3>
                  {item.subtitle && (
                    <p className="line-clamp-1 text-xs text-slate-300/55">{item.subtitle}</p>
                  )}
                  {item.meta && (
                    <p className="line-clamp-1 text-xs text-slate-400/55">{item.meta}</p>
                  )}
                  {item.ctaLabel && (
                    <div className="inline-flex items-center gap-1 pt-1 text-xs font-semibold text-brand-200">
                      <Play className="h-3 w-3 fill-current" />
                      {item.ctaLabel}
                    </div>
                  )}
                </div>
              </>
            )

            if (item.href) {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="group block w-[11rem] flex-none rounded-[26px] border border-white/[0.06] bg-white/[0.02] p-2 transition-all duration-200 hover:-translate-y-1 hover:border-white/[0.12] hover:bg-white/[0.04] sm:w-[12rem]"
                >
                  {card}
                </Link>
              )
            }

            return (
              <div
                key={item.id}
                className="group w-[11rem] flex-none rounded-[26px] border border-white/[0.06] bg-white/[0.02] p-2 sm:w-[12rem]"
              >
                {card}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.025] px-5 py-8 text-sm text-slate-300/60">
          {emptyLabel || 'Nothing here yet.'}
        </div>
      )}
    </section>
  )
}
