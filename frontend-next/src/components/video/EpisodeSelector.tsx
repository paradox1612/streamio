'use client'

import React, { useState, useEffect } from 'react'
import { providerAPI } from '@/utils/api'
import { Play, Laptop, Monitor, Smartphone, ChevronDown, ChevronRight, Loader2, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

interface Episode {
  id: string
  episode_num: number
  title: string
  container_extension: string
  info?: {
    plot?: string
    releasedate?: string
    rating?: string
    duration?: string
    movie_image?: string
  }
}

interface SeasonMap {
  [season: string]: Episode[]
}

interface EpisodeSelectorProps {
  providerId: string
  seriesId: string
  seriesTitle: string
  onWatch: (url: string, title: string) => void
}

export default function EpisodeSelector({ providerId, seriesId, seriesTitle, onWatch }: EpisodeSelectorProps) {
  const [seasons, setSeasons] = useState<SeasonMap>({})
  const [loading, setLoading] = useState(true)
  const [expandedSeason, setExpandedSeason] = useState<string | null>(null)
  const [providerInfo, setProviderInfo] = useState<any>(null)

  useEffect(() => {
    async function loadData() {
      try {
        const [epRes, provRes] = await Promise.all([
          providerAPI.getEpisodes(providerId, seriesId),
          providerAPI.get(providerId)
        ])
        setSeasons(epRes.data || {})
        setProviderInfo(provRes.data)
        
        // Auto-expand first season
        const seasonKeys = Object.keys(epRes.data || {})
        if (seasonKeys.length > 0) {
          setExpandedSeason(seasonKeys[0])
        }
      } catch (err) {
        toast.error('Failed to load episodes')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [providerId, seriesId])

  const getStreamUrl = (episode: Episode) => {
    if (!providerInfo) return ''
    const host = providerInfo.active_host || providerInfo.hosts?.[0]
    const user = encodeURIComponent(providerInfo.username)
    const pass = encodeURIComponent(providerInfo.password)
    const ext = episode.container_extension || 'mkv'
    return `${host}/series/${user}/${pass}/${episode.id}.${ext}`
  }

  const handleLaunchNative = (episode: Episode, player: 'iina' | 'vlc' | 'infuse') => {
    const url = getStreamUrl(episode)
    const epTitle = `S${expandedSeason}E${episode.episode_num}: ${episode.title}`
    
    if (player === 'iina') {
      window.open(`iina://weblink?url=${encodeURIComponent(url)}`)
    } else if (player === 'vlc') {
      window.open(`vlc://${url.replace(/^https?:\/\//, '')}`)
    } else if (player === 'infuse') {
      window.open(`infuse://address/${url.replace(/^https?:\/\//, '')}`)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4 text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
        <p className="text-sm font-medium">Fetching episodes from provider...</p>
      </div>
    )
  }

  const seasonKeys = Object.keys(seasons).sort((a, b) => parseInt(a) - parseInt(b))

  if (seasonKeys.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-2xl border border-white/5 bg-white/[0.02] text-slate-400">
        <List className="h-10 w-10 opacity-20" />
        <p className="text-sm">No episodes found for this series.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-3">
        {seasonKeys.map((season) => (
          <div key={season} className="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02]">
            <button
              onClick={() => setExpandedSeason(expandedSeason === season ? null : season)}
              className="flex w-full items-center justify-between px-5 py-4 transition hover:bg-white/[0.03]"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-white">Season {season}</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                  {seasons[season].length} Episodes
                </span>
              </div>
              {expandedSeason === season ? <ChevronDown className="h-5 w-5 text-slate-500" /> : <ChevronRight className="h-5 w-5 text-slate-500" />}
            </button>

            {expandedSeason === season && (
              <div className="divide-y divide-white/5 border-t border-white/5 bg-black/20">
                {seasons[season].map((ep) => (
                  <div key={ep.id} className="group p-4 transition hover:bg-white/[0.02]">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      {ep.info?.movie_image && (
                        <img 
                          src={ep.info.movie_image} 
                          alt={ep.title} 
                          className="h-24 w-full rounded-xl object-cover sm:w-40"
                        />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-4">
                          <h4 className="font-bold text-white">
                            {ep.episode_num}. {ep.title}
                          </h4>
                        </div>
                        {ep.info?.plot && (
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">
                            {ep.info.plot}
                          </p>
                        )}
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button 
                            size="sm" 
                            onClick={() => onWatch(getStreamUrl(ep), `S${season}E${ep.episode_num}: ${ep.title}`)}
                            className="h-8 bg-brand-500 text-[11px] font-bold hover:bg-brand-600"
                          >
                            <Play className="mr-1.5 h-3.5 w-3.5 fill-current" /> Play in Browser
                          </Button>
                          <div className="flex h-8 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1">
                            <button 
                              onClick={() => handleLaunchNative(ep, 'iina')}
                              className="flex h-6 w-6 items-center justify-center rounded transition hover:bg-white/10"
                              title="Play in IINA"
                            >
                              <Laptop className="h-3.5 w-3.5 text-sky-400" />
                            </button>
                            <button 
                              onClick={() => handleLaunchNative(ep, 'vlc')}
                              className="flex h-6 w-6 items-center justify-center rounded transition hover:bg-white/10"
                              title="Play in VLC"
                            >
                              <Monitor className="h-3.5 w-3.5 text-orange-400" />
                            </button>
                            <button 
                              onClick={() => handleLaunchNative(ep, 'infuse')}
                              className="flex h-6 w-6 items-center justify-center rounded transition hover:bg-white/10"
                              title="Play in Infuse"
                            >
                              <Smartphone className="h-3.5 w-3.5 text-rose-400" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
