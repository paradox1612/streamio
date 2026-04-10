'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Heart, Search, Sparkles } from 'lucide-react'
import EmptyState from '@/components/EmptyState'
import SkeletonCard from '@/components/SkeletonCard'
import WatchModal from '@/components/video/WatchModal'
import { homeAPI, providerAPI } from '@/utils/api'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/auth'

function normalizeCategoryName(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : 'Live TV'
}

const PAGE_SIZE = 60

interface Channel {
  id?: string
  stream_id?: string
  name?: string
  raw_title?: string
  logo?: string
  poster_url?: string
  category?: string
  streamUrl?: string | null
}

interface Provider {
  id: string
  name: string
}

interface FavoriteItem {
  id: string
  item_id: string
  item_name: string
  poster_url?: string | null
  provider_id?: string | null
  metadata?: {
    category?: string
    streamId?: string
  }
}

function toFavoriteKey(providerId: string, value: string) {
  return `${providerId}:${value}`
}

export default function LiveTVPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingChannels, setLoadingChannels] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [favoriteChannels, setFavoriteChannels] = useState<FavoriteItem[]>([])
  const [favoriteCategories, setFavoriteCategories] = useState<FavoriteItem[]>([])
  const [savingFavoriteKey, setSavingFavoriteKey] = useState<string | null>(null)
  const [watchChannel, setWatchChannel] = useState<{ url: string; title: string; streamId?: string } | null>(null)

  const refreshFavorites = useCallback(async () => {
    try {
      const [channelRes, categoryRes] = await Promise.all([
        homeAPI.getFavorites('channel'),
        homeAPI.getFavorites('category'),
      ])
      setFavoriteChannels(Array.isArray(channelRes.data?.favorites) ? channelRes.data.favorites : [])
      setFavoriteCategories(Array.isArray(categoryRes.data?.favorites) ? categoryRes.data.favorites : [])
    } catch {
      toast.error('Failed to load favorites')
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timeoutId)
  }, [searchQuery])

  useEffect(() => {
    Promise.all([providerAPI.list(), refreshFavorites()])
      .then(([providerRes]) => {
        setProviders(providerRes.data)
        if (providerRes.data.length > 0) setSelectedProvider(providerRes.data[0].id)
      })
      .catch(() => toast.error('Failed to load providers'))
      .finally(() => setLoading(false))
  }, [refreshFavorites])

  useEffect(() => {
    setChannels([])
    setPage(1)
  }, [selectedCategory, debouncedSearch, selectedProvider])

  const loadChannels = useCallback(async () => {
    if (!selectedProvider) return
    setLoadingChannels(true)
    try {
      const params: Record<string, unknown> = { page, limit: PAGE_SIZE }
      if (debouncedSearch) params.search = debouncedSearch
      if (selectedCategory !== 'all') params.category = selectedCategory

      const res = await providerAPI.getLive(selectedProvider, params)
      const payload = res.data || {}
      const channelList: Channel[] = Array.isArray(payload.items) ? payload.items : []
      const normalizedChannels = channelList.map((channel) => ({
        ...channel,
        category: normalizeCategoryName(channel.category),
      }))
      const normalizedCategories: string[] = Array.isArray(payload.categories)
        ? payload.categories.map(normalizeCategoryName)
        : []

      setChannels((prev) => (page === 1 ? normalizedChannels : [...prev, ...normalizedChannels]))
      setCategories(['all', ...Array.from(new Set(normalizedCategories)).sort((a, b) => a.localeCompare(b))])
      setHasMore(Boolean(payload.hasMore))
    } catch {
      toast.error('Failed to load live channels')
    } finally {
      setLoadingChannels(false)
    }
  }, [selectedProvider, page, debouncedSearch, selectedCategory])

  useEffect(() => {
    loadChannels()
  }, [loadChannels])

  const scopedFavoriteChannels = useMemo(
    () => favoriteChannels.filter((item) => item.provider_id === selectedProvider),
    [favoriteChannels, selectedProvider]
  )

  const scopedFavoriteCategories = useMemo(
    () => favoriteCategories
      .filter((item) => item.provider_id === selectedProvider)
      .map((item) => item.metadata?.category || item.item_name),
    [favoriteCategories, selectedProvider]
  )

  const favoriteChannelMap = useMemo(() => {
    const map = new Map<string, FavoriteItem>()
    for (const item of scopedFavoriteChannels) {
      const key = item.metadata?.streamId || item.item_name
      map.set(key, item)
    }
    return map
  }, [scopedFavoriteChannels])

  const favoriteCategoryMap = useMemo(() => {
    const map = new Map<string, FavoriteItem>()
    for (const item of favoriteCategories) {
      if (item.provider_id !== selectedProvider) continue
      const key = item.metadata?.category || item.item_name
      map.set(key, item)
    }
    return map
  }, [favoriteCategories, selectedProvider])

  const toggleChannelFavorite = async (channel: Channel) => {
    if (!selectedProvider) return
    const streamId = channel.stream_id || channel.id
    const channelName = channel.name || channel.raw_title
    if (!streamId || !channelName) return

    const existing = favoriteChannelMap.get(streamId) || favoriteChannelMap.get(channelName)
    const favoriteKey = toFavoriteKey(selectedProvider, streamId)
    setSavingFavoriteKey(favoriteKey)
    try {
      if (existing) {
        await homeAPI.removeFavorite(existing.id)
      } else {
        await homeAPI.addFavorite({
          itemType: 'channel',
          itemId: favoriteKey,
          itemName: channelName,
          posterUrl: channel.logo || channel.poster_url,
          providerId: selectedProvider,
          metadata: {
            streamId,
            category: channel.category,
          },
        })
      }
      await refreshFavorites()
    } catch {
      toast.error('Unable to update favorites')
    } finally {
      setSavingFavoriteKey(null)
    }
  }

  const toggleCategoryFavorite = async (category: string) => {
    if (!selectedProvider || category === 'all') return
    const existing = favoriteCategoryMap.get(category)
    const favoriteKey = toFavoriteKey(selectedProvider, category)
    setSavingFavoriteKey(favoriteKey)
    try {
      if (existing) {
        await homeAPI.removeFavorite(existing.id)
      } else {
        await homeAPI.addFavorite({
          itemType: 'category',
          itemId: favoriteKey,
          itemName: category,
          providerId: selectedProvider,
          metadata: { category },
        })
      }
      await refreshFavorites()
    } catch {
      toast.error('Unable to update favorites')
    } finally {
      setSavingFavoriteKey(null)
    }
  }

  const showInitialLoading = loadingChannels && page === 1 && channels.length === 0
  const showLoadingMore = loadingChannels && page > 1

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="panel p-8">
          <h1 className="hero-title">Loading Live TV...</h1>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
          <SkeletonCard count={12} type="vod" />
        </div>
      </div>
    )
  }

  if (!(user as typeof user & { can_use_live_tv?: boolean })?.can_use_live_tv) {
    return (
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="panel p-8">
          <div className="kicker mb-5">Live TV</div>
          <h1 className="hero-title">Live TV unlocks only after you add a BYO provider.</h1>
          <p className="hero-copy mt-4">
            Free access never exposes live channels. Add your own IPTV source to browse and launch live streams here.
          </p>
        </section>
        <EmptyState
          icon={Sparkles}
          heading="BYO required for Live TV"
          description="Managed free access is limited to hidden movie and series fallback."
          action={() => router.push('/providers')}
          actionLabel="Add BYO Provider"
        />
      </div>
    )
  }

  if (providers.length === 0) {
    return (
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="panel p-8">
          <div className="kicker mb-5">Live TV</div>
          <h1 className="hero-title">Browse your live channel lineup.</h1>
          <p className="hero-copy mt-4">Live channels appear here as soon as you connect at least one provider.</p>
        </section>
        <EmptyState
          icon={Sparkles}
          heading="No providers available"
          description="Add at least one IPTV provider before browsing live channels."
          action={() => router.push('/providers')}
          actionLabel="Add Provider"
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="panel overflow-hidden p-4 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div>
            <div className="kicker mb-2 sm:mb-4">Live TV</div>
            <h1 className="text-2xl font-bold leading-tight text-white sm:text-4xl">
              Launch live streams fast and save your favorites.
            </h1>
            <p className="hero-copy mt-3 hidden sm:block">
              Favorites are saved per provider, so you can pin channels and categories without losing the broader lineup.
            </p>
          </div>
          <div className="panel-soft p-3 sm:p-5 flex lg:block justify-between items-center">
            <div>
              <p className="metric-label mb-0 sm:mb-1 text-[10px] sm:text-xs">Visible Channels</p>
              <p className="text-2xl sm:text-3xl font-bold text-white">{channels.length}</p>
            </div>
            <div className="hidden sm:block">
              <p className="mt-2 text-sm text-slate-300/[0.68]">
                {hasMore
                  ? 'Showing the current page set. Load more to continue browsing.'
                  : 'All currently matching channels are loaded.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-300/60">
                <span>{scopedFavoriteChannels.length} favorite channels</span>
                <span>{scopedFavoriteCategories.length} saved categories</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="panel-soft p-5 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <div>
            <label className="field-label">Provider</label>
            <select
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value)
                setChannels([])
                setCategories([])
                setSelectedCategory('all')
                setSearchQuery('')
                setDebouncedSearch('')
                setPage(1)
                setHasMore(false)
              }}
              className="field-select"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <label className="field-label">Search Channels</label>
            <Search className="pointer-events-none absolute left-4 top-[3.1rem] h-5 w-5 text-slate-400/50" />
            <input
              type="text"
              placeholder="Search channels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="field-input pl-12"
            />
          </div>
        </div>

        {scopedFavoriteCategories.length > 0 && (
          <div className="mt-5">
            <p className="field-label">Saved Categories</p>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {scopedFavoriteCategories.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    selectedCategory === category
                      ? 'bg-brand-500 text-white'
                      : 'border border-brand-400/20 bg-brand-500/10 text-brand-100 hover:bg-brand-500/15'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        )}

        {categories.length > 1 && (
          <div className="mt-5">
            <p className="field-label">Categories</p>
            <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-2">
              {categories.map((cat) => {
                const isFavorite = favoriteCategoryMap.has(cat)
                return (
                  <div
                    key={cat}
                    className={`flex items-center overflow-hidden rounded-full ${
                      selectedCategory === cat
                        ? 'bg-brand-500 text-white shadow-lg'
                        : 'border border-white/10 bg-white/[0.04] text-slate-200/[0.76] transition hover:border-white/20'
                    }`}
                  >
                    <button
                      onClick={() => setSelectedCategory(cat)}
                      className="whitespace-nowrap px-4 py-2 text-xs font-semibold uppercase tracking-wider"
                    >
                      {cat}
                    </button>
                    {cat !== 'all' && (
                      <button
                        onClick={() => toggleCategoryFavorite(cat)}
                        disabled={savingFavoriteKey === toFavoriteKey(selectedProvider, cat)}
                        className={`border-l px-3 py-2 transition ${
                          selectedCategory === cat
                            ? 'border-white/20 bg-black/10'
                            : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.08]'
                        }`}
                        aria-label={isFavorite ? `Remove ${cat} from favorites` : `Add ${cat} to favorites`}
                      >
                        <Heart className={`h-3.5 w-3.5 ${isFavorite ? 'fill-current text-rose-300' : 'text-slate-300/70'}`} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {scopedFavoriteChannels.length > 0 && (
        <section className="space-y-4">
          <div>
            <p className="eyebrow mb-2">Pinned</p>
            <h2 className="section-title">Favorite Channels</h2>
          </div>
          <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-2">
            {scopedFavoriteChannels.map((favorite) => (
              <div
                key={favorite.id}
                className="w-[11rem] flex-none overflow-hidden rounded-[24px] border border-brand-400/20 bg-brand-500/10"
              >
                <div className="relative aspect-square overflow-hidden bg-surface-900/80">
                  {favorite.poster_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={favorite.poster_url}
                      alt={favorite.item_name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-4xl">📺</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                </div>
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-semibold text-white">{favorite.item_name}</p>
                  <p className="mt-1 text-xs text-slate-300/65">{favorite.metadata?.category || 'Channel'}</p>
                  <button
                    onClick={() => homeAPI.removeFavorite(favorite.id).then(refreshFavorites).catch(() => toast.error('Unable to update favorites'))}
                    className="mt-3 inline-flex rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold text-white"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {showInitialLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
          <SkeletonCard count={12} type="vod" />
        </div>
      ) : channels.length > 0 ? (
        <div className="space-y-6">
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            {channels.map((channel) => {
              const channelName = channel.name || channel.raw_title || 'Channel'
              const streamId = channel.stream_id || channel.id || channelName
              const isFavorite = favoriteChannelMap.has(streamId) || favoriteChannelMap.has(channelName)
              const favoriteKey = toFavoriteKey(selectedProvider, streamId)

              return (
                <div
                  key={channel.id || channel.stream_id}
                  className="group overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.04] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.16]"
                >
                  <div className="relative aspect-square overflow-hidden bg-surface-900/80">
                    {channel.logo || channel.poster_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={channel.logo || channel.poster_url}
                        alt={channelName}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-4xl">📺</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                    <button
                      onClick={() => toggleChannelFavorite(channel)}
                      disabled={savingFavoriteKey === favoriteKey}
                      className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/60"
                      aria-label={isFavorite ? `Remove ${channelName} from favorites` : `Add ${channelName} to favorites`}
                    >
                      <Heart className={`h-4 w-4 ${isFavorite ? 'fill-current text-rose-300' : 'text-white'}`} />
                    </button>
                  </div>
                  <div className="p-3">
                    <h3 className="line-clamp-2 text-sm font-semibold text-white">{channelName}</h3>
                    {channel.category && <p className="mt-1 text-xs text-slate-300/55">{channel.category}</p>}
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => {
                          if (channel.streamUrl) {
                            setWatchChannel({ 
                              url: channel.streamUrl, 
                              title: channelName,
                              streamId: channel.stream_id || channel.id
                            })
                          } else {
                            toast.error('Stream URL not available')
                          }
                        }}
                        className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-slate-100 transition hover:bg-white/10"
                      >
                        Watch Now
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </section>

          {hasMore && (
            <div className="text-center">
              <button
                disabled={showLoadingMore}
                onClick={() => setPage((prev) => prev + 1)}
                className="btn-secondary"
              >
                {showLoadingMore ? 'Loading…' : 'Load More Channels'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={Sparkles}
          heading="No channels found"
          description="Try adjusting the selected category or search term."
        />
      )}

      <WatchModal
        isOpen={Boolean(watchChannel)}
        onClose={() => setWatchChannel(null)}
        src={watchChannel?.url || null}
        title={watchChannel?.title || ''}
        vodType="live"
        providerId={selectedProvider}
        streamId={watchChannel?.streamId}
      />
    </div>
  )
}
