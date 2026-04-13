'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { providerAPI, homeAPI, userAPI, vodAPI } from '@/utils/api'
import { Search, X, Film, SlidersHorizontal, ChevronDown, Loader2 } from 'lucide-react'
import ContentRow from '@/components/video/ContentRow'
import HeroBanner from '@/components/video/HeroBanner'
import WatchModal from '@/components/video/WatchModal'
import NetflixCard from '@/components/video/NetflixCard'
import { useAuthStore } from '@/store/auth'
import toast from 'react-hot-toast'
import { VodItem } from '@/types/vod'

interface Provider {
  id: string
  name: string
}

interface User {
  id: string
  has_byo_providers?: boolean
  preferred_languages?: string[]
  excluded_languages?: string[]
}

export default function VodPage() {
  const { user } = useAuthStore() as unknown as { user: User | null }
  const router = useRouter()
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [loadingProviders, setLoadingProviders] = useState(true)

  // Section data
  const [sections, setSections] = useState<{
    continueWatching: VodItem[]
    newToStreamio: VodItem[]
    trendingMovies: VodItem[]
    trendingSeries: VodItem[]
    movies: VodItem[]
    series: VodItem[]
    topRated: VodItem[]
    featured: VodItem[]
  }>({
    continueWatching: [],
    newToStreamio: [],
    trendingMovies: [],
    trendingSeries: [],
    movies: [],
    series: [],
    topRated: [],
    featured: [],
  })

  // Browse state (Infinite Scroll)
  const [browseItems, setBrowseItems] = useState<VodItem[]>([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [activeType, setActiveType] = useState<'' | 'movie' | 'series'>('')
  const [activeSort, setActiveSort] = useState<'newest' | 'rating' | ''>('')
  const [showFilters, setShowFilters] = useState(false)

  // Modal
  const [watchItem, setWatchItem] = useState<VodItem | null>(null)
  const [autoPlay, setAutoPlay] = useState(false)

  const hasByoProviders = Boolean(user?.has_byo_providers)

  // Infinite Scroll Trigger
  const loaderRef = useRef(null)

  useEffect(() => {
    if (!hasByoProviders) {
      setLoadingProviders(false)
      return
    }
    providerAPI.list()
      .then((res) => {
        setProviders(res.data)
        if (res.data.length > 0) setSelectedProvider(res.data[0].id)
      })
      .catch(() => toast.error('Failed to load providers'))
      .finally(() => setLoadingProviders(false))
  }, [hasByoProviders])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapToVodItem = useCallback((item: Record<string, any>): VodItem => ({
    id: item.id || item.tmdb_id?.toString() || Math.random().toString(),
    stream_id: item.stream_id || '',
    raw_title: item.raw_title || item.title || item.name || 'Unknown Title',
    vod_type: (item.vod_type || (item.media_type === 'tv' ? 'series' : item.type === 'series' ? 'series' : 'movie')) as 'movie' | 'series',
    tmdb_id: item.tmdb_id || item.id,
    imdb_id: item.imdb_id,
    confidence_score: item.confidence_score,
    poster_url: item.poster_url || (item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : undefined),
    backdrop_url: item.backdrop_url || (item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : undefined),
    category: item.category,
    is_watched: item.is_watched,
    last_watched_at: item.last_watched_at,
    streamUrl: item.streamUrl,
    watch_progress: item.watch_progress_pct,
    overview: item.overview,
    rating: item.vote_average || item.rating || (item.confidence_score ? (item.confidence_score * 10) : undefined),
    year: (item.release_date || item.first_air_date || item.title_year || item.year || '').toString().slice(0, 4),
    content_languages: item.content_languages || [],
  }), [])

  // ─── Language Filtering ───────────────────────────────────────────────────
  
  const filterByLanguage = useCallback((items: VodItem[]) => {
    if (!user) return items
    
    const preferred = user.preferred_languages || []
    const excluded = user.excluded_languages || []
    
    if (preferred.length === 0 && excluded.length === 0) return items

    return items.filter(item => {
      const langs = item.content_languages || []
      
      // If we have preferred languages, the item MUST have at least one of them
      if (preferred.length > 0) {
        if (!langs.some(l => preferred.includes(l.toLowerCase()))) return false
      }
      
      // If we have excluded languages, the item MUST NOT have any of them
      if (excluded.length > 0) {
        if (langs.some(l => excluded.includes(l.toLowerCase()))) return false
      }
      
      return true
    })
  }, [user])

  const filteredSections = {
    continueWatching: filterByLanguage(sections.continueWatching),
    newToStreamio: filterByLanguage(sections.newToStreamio),
    trendingMovies: filterByLanguage(sections.trendingMovies),
    trendingSeries: filterByLanguage(sections.trendingSeries),
    movies: filterByLanguage(sections.movies),
    series: filterByLanguage(sections.series),
    topRated: filterByLanguage(sections.topRated),
    featured: filterByLanguage(sections.featured),
  }

  const filteredBrowseItems = filterByLanguage(browseItems)

  const handleOpenModal = (item: VodItem, play = false) => {
    setWatchItem(item)
    setAutoPlay(play)
  }

  const loadSections = useCallback(async () => {
    if (!selectedProvider) return
    
    try {
      const [
        historyRes,
        browseRes,
        trendingMoviesRes,
        trendingSeriesRes,
      ] = await Promise.all([
        userAPI.getWatchHistory({ limit: 20 }).catch(() => ({ data: [] })),
        vodAPI.getBrowse(selectedProvider).catch(() => ({ data: { newest: [], movies: [], series: [], rating: [] } })),
        homeAPI.getTrending('movie').catch(() => ({ data: { results: [] } })),
        homeAPI.getTrending('tv').catch(() => ({ data: { results: [] } })),
      ])

      const browseData = browseRes.data || { newest: [], movies: [], series: [], rating: [] }
      const historyData = historyRes.data || []
      const trendingMoviesData = trendingMoviesRes.data?.results || []
      const trendingSeriesData = trendingSeriesRes.data?.results || []

      // Initial featured items without rich metadata
      const initialFeatured = (browseData.newest || []).slice(0, 5).map(mapToVodItem)
      setSections(prev => ({
        ...prev,
        continueWatching: historyData.map(mapToVodItem),
        newToStreamio: (browseData.newest || []).map(mapToVodItem),
        trendingMovies: trendingMoviesData.map(mapToVodItem),
        trendingSeries: trendingSeriesData.map(mapToVodItem),
        movies: (browseData.movies || []).map(mapToVodItem),
        series: (browseData.series || []).map(mapToVodItem),
        topRated: (browseData.rating || []).map(mapToVodItem),
        featured: initialFeatured,
      }))
      
      // Fetch rich metadata sequentially with small delay
      const richFeatured: VodItem[] = []
      for (const item of initialFeatured) {
        if (item.tmdb_id && typeof item.tmdb_id === 'number') {
          try {
            const details = await vodAPI.getDetails(item.tmdb_id, item.vod_type)
            richFeatured.push({
              ...item,
              backdrop_url: details.data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${details.data.backdrop_path}` : item.backdrop_url,
              overview: details.data.overview,
              rating: details.data.vote_average,
              genres: details.data.genres?.map((g: { name: string }) => g.name),
              runtime: details.data.runtime ? `${details.data.runtime}m` : undefined,
            })
            // Update featured section progressively
            setSections(prev => ({ ...prev, featured: [...richFeatured, ...initialFeatured.slice(richFeatured.length)] }))
            await new Promise(resolve => setTimeout(resolve, 150))
          } catch { richFeatured.push(item) }
        } else {
          richFeatured.push(item)
        }
      }
    } catch (err) {
      console.error('Failed to load VOD sections', err)
    }
  }, [selectedProvider, mapToVodItem])

  const loadBrowse = useCallback(async (page: number, refresh = false) => {
    if (!selectedProvider) return
    setBrowseLoading(true)
    try {
      const params: Record<string, string | number | undefined> = {
        page,
        limit: 40,
        type: activeType || undefined,
        search: searchQuery || undefined,
        sort: activeSort || undefined,
      }
      const res = await providerAPI.getVod(selectedProvider, params)
      const data = res.data || []
      const newItems = data.map(mapToVodItem)
      setBrowseItems(prev => refresh ? newItems : [...prev, ...newItems])
      setHasMore(data.length === 40)
    } catch {
      toast.error('Failed to load items')
    } finally {
      setBrowseLoading(false)
    }
  }, [selectedProvider, activeType, searchQuery, activeSort, mapToVodItem])

  useEffect(() => {
    if (selectedProvider) {
      loadSections()
      loadBrowse(1, true)
    }
  }, [selectedProvider, loadSections, loadBrowse])

  useEffect(() => {
    if (selectedProvider) {
      loadBrowse(1, true)
    }
  }, [activeType, searchQuery, activeSort, selectedProvider, loadBrowse])

  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const target = entries[0]
    if (target.isIntersecting && hasMore && !browseLoading) {
      loadBrowse(Math.floor(browseItems.length / 40) + 1)
    }
  }, [hasMore, browseLoading, loadBrowse, browseItems.length])

  useEffect(() => {
    const observer = new IntersectionObserver(handleObserver, { threshold: 0.1 })
    const currentLoader = loaderRef.current
    if (currentLoader) observer.observe(currentLoader)
    return () => {
      if (currentLoader) observer.unobserve(currentLoader)
    }
  }, [handleObserver])

  if (loadingProviders) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#141414]">
        <Loader2 className="h-12 w-12 animate-spin text-[#1491ff]" />
      </div>
    )
  }

  if (!hasByoProviders) {
     return (
       <div className="min-h-screen bg-[#141414] flex flex-col items-center justify-center p-8 text-center space-y-6">
         <Film className="h-20 w-20 text-zinc-800" />
         <h1 className="text-4xl font-black">Ready to build your library?</h1>
         <p className="text-zinc-400 max-w-md">Connect your provider to start browsing the best movies and series in a premium cinematic interface.</p>
         <button 
           onClick={() => router.push('/providers')}
           className="px-8 py-3 bg-[#1491ff] text-white font-bold rounded hover:bg-[#0c73db] transition-all"
         >
           Add Provider
         </button>
       </div>
     )
  }

  const isInitialPopulating = sections.featured.length === 0 && browseItems.length === 0 && browseLoading

  return (
    <div className="min-h-screen bg-[#141414] text-white pb-24 overflow-x-hidden">
      {/* Hero Banner */}
      {filteredSections.featured.length > 0 ? (
        <HeroBanner 
          items={filteredSections.featured} 
          onPlay={(item) => handleOpenModal(item, true)}
          onInfo={(item) => handleOpenModal(item, false)}
        />
      ) : (
        <div className="h-[70vh] flex items-center justify-center bg-zinc-900/20 border-b border-white/5">
           <div className="flex flex-col items-center gap-4">
              {isInitialPopulating ? (
                <>
                  <Loader2 className="h-12 w-12 animate-spin text-[#1491ff]" />
                  <p className="text-zinc-500 font-bold animate-pulse">Loading cinematic library...</p>
                </>
              ) : (
                <>
                  <Film className="h-12 w-12 text-zinc-800" />
                  <p className="text-zinc-600 font-bold">Populating library...</p>
                </>
              )}
           </div>
        </div>
      )}

      {/* Floating Toolbar */}
      <div className="sticky top-0 z-40 bg-black/60 backdrop-blur-xl border-b border-white/5 px-4 md:px-12 py-4 flex flex-wrap items-center gap-4">
         <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] hidden sm:block">Source</span>
            <div className="relative group">
               <button className="flex items-center gap-2 px-4 py-2 bg-zinc-800/80 rounded-md border border-white/10 text-sm font-bold hover:bg-zinc-700 transition-colors">
                  {providers.find(p => p.id === selectedProvider)?.name || 'Select Provider'}
                  <ChevronDown className="h-4 w-4 text-zinc-500" />
               </button>
               <div className="absolute top-full left-0 mt-2 w-64 bg-zinc-900 border border-white/10 rounded-lg shadow-[0_20px_50px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden backdrop-blur-xl">
                  {providers.map(p => (
                    <button 
                      key={p.id}
                      onClick={() => setSelectedProvider(p.id)}
                      className={`w-full text-left px-4 py-3 text-sm hover:bg-[#1491ff] transition-colors ${selectedProvider === p.id ? 'bg-[#1491ff] text-white font-bold' : ''}`}
                    >
                      {p.name}
                    </button>
                  ))}
               </div>
            </div>
         </div>

         <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Search library..."
              className="w-full bg-zinc-800/50 border border-white/10 rounded-full py-2.5 pl-12 pr-10 text-sm focus:outline-none focus:border-[#1491ff] focus:ring-1 focus:ring-[#1491ff] transition-all backdrop-blur-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            )}
         </div>

         <button 
           onClick={() => setShowFilters(!showFilters)}
           className={`p-2.5 rounded-md border transition-all ${showFilters ? 'bg-[#1491ff] border-[#1491ff] text-white' : 'bg-zinc-800/80 border-white/10 text-zinc-400 hover:text-white'}`}
         >
           <SlidersHorizontal className="h-5 w-5" />
         </button>

         <AnimatePresence>
           {showFilters && (
             <motion.div 
               initial={{ height: 0, opacity: 0 }}
               animate={{ height: 'auto', opacity: 1 }}
               exit={{ height: 0, opacity: 0 }}
               className="w-full flex flex-wrap gap-6 pt-4 overflow-hidden"
             >
                <div className="flex flex-col gap-2">
                   <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Media Type</span>
                   <div className="flex gap-2">
                      {['', 'movie', 'series'].map(type => (
                        <button
                          key={type}
                          onClick={() => setActiveType(type as '' | 'movie' | 'series')}
                          className={`px-4 py-1.5 rounded text-xs font-bold border transition-all ${activeType === type ? 'bg-white text-black border-white' : 'bg-zinc-900 text-zinc-400 border-white/10 hover:border-white/30'}`}
                        >
                          {type === '' ? 'All' : type === 'movie' ? 'Movies' : 'Series'}
                        </button>
                      ))}
                   </div>
                </div>
                <div className="flex flex-col gap-2">
                   <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Sort By</span>
                   <div className="flex gap-2">
                      {['', 'newest', 'rating'].map(sort => (
                        <button
                          key={sort}
                          onClick={() => setActiveSort(sort as '' | 'newest' | 'rating')}
                          className={`px-4 py-1.5 rounded text-xs font-bold border transition-all ${activeSort === sort ? 'bg-white text-black border-white' : 'bg-zinc-900 text-zinc-400 border-white/10 hover:border-white/30'}`}
                        >
                          {sort === '' ? 'Default' : sort === 'newest' ? 'Newest' : 'Top Rated'}
                        </button>
                      ))}
                   </div>
                </div>
             </motion.div>
           )}
         </AnimatePresence>
      </div>

      {/* Content Rows */}
      {!searchQuery && !activeType && !activeSort ? (
        <div className="mt-8 space-y-16">
          {filteredSections.continueWatching.length > 0 && (
            <ContentRow 
              title="Continue Watching" 
              items={filteredSections.continueWatching} 
              onPlay={(item) => handleOpenModal(item, true)}
              onInfo={(item) => handleOpenModal(item, false)}
            />
          )}
          <ContentRow 
            title="New to Streamio" 
            items={filteredSections.newToStreamio} 
            onPlay={(item) => handleOpenModal(item, true)}
            onInfo={(item) => handleOpenModal(item, false)}
          />
          <ContentRow 
            title="Trending Movies" 
            items={filteredSections.trendingMovies} 
            onPlay={(item) => handleOpenModal(item, true)}
            onInfo={(item) => handleOpenModal(item, false)}
          />
          <ContentRow 
            title="Trending Series" 
            items={filteredSections.trendingSeries} 
            onPlay={(item) => handleOpenModal(item, true)}
            onInfo={(item) => handleOpenModal(item, false)}
          />
          <ContentRow 
            title="Top Rated" 
            items={filteredSections.topRated} 
            onPlay={(item) => handleOpenModal(item, true)}
            onInfo={(item) => handleOpenModal(item, false)}
          />
          <ContentRow 
            title="Movies" 
            items={filteredSections.movies} 
            onPlay={(item) => handleOpenModal(item, true)}
            onInfo={(item) => handleOpenModal(item, false)}
            onSeeAll={() => setActiveType('movie')}
          />
          <ContentRow 
            title="Series" 
            items={filteredSections.series} 
            onPlay={(item) => handleOpenModal(item, true)}
            onInfo={(item) => handleOpenModal(item, false)}
            onSeeAll={() => setActiveType('series')}
          />
        </div>
      ) : (
        /* Browse Grid (Active Filter/Search) */
        <div className="mt-12 px-4 md:px-12">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-black tracking-tight">
              {searchQuery ? `Results for "${searchQuery}"` : activeType === 'movie' ? 'Movies' : activeType === 'series' ? 'Series' : 'All Titles'}
            </h2>
            <span className="text-zinc-500 text-sm font-bold">{filteredBrowseItems.length} items</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-x-4 gap-y-12">
             {filteredBrowseItems.map((item) => (
                <div key={item.id} className="flex justify-center">
                  <NetflixCard 
                    item={item} 
                    onPlay={(item) => handleOpenModal(item, true)}
                    onInfo={(item) => handleOpenModal(item, false)}
                  />
                </div>
             ))}
          </div>
          {browseLoading && (
            <div className="flex justify-center mt-20">
              <Loader2 className="h-10 w-10 animate-spin text-[#1491ff]" />
            </div>
          )}
          <div ref={loaderRef} className="h-40" />
        </div>
      )}

      {/* Watch Modal */}
      <WatchModal 
        isOpen={!!watchItem}
        onClose={() => setWatchItem(null)}
        src={watchItem?.streamUrl || null}
        title={watchItem?.raw_title || ''}
        vodType={watchItem?.vod_type}
        providerId={selectedProvider}
        streamId={watchItem?.stream_id}
        tmdbId={watchItem?.tmdb_id}
        imdbId={watchItem?.imdb_id}
        autoPlay={autoPlay}
      />
    </div>
  )
}
