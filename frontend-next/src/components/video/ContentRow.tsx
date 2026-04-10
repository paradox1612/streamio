'use client'

import React, { useRef, useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import NetflixCard from './NetflixCard'
import { VodItem } from '@/types/vod'

interface ContentRowProps {
  title: string
  items: VodItem[]
  onPlay?: (item: VodItem) => void
  onInfo?: (item: VodItem) => void
  onFavorite?: (item: VodItem) => void
  onSeeAll?: () => void
}

const ContentRow: React.FC<ContentRowProps> = ({
  title,
  items,
  onPlay,
  onInfo,
  onFavorite,
  onSeeAll,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLeftArrow, setShowLeftArrow] = useState(false)
  const [showRightArrow, setShowRightArrow] = useState(true)

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current
      const scrollTo = direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth
      scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' })
    }
  }

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
      setShowLeftArrow(scrollLeft > 0)
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10)
    }
  }

  useEffect(() => {
    handleScroll()
    window.addEventListener('resize', handleScroll)
    return () => window.removeEventListener('resize', handleScroll)
  }, [items])

  if (items.length === 0) return null

  return (
    <div className="group/row relative mb-8">
      <div className="mb-4 flex items-center justify-between px-4 md:px-12">
        <h2 className="text-xl font-bold text-white md:text-2xl">{title}</h2>
        {onSeeAll && (
          <button
            onClick={onSeeAll}
            className="text-sm font-semibold text-zinc-400 transition-colors hover:text-white"
          >
            See All →
          </button>
        )}
      </div>

      <div className="relative">
        {/* Left Arrow */}
        {showLeftArrow && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-0 bottom-0 z-40 flex w-12 items-center justify-center bg-black/40 text-white opacity-0 transition-opacity hover:bg-black/60 group-hover/row:opacity-100 md:w-16"
          >
            <ChevronLeft className="h-8 w-8" />
          </button>
        )}

        {/* Scrollable Row */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="scrollbar-hide flex gap-4 overflow-x-auto overflow-y-visible px-4 pb-4 pt-2 md:px-12"
        >
          {items.map((item) => (
            <NetflixCard
              key={item.id}
              item={item}
              onPlay={onPlay}
              onInfo={onInfo}
              onFavorite={onFavorite}
            />
          ))}
        </div>

        {/* Right Arrow */}
        {showRightArrow && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-0 bottom-0 z-40 flex w-12 items-center justify-center bg-black/40 text-white opacity-0 transition-opacity hover:bg-black/60 group-hover/row:opacity-100 md:w-16"
          >
            <ChevronRight className="h-8 w-8" />
          </button>
        )}
      </div>
    </div>
  )
}

export default ContentRow
