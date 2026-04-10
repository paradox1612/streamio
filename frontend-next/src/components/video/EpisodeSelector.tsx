'use client'

import React, { useState, useEffect } from 'react'
import { providerAPI } from '@/utils/api'
import { Play, Laptop, Monitor, Smartphone, Loader2, List, Check } from 'lucide-react'
import toast from 'react-hot-toast'

interface Episode {
  id: string
  episode_num: number
  title: string
  container_extension: string
  tmdb_info?: {
    name: string
    overview: string
    still_path: string
    vote_average: number
    air_date: string
    runtime: number
  }
  info?: {
    plot?: string
    releasedate?: string
    rating?: string
    duration?: string
    movie_image?: string
  }
  is_watched?: boolean
}

interface SeasonMap {
  [season: string]: Episode[]
}

interface EpisodeSelectorProps {
  providerId: string
  seriesId: string
  seriesTitle: string
  tmdbId?: number
  onWatch: (url: string, title: string) => void
}

export default function EpisodeSelector({ providerId, seriesId, seriesTitle, tmdbId, onWatch }: EpisodeSelectorProps) {
  const [seasons, setSeasons] = useState<SeasonMap>({})
  const [loading, setLoading] = useState(true)
  const [activeSeason, setActiveSeason] = useState<string | null>(null)
  const [providerInfo, setProviderInfo] = useState<any>(null)

  useEffect(() => {
    async function loadData() {
      try {
        const [epRes, provRes] = await Promise.all([
          providerAPI.getEpisodes(providerId, seriesId, tmdbId),
          providerAPI.get(providerId)
        ])
        setSeasons(epRes.data || {})
        setProviderInfo(provRes.data)
        
        const seasonKeys = Object.keys(epRes.data || {}).sort((a, b) => parseInt(a) - parseInt(b))
        if (seasonKeys.length > 0) {
          setActiveSeason(seasonKeys[0])
        }
      } catch (err) {
        toast.error('Failed to load episodes')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [providerId, seriesId, tmdbId])

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
    if (player === 'iina') window.open(`iina://weblink?url=${encodeURIComponent(url)}`)
    else if (player === 'vlc') window.open(`vlc://${url.replace(/^https?:\/\//, '')}`)
    else if (player === 'infuse') window.open(`infuse://address/${url.replace(/^https?:\/\//, '')}`)
  }

  if (loading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4 text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin text-[#1491ff]" />
        <p className="text-sm font-medium">Fetching episodes...</p>
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

  const episodes = activeSeason ? seasons[activeSeason] : []

  return (
    <div className="flex flex-col gap-8">
      {/* Season Tabs */}
      <div className="flex flex-wrap gap-2">
        {seasonKeys.map((season) => (
          <button
            key={season}
            onClick={() => setActiveSeason(season)}
            className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${
              activeSeason === season 
                ? 'bg-[#1491ff] text-white shadow-[0_0_20px_rgba(20,145,255,0.4)] scale-105' 
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
            }`}
          >
            Season {season}
          </button>
        ))}
      </div>

      {/* Episode List */}
      <div className="space-y-4">
        {episodes.map((ep) => (
          <div 
            key={ep.id} 
            className={`group relative flex flex-col md:flex-row gap-6 p-4 rounded-lg bg-zinc-900/40 hover:bg-zinc-800/60 transition-all border border-white/5 ${
              ep.is_watched ? 'opacity-60' : ''
            }`}
          >
            {/* Thumbnail */}
            <div 
               onClick={() => onWatch(getStreamUrl(ep), `S${activeSeason}E${ep.episode_num}: ${ep.tmdb_info?.name || ep.title}`)}
               className="relative flex-shrink-0 w-full md:w-64 aspect-video rounded-md overflow-hidden bg-zinc-800 cursor-pointer shadow-lg"
            >
               {(ep.tmdb_info?.still_path || ep.info?.movie_image) ? (
                 // eslint-disable-next-line @next/next/no-img-element
                 <img 
                   src={ep.tmdb_info?.still_path ? `https://image.tmdb.org/t/p/w300${ep.tmdb_info.still_path}` : ep.info?.movie_image}
                   alt={ep.title}
                   className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                   loading="lazy"
                 />
               ) : (
                 <div className="w-full h-full flex items-center justify-center text-zinc-700">
                    <Play className="h-10 w-10 opacity-20" />
                 </div>
               )}
               {/* Play Button Overlay */}
               <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="p-3 rounded-full bg-[#1491ff]/80 backdrop-blur-md border border-white/20 text-white transform scale-90 group-hover:scale-100 transition-transform">
                    <Play className="h-6 w-6 fill-current ml-0.5" />
                  </div>
               </div>
               {ep.is_watched && (
                  <div className="absolute top-2 right-2 p-1.5 bg-green-500 rounded-full shadow-lg">
                    <Check className="h-3 w-3 text-white stroke-[4px]" />
                  </div>
               )}
            </div>

            {/* Info */}
            <div className="flex-1 flex flex-col justify-center gap-2">
              <div className="flex items-center justify-between gap-4">
                <h4 className="text-lg font-bold group-hover:text-[#1491ff] transition-colors">
                  {ep.episode_num}. {ep.tmdb_info?.name || ep.title}
                </h4>
                {ep.tmdb_info?.runtime && (
                  <span className="text-xs font-bold text-zinc-500 bg-black/30 px-2 py-1 rounded">{ep.tmdb_info.runtime}m</span>
                )}
              </div>
              <p className="text-sm text-zinc-400 line-clamp-2 md:line-clamp-3 leading-relaxed">
                {ep.tmdb_info?.overview || ep.info?.plot || 'No description available for this episode.'}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
               <button 
                 onClick={() => onWatch(getStreamUrl(ep), `S${activeSeason}E${ep.episode_num}: ${ep.tmdb_info?.name || ep.title}`)}
                 className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black hover:bg-[#1491ff] hover:text-white transition-all shadow-xl hover:scale-110 active:scale-95"
               >
                 <Play className="h-5 w-5 fill-current ml-0.5" />
               </button>
               
               <div className="flex gap-1 p-1 bg-black/40 rounded-lg backdrop-blur-sm border border-white/10">
                  <button 
                    onClick={() => handleLaunchNative(ep, 'iina')}
                    className="p-2.5 hover:bg-white/10 rounded transition-colors group/native"
                    title="Play in IINA"
                  >
                    <Laptop className="h-4 w-4 text-sky-400 group-hover/native:scale-110 transition-transform" />
                  </button>
                  <button 
                    onClick={() => handleLaunchNative(ep, 'vlc')}
                    className="p-2.5 hover:bg-white/10 rounded transition-colors group/native"
                    title="Play in VLC"
                  >
                    <Monitor className="h-4 w-4 text-orange-400 group-hover/native:scale-110 transition-transform" />
                  </button>
                  <button 
                    onClick={() => handleLaunchNative(ep, 'infuse')}
                    className="p-2.5 hover:bg-white/10 rounded transition-colors group/native"
                    title="Play in Infuse"
                  >
                    <Smartphone className="h-4 w-4 text-rose-400 group-hover/native:scale-110 transition-transform" />
                  </button>
               </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
