'use client'

import { motion } from 'framer-motion'
import { Play, Info, Star } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface HeroBannerItem {
  tmdb_id: number
  title: string
  overview?: string | null
  backdrop_url?: string | null
  poster_url?: string | null
  year?: string | null
  rating?: number | null
  type: 'movie' | 'series'
}

interface HeroBannerAction {
  label: string
  href?: string
  onClick?: () => void
}

export default function HeroBanner({
  item,
  primaryAction,
  secondaryAction,
}: {
  item: HeroBannerItem
  primaryAction?: HeroBannerAction
  secondaryAction?: HeroBannerAction
}) {
  const router = useRouter()
  const backgroundImage = item.backdrop_url || item.poster_url

  const handleAction = (action?: HeroBannerAction) => {
    if (!action) return
    if (action.onClick) {
      action.onClick()
      return
    }
    if (action.href) router.push(action.href)
  }

  return (
    <div className="relative w-full overflow-hidden rounded-[28px] bg-surface-900" style={{ aspectRatio: '21/9', minHeight: 280 }}>
      {backgroundImage && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={backgroundImage}
            alt={item.title}
            className="absolute inset-0 h-full w-full object-cover"
            loading="eager"
          />
          {/* gradient overlays */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        </>
      )}

      <motion.div
        className="relative flex h-full flex-col justify-end p-6 sm:p-8 lg:p-12"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Type badge */}
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-full border border-brand-400/40 bg-brand-500/20 px-3 py-0.5 text-[11px] font-bold uppercase tracking-widest text-brand-200">
            {item.type === 'series' ? 'TV Series' : 'Movie'}
          </span>
          {item.year && (
            <span className="text-sm text-slate-300/60">{item.year}</span>
          )}
          {item.rating && (
            <span className="flex items-center gap-1 text-sm text-yellow-300/80">
              <Star className="h-3.5 w-3.5 fill-current" />
              {item.rating}
            </span>
          )}
        </div>

        <h1 className="max-w-lg text-3xl font-extrabold leading-tight text-white drop-shadow-lg sm:text-4xl lg:text-5xl">
          {item.title}
        </h1>

        {item.overview && (
          <p className="mt-3 line-clamp-2 max-w-xl text-sm leading-relaxed text-slate-200/75 sm:text-base">
            {item.overview}
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={() => handleAction(primaryAction)}
            className="flex items-center gap-2 rounded-2xl bg-white px-5 py-2.5 text-sm font-bold text-black shadow-lg transition hover:bg-white/90 active:scale-95"
          >
            <Play className="h-4 w-4 fill-current" />
            {primaryAction?.label || 'Play'}
          </button>
          <button
            onClick={() => handleAction(secondaryAction)}
            className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/15 active:scale-95"
          >
            <Info className="h-4 w-4" />
            {secondaryAction?.label || 'More Info'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
