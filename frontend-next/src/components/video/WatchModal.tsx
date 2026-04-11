'use client'

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import VideoPlayer from './VideoPlayer'
import EpisodeSelector from './EpisodeSelector'
import { X, Play, Heart, PlayCircle, Star, ExternalLink, Copy, Monitor, Smartphone, Laptop } from 'lucide-react'
import { homeAPI, userAPI, vodAPI } from '@/utils/api'
import { isMobileDevice, isBrowserUnfriendly, isIOS, isAndroid } from '@/utils/device'
import { getAvailablePlayers, getMobilePlayerUrl, MobilePlayer } from '@/utils/player'
import toast from 'react-hot-toast'
import NetflixCard from './NetflixCard'
import { VodItem } from '@/types/vod'

interface WatchModalProps {
  isOpen: boolean
  onClose: () => void
  src: string | null
  title: string
  vodType?: string // 'movie', 'series', 'live'
  providerId?: string
  streamId?: string
  tmdbId?: number
  imdbId?: string
  autoPlay?: boolean
}

export default function WatchModal({ 
  isOpen, 
  onClose, 
  src, 
  title, 
  vodType, 
  providerId, 
  streamId,
  tmdbId: initialTmdbId,
  imdbId: initialImdbId,
  autoPlay = false
}: WatchModalProps) {
  const [activeStream, setActiveStream] = useState<{ url: string; title: string } | null>(null)
  const [isFavorite, setIsFavorite] = useState(false)
  const [favoriteId, setFavoriteId] = useState<string | null>(null)
  const [tmdbDetails, setTmdbDetails] = useState<any>(null)
  const [similarTitles, setSimilarTitles] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [showTrailer, setShowTrailer] = useState(false)

  // Mobile player state
  const isMobile = isMobileDevice()
  const isUnfriendly = isBrowserUnfriendly(src)

  // Current item state for internal navigation (similar titles)
  const [currentTmdbId, setCurrentTmdbId] = useState<number | undefined>(initialTmdbId)
  const [currentTitle, setCurrentTitle] = useState(title)
  const [currentVodType, setCurrentVodType] = useState(vodType)
  const [currentStreamId, setCurrentStreamId] = useState(streamId)

  useEffect(() => {
    setCurrentTmdbId(initialTmdbId)
    setCurrentTitle(title)
    setCurrentVodType(vodType)
    setCurrentStreamId(streamId)
  }, [initialTmdbId, title, vodType, streamId])

  // Fetch TMDB details and similar titles
  useEffect(() => {
    if (isOpen && currentTmdbId) {
      setLoading(true)
      Promise.all([
        vodAPI.getDetails(currentTmdbId, currentVodType === 'series' ? 'series' : 'movie'),
        vodAPI.getSimilar(currentTmdbId, currentVodType === 'series' ? 'series' : 'movie')
      ]).then(([detailsRes, similarRes]) => {
        setTmdbDetails(detailsRes.data)
        setSimilarTitles(similarRes.data)
      }).catch(err => {
        console.error('Failed to fetch TMDB data', err)
      }).finally(() => {
        setLoading(false)
      })
    }
  }, [isOpen, currentTmdbId, currentVodType])

  // Sync active stream and favorite status
  useEffect(() => {
    if (!isOpen) {
      setActiveStream(null)
      setIsFavorite(false)
      setFavoriteId(null)
      setTmdbDetails(null)
      setSimilarTitles([])
      setShowTrailer(false)
    } else {
      // ONLY auto-play if specifically requested AND it's not a series
      if (autoPlay && currentVodType !== 'series' && src && !activeStream) {
        if (isUnfriendly) {
           toast.success('Use an external player for this stream format')
        } else {
           setActiveStream({ url: src, title: currentTitle })
        }
      }
      
      const checkFavorite = async () => {
        try {
          const res = await homeAPI.getFavorites(currentVodType === 'live' ? 'channel' : currentVodType)
          const fav = res.data.favorites.find((f: any) => 
            f.item_id === (currentVodType === 'live' ? `${providerId}:${currentStreamId || currentTitle}` : (currentStreamId || currentTitle))
          )
          if (fav) {
            setIsFavorite(true)
            setFavoriteId(fav.id)
          } else {
            setIsFavorite(false)
            setFavoriteId(null)
          }
        } catch (_) {}
      }
      checkFavorite()
    }
  }, [isOpen, currentVodType, src, currentTitle, providerId, currentStreamId, activeStream, autoPlay, isMobile, isUnfriendly])

  const toggleFavorite = async () => {
    try {
      if (isFavorite && favoriteId) {
        await homeAPI.removeFavorite(favoriteId)
        setIsFavorite(false)
        setFavoriteId(null)
        toast.success('Removed from favorites')
      } else {
        const itemType = currentVodType === 'live' ? 'channel' : (currentVodType || 'movie')
        const itemId = currentVodType === 'live' ? `${providerId}:${currentStreamId || currentTitle}` : (currentStreamId || currentTitle)
        const res = await homeAPI.addFavorite({
          itemType,
          itemId,
          itemName: currentTitle,
          providerId,
          metadata: { streamId: currentStreamId, tmdbId: currentTmdbId, imdbId: initialImdbId }
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
    if (currentVodType === 'live') return
    try {
      await userAPI.updateWatchHistory({
        rawTitle: currentTitle,
        vodId: currentStreamId,
        tmdbId: currentTmdbId,
        imdbId: initialImdbId,
        vodType: currentVodType,
        progressPct: pct
      })
    } catch (_) {}
  }

  const openInPlayer = (player: MobilePlayer) => {
    if (!src) return
    const url = getMobilePlayerUrl(player, src, currentTitle)
    if (url) {
      window.open(url, '_blank')
      handleProgress(10) // Record minimal progress to show it was started
    }
  }

  const copyUrl = () => {
    if (!src) return
    navigator.clipboard.writeText(src)
    toast.success('Stream URL copied to clipboard')
  }

  const hasEpisodeList = currentVodType === 'series' && Boolean(providerId && currentStreamId)
  const canShowPrimaryAction = hasEpisodeList || Boolean(src)

  const handlePrimaryAction = () => {
    if (hasEpisodeList) {
      const epSection = document.getElementById('episodes-section')
      if (epSection) epSection.scrollIntoView({ behavior: 'smooth' })
      else toast.error('Please select an episode below')
      return
    }

    if (!src) return

    if (isUnfriendly) {
      toast.success('Use an external player for this stream format')
    } else {
      setActiveStream({ url: src, title: currentTitle })
    }
  }

  if (!isOpen) return null

  const trailer = tmdbDetails?.videos?.results?.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube')
  const cast = tmdbDetails?.credits?.cast?.slice(0, 10) || []
  const genres = tmdbDetails?.genres?.map((g: any) => g.name).join(', ')
  const runtime = tmdbDetails?.runtime 
    ? `${Math.floor(tmdbDetails.runtime / 60)}h ${tmdbDetails.runtime % 60}m`
    : tmdbDetails?.episode_run_time?.[0] 
      ? `${tmdbDetails.episode_run_time[0]}m`
      : ''

  const availablePlayers = getAvailablePlayers().filter(p => {
    if (p.platform === 'all') return true
    if (p.platform === 'ios' && isIOS()) return true
    if (p.platform === 'android' && isAndroid()) return true
    return false
  })

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-none w-screen h-screen border-none bg-[#141414] p-0 text-white overflow-y-auto scrollbar-hide m-0 rounded-none">
        {activeStream ? (
           <div className="relative h-screen w-screen bg-black">
             <button
               onClick={() => setActiveStream(null)}
               className="fixed top-6 right-6 z-[120] p-2 rounded-full bg-black/70 hover:bg-black transition-colors border border-white/10"
             >
               <X className="h-6 w-6" />
             </button>
             <VideoPlayer 
                src={activeStream.url} 
                title={activeStream.title} 
                onClose={() => setActiveStream(null)}
                onProgress={handleProgress}
                onEnd={() => handleProgress(100)}
              />
           </div>
        ) : (
          <div className="relative pb-24">
            {/* Close button */}
            <button 
              onClick={onClose}
              className="fixed top-6 right-6 z-50 p-2 rounded-full bg-black/50 hover:bg-black/80 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>

            {/* Hero Backdrop */}
            <div className="relative h-[65vh] w-full">
              {tmdbDetails?.backdrop_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img 
                  src={`https://image.tmdb.org/t/p/w1280${tmdbDetails.backdrop_path}`}
                  alt={currentTitle}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-zinc-900 flex items-center justify-center text-zinc-700">
                   No Backdrop Available
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/20 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#141414]/80 via-transparent to-transparent" />
            </div>

            {/* Content Split */}
            <div className="relative -mt-48 px-4 md:px-12 grid grid-cols-1 md:grid-cols-[350px_1fr] gap-12">
              {/* Left Column */}
              <div className="space-y-6 flex flex-col items-center md:items-start">
                <div className="aspect-[2/3] w-full max-w-[350px] rounded-lg overflow-hidden shadow-2xl border border-white/10">
                  {tmdbDetails?.poster_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img 
                      src={`https://image.tmdb.org/t/p/w342${tmdbDetails.poster_path}`}
                      alt={currentTitle}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-500">
                      No Poster
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-3 w-full max-w-[350px]">
                   {canShowPrimaryAction && (
                     <div className="space-y-3">
                        <button 
                          onClick={handlePrimaryAction}
                          className="flex items-center justify-center gap-2 w-full py-4 bg-[#1491ff] text-white font-bold rounded hover:bg-[#0c73db] transition-colors shadow-lg"
                        >
                          <Play className="h-5 w-5 fill-current" /> {hasEpisodeList ? 'Select Episode' : 'Play in Browser'}
                        </button>

                        {(isMobile || isUnfriendly) && currentVodType !== 'series' && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-center">Open in External Player</p>
                            <div className="grid grid-cols-2 gap-2">
                               {availablePlayers.map(p => (
                                 <button 
                                   key={p.id}
                                   onClick={() => openInPlayer(p.id)}
                                   className="flex items-center justify-center gap-2 py-2 bg-white/5 border border-white/10 rounded text-xs font-bold hover:bg-white/10 transition-colors"
                                 >
                                   {p.id === 'vlc' && <Smartphone className="h-3 w-3 text-orange-400" />}
                                   {p.id === 'infuse' && <Smartphone className="h-3 w-3 text-rose-400" />}
                                   {p.id === 'iina' && <Laptop className="h-3 w-3 text-sky-400" />}
                                   {p.name}
                                 </button>
                               ))}
                               <button 
                                 onClick={copyUrl}
                                 className="flex items-center justify-center gap-2 py-2 bg-white/5 border border-white/10 rounded text-xs font-bold hover:bg-white/10 transition-colors col-span-2"
                               >
                                 <Copy className="h-3 w-3" /> Copy Stream URL
                               </button>
                            </div>
                          </div>
                        )}
                     </div>
                   )}
                   <div className="flex gap-2">
                     <button 
                       onClick={toggleFavorite}
                       className="flex-1 flex items-center justify-center gap-2 py-3 bg-zinc-800 text-white font-bold rounded hover:bg-zinc-700 transition-colors border border-white/10"
                     >
                       <Heart className={`h-5 w-5 ${isFavorite ? 'fill-current text-[#1491ff]' : ''}`} /> 
                       {isFavorite ? 'In Watchlist' : 'Add to Watchlist'}
                     </button>
                     {trailer && (
                        <button 
                          onClick={() => setShowTrailer(true)}
                          className="flex h-12 w-12 items-center justify-center bg-zinc-800 text-white rounded hover:bg-zinc-700 transition-colors border border-white/10"
                        >
                          <PlayCircle className="h-5 w-5" />
                        </button>
                     )}
                   </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                <h1 className="text-4xl md:text-7xl font-bold tracking-tight">{currentTitle}</h1>
                {tmdbDetails?.tagline && <p className="text-2xl italic text-zinc-400 font-medium">"{tmdbDetails.tagline}"</p>}
                
                <div className="flex flex-wrap items-center gap-6 text-base font-semibold">
                  {tmdbDetails?.release_date && <span className="text-zinc-300">{tmdbDetails.release_date.split('-')[0]}</span>}
                  {tmdbDetails?.first_air_date && <span className="text-zinc-300">{tmdbDetails.first_air_date.split('-')[0]}</span>}
                  {tmdbDetails?.vote_average > 0 && (
                    <span className="flex items-center gap-1 text-green-500">
                      <Star className="h-4 w-4 fill-current" />
                      {tmdbDetails.vote_average.toFixed(1)}
                    </span>
                  )}
                  {runtime && <span className="text-zinc-300">{runtime}</span>}
                  {tmdbDetails?.number_of_seasons && <span className="text-zinc-300">{tmdbDetails.number_of_seasons} Seasons</span>}
                  {initialImdbId && (
                    <a 
                      href={`https://www.imdb.com/title/${initialImdbId}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors border-l border-zinc-700 pl-6"
                    >
                      IMDb <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                <div className="text-sm">
                   <span className="text-zinc-500 mr-2 uppercase tracking-widest font-bold">Genres:</span> 
                   <span className="text-zinc-300">{genres || 'N/A'}</span>
                </div>

                <p className="text-xl leading-relaxed text-zinc-200 max-w-3xl">
                  {tmdbDetails?.overview}
                </p>

                {!canShowPrimaryAction && (
                  <div className="max-w-2xl rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                    This title is not currently mapped to a playable Xtream item in your library.
                  </div>
                )}

                {/* Cast */}
                {cast.length > 0 && (
                  <div className="space-y-4 pt-8 border-t border-white/10">
                    <h3 className="text-xl font-bold uppercase tracking-widest text-zinc-500">Cast</h3>
                    <div className="flex gap-6 overflow-x-auto scrollbar-hide pb-4">
                      {cast.map((person: any) => (
                        <div key={person.id} className="flex-shrink-0 w-28 text-center space-y-3">
                          <div className="h-28 w-28 rounded-full overflow-hidden mx-auto border-2 border-zinc-800 shadow-xl">
                            {person.profile_path ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img 
                                src={`https://image.tmdb.org/t/p/w185${person.profile_path}`}
                                alt={person.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-600">
                                <Star className="h-8 w-8" />
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-bold line-clamp-1">{person.name}</p>
                            <p className="text-[10px] text-zinc-500 line-clamp-1">{person.character}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Episodes (if series) */}
            {currentVodType === 'series' && providerId && currentStreamId && (
              <div id="episodes-section" className="mt-20 px-4 md:px-12 pt-12 border-t border-white/10">
                <EpisodeSelector 
                  providerId={providerId}
                  seriesId={currentStreamId}
                  seriesTitle={currentTitle}
                  tmdbId={currentTmdbId}
                  onWatch={(url, epTitle) => setActiveStream({ url, title: epTitle })}
                />
              </div>
            )}

            {/* Similar Titles */}
            {similarTitles.length > 0 && (
              <div className="mt-20 px-4 md:px-12 space-y-8 pt-12 border-t border-white/10">
                <h3 className="text-3xl font-bold tracking-tight">More Like This</h3>
                <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-8">
                  {similarTitles.map((item: any) => {
                    const vodItem: VodItem = {
                      id: item.library_item?.id || `similar-${item.id}`,
                      stream_id: item.library_item?.stream_id || '',
                      raw_title: item.title || item.name,
                      vod_type: currentVodType === 'series' ? 'series' : 'movie',
                      poster_url: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : undefined,
                      tmdb_id: item.id,
                      confidence_score: 1,
                      is_watched: item.library_item?.is_watched
                    }
                    return (
                      <div key={item.id} className="relative">
                        <NetflixCard 
                          item={vodItem}
                          onInfo={() => {
                             if (item.in_library) {
                               setCurrentTmdbId(item.id)
                               setCurrentTitle(item.title || item.name)
                               setCurrentStreamId(item.library_item.stream_id)
                               setTmdbDetails(null)
                               setSimilarTitles([])
                               window.scrollTo({ top: 0, behavior: 'smooth' })
                             } else {
                               toast.error('This title is not in your library')
                             }
                          }}
                          onPlay={() => {
                            if (item.in_library && item.library_item.streamUrl) {
                              setActiveStream({ url: item.library_item.streamUrl, title: item.title || item.name })
                            } else if (item.in_library) {
                               // If it's in library but no stream URL yet, navigate to it
                               setCurrentTmdbId(item.id)
                               setCurrentTitle(item.title || item.name)
                               setCurrentStreamId(item.library_item.stream_id)
                               setTmdbDetails(null)
                               setSimilarTitles([])
                               window.scrollTo({ top: 0, behavior: 'smooth' })
                            } else {
                              toast.error('This title is not in your library')
                            }
                          }}
                        />
                        {!item.in_library && (
                          <div className="absolute inset-0 z-20 bg-black/60 flex items-center justify-center text-center p-2 rounded-lg pointer-events-none">
                            <span className="text-[10px] font-bold uppercase tracking-widest bg-zinc-900 border border-white/10 px-2 py-1 rounded shadow-xl">Not in Library</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Trailer Sub-Modal */}
        {showTrailer && trailer && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 md:p-12 backdrop-blur-sm">
            <button 
              onClick={() => setShowTrailer(false)}
              className="absolute top-6 right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all border border-white/10 hover:scale-110"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="w-full max-w-6xl aspect-video shadow-[0_0_100px_rgba(20,145,255,0.2)] rounded-lg overflow-hidden border border-white/10">
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1`}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
