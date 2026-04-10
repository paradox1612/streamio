'use client'

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import VideoPlayer from './VideoPlayer'
import EpisodeSelector from './EpisodeSelector'
import { ArrowLeft, Heart } from 'lucide-react'
import { homeAPI, userAPI } from '@/utils/api'
import toast from 'react-hot-toast'

interface WatchModalProps {
  isOpen: boolean
  onClose: () => void
  src: string | null
  title: string
  type?: string
  vodType?: string // 'movie', 'series', 'live'
  providerId?: string
  streamId?: string
  tmdbId?: number
  imdbId?: string
}

export default function WatchModal({ 
  isOpen, 
  onClose, 
  src, 
  title, 
  type, 
  vodType, 
  providerId, 
  streamId,
  tmdbId,
  imdbId
}: WatchModalProps) {
  const [activeStream, setActiveStream] = useState<{ url: string; title: string } | null>(null)
  const [isFavorite, setIsFavorite] = useState(false)
  const [favoriteId, setFavoriteId] = useState<string | null>(null)

  // Sync active stream and favorite status
  useEffect(() => {
    if (!isOpen) {
      setActiveStream(null)
      setIsFavorite(false)
      setFavoriteId(null)
    } else {
      if (vodType !== 'series' && src) {
        setActiveStream({ url: src, title })
      }
      
      // Check if item is already a favorite
      const checkFavorite = async () => {
        try {
          const res = await homeAPI.getFavorites(vodType === 'live' ? 'channel' : vodType)
          const fav = res.data.favorites.find((f: any) => 
            f.item_id === (vodType === 'live' ? `${providerId}:${streamId || title}` : (streamId || title))
          )
          if (fav) {
            setIsFavorite(true)
            setFavoriteId(fav.id)
          }
        } catch (_) {}
      }
      checkFavorite()
    }
  }, [isOpen, vodType, src, title, providerId, streamId])

  const toggleFavorite = async () => {
    try {
      if (isFavorite && favoriteId) {
        await homeAPI.removeFavorite(favoriteId)
        setIsFavorite(false)
        setFavoriteId(null)
        toast.success('Removed from favorites')
      } else {
        const itemType = vodType === 'live' ? 'channel' : (vodType || 'movie')
        const itemId = vodType === 'live' ? `${providerId}:${streamId || title}` : (streamId || title)
        const res = await homeAPI.addFavorite({
          itemType,
          itemId,
          itemName: title,
          providerId,
          metadata: { streamId, tmdbId, imdbId }
        })
        setIsFavorite(true)
        setFavoriteId(res.data.favorite.id)
        toast.success('Added to favorites')
      }
    } catch (err) {
      toast.error('Failed to update favorite')
    }
  }

  const handleProgress = async (pct: number) => {
    if (vodType === 'live') return // No history for live
    try {
      await userAPI.updateWatchHistory({
        rawTitle: title,
        vodId: streamId,
        tmdbId,
        imdbId,
        vodType,
        progressPct: pct
      })
    } catch (_) {}
  }

  if (!isOpen) return null

  const isSeries = vodType === 'series' && !activeStream

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={`border-white/[0.08] bg-surface-950/95 backdrop-blur-xl transition-all duration-300 ${
        activeStream ? 'max-w-4xl' : 'max-w-2xl'
      }`}>
        <DialogHeader className="mb-4 flex flex-row items-center justify-between gap-4 space-y-0 pr-8">
          <div className="flex items-center gap-4">
            {activeStream && vodType === 'series' && (
              <button 
                onClick={() => setActiveStream(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <DialogTitle className="text-xl font-bold text-white">
              {activeStream ? activeStream.title : title}
            </DialogTitle>
          </div>
          
          <button 
            onClick={toggleFavorite}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
              isFavorite 
                ? 'bg-rose-500/20 text-rose-500 hover:bg-rose-500/30' 
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Heart className={`h-5 w-5 ${isFavorite ? 'fill-current' : ''}`} />
          </button>
        </DialogHeader>
        
        <div className="max-h-[75vh] overflow-y-auto pr-1">
          {isSeries && providerId && streamId ? (
            <EpisodeSelector 
              providerId={providerId}
              seriesId={streamId}
              seriesTitle={title}
              onWatch={(url, epTitle) => setActiveStream({ url, title: epTitle })}
            />
          ) : activeStream ? (
            <VideoPlayer 
              src={activeStream.url} 
              title={activeStream.title} 
              type={type} 
              onClose={onClose}
              onProgress={handleProgress}
              onEnd={() => handleProgress(100)}
            />
          ) : (
            <div className="flex h-40 items-center justify-center text-slate-500">
              No stream available
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
