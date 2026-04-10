'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Info, Star } from 'lucide-react'
import { VodItem } from '@/types/vod'

interface HeroBannerProps {
  items: VodItem[]
  onPlay: (item: VodItem) => void
  onInfo: (item: VodItem) => void
}

const HeroBanner: React.FC<HeroBannerProps> = ({ items, onPlay, onInfo }) => {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    if (items.length <= 1) return
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length)
    }, 8000)
    return () => clearInterval(interval)
  }, [items])

  if (items.length === 0) return null

  const item = items[currentIndex]

  return (
    <div className="relative h-[70vh] w-full overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={item.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          className="absolute inset-0"
        >
          {/* Backdrop Image */}
          {item.backdrop_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.backdrop_url}
              alt={item.raw_title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-zinc-900" />
          )}

          {/* Overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#141414]/80 via-transparent to-transparent" />

          {/* Content */}
          <div className="absolute bottom-0 left-0 right-0 p-8 md:p-16 space-y-4 max-w-3xl">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="space-y-4"
            >
              <h1 className="text-4xl md:text-6xl font-black text-white drop-shadow-lg tracking-tight">
                {item.raw_title}
              </h1>

              <div className="flex flex-wrap items-center gap-4 text-sm font-bold">
                {item.rating && (
                  <span className="flex items-center gap-1 text-green-500">
                    <Star className="h-4 w-4 fill-current" />
                    {item.rating.toFixed(1)}
                  </span>
                )}
                {item.year && <span className="text-zinc-300">{item.year}</span>}
                {item.runtime && <span className="text-zinc-300">{item.runtime}</span>}
                {item.genres && item.genres.slice(0, 3).map(genre => (
                  <span key={genre} className="px-2 py-0.5 rounded bg-white/10 text-zinc-200 border border-white/10">
                    {genre}
                  </span>
                ))}
              </div>

              <p className="text-base md:text-lg text-zinc-300 line-clamp-3 md:line-clamp-4 drop-shadow font-medium max-w-2xl">
                {item.overview}
              </p>

              <div className="flex flex-wrap gap-4 pt-4">
                <button
                  onClick={() => onPlay(item)}
                  className="flex items-center gap-2 px-8 py-3 bg-[#1491ff] text-white font-bold rounded hover:bg-[#0c73db] transition-colors shadow-xl scale-100 hover:scale-105 active:scale-95"
                >
                  <Play className="h-5 w-5 fill-current" /> Play Now
                </button>
                <button
                  onClick={() => onInfo(item)}
                  className="flex items-center gap-2 px-8 py-3 bg-white/20 text-white font-bold rounded backdrop-blur-md hover:bg-white/30 transition-colors border border-white/10 scale-100 hover:scale-105 active:scale-95"
                >
                  <Info className="h-5 w-5" /> More Info
                </button>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Hero Indicators */}
      {items.length > 1 && (
        <div className="absolute bottom-8 right-8 flex gap-2">
          {items.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`h-1.5 rounded-full transition-all ${
                currentIndex === idx ? 'w-8 bg-[#1491ff]' : 'w-2 bg-white/30 hover:bg-white/50'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default HeroBanner
