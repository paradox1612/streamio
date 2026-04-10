'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Play, Info, Heart, AlertCircle } from 'lucide-react'
import { VodItem } from '@/types/vod'

interface NetflixCardProps {
  item: VodItem
  onPlay?: (item: VodItem) => void
  onInfo?: (item: VodItem) => void
  onFavorite?: (item: VodItem) => void
  showProgress?: boolean
}

const NetflixCard: React.FC<NetflixCardProps> = ({
  item,
  onPlay,
  onInfo,
  onFavorite,
  showProgress = true,
}) => {
  const isLowConfidence = item.confidence_score !== undefined && item.confidence_score < 0.8
  const progress = item.watch_progress || (item.is_watched ? 100 : 0)

  return (
    <motion.div
      whileHover={{
        scale: 1.1,
        zIndex: 50,
        transition: { duration: 0.3, ease: 'easeOut' },
      }}
      className="group relative aspect-[2/3] w-[160px] flex-shrink-0 cursor-pointer overflow-hidden rounded-lg shadow-xl"
      onClick={() => onInfo?.(item)}
    >
      {/* Poster Image */}
      {item.poster_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.poster_url}
          alt={item.raw_title}
          className="h-full w-full object-cover transition-opacity duration-300 group-hover:opacity-60"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-800">
          <span className="px-2 text-center text-xs text-zinc-500">{item.raw_title}</span>
        </div>
      )}

      {/* Overlay - visible on hover */}
      <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onPlay?.(item)
          }}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-transform hover:scale-110 hover:bg-[#1491ff]"
        >
          <Play className="ml-1 h-6 w-6 fill-current" />
        </button>
      </div>

      {/* Bottom info overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <p className="line-clamp-1 text-xs font-bold text-white">{item.raw_title}</p>
        <div className="mt-1 flex items-center justify-between">
           <button
             onClick={(e) => {
               e.stopPropagation()
               onInfo?.(item)
             }}
             className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white"
           >
             <Info className="h-3 w-3" /> Details
           </button>
        </div>
      </div>

      {/* Favorite Heart - Top Right */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onFavorite?.(item)
        }}
        className={`absolute right-2 top-2 z-10 p-1.5 transition-opacity duration-300 group-hover:opacity-100 ${
          item.is_favorite ? 'text-[#1491ff] opacity-100' : 'text-white/70 opacity-0 hover:text-white'
        }`}
      >
        <Heart className={`h-5 w-5 ${item.is_favorite ? 'fill-current' : ''}`} />
      </button>

      {/* Match confidence badge */}
      {isLowConfidence && (
        <div className="absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-yellow-500/80 text-black backdrop-blur-sm" title="Low match confidence">
          <AlertCircle className="h-4 w-4" />
        </div>
      )}

      {/* Progress Bar */}
      {showProgress && progress > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-700">
          <div
            className="h-full bg-[#1491ff]"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </motion.div>
  )
}

export default NetflixCard
