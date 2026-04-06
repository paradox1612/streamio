'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { providerAPI } from '@/utils/api'
import { Search, Sparkles } from 'lucide-react'
import EmptyState from '@/components/EmptyState'
import SkeletonCard from '@/components/SkeletonCard'
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
  streamUrl?: string
}

interface Provider {
  id: string
  name: string
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

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timeoutId)
  }, [searchQuery])

  useEffect(() => {
    providerAPI.list()
      .then((res) => {
        setProviders(res.data)
        if (res.data.length > 0) setSelectedProvider(res.data[0].id)
      })
      .catch(() => toast.error('Failed to load providers'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    setChannels([])
    setPage(1)
  }, [selectedCategory, debouncedSearch])

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

  useEffect(() => { loadChannels() }, [loadChannels])

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
      <section className="panel overflow-hidden p-5 sm:p-7 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div>
            <div className="kicker mb-4">Live TV</div>
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
              Find channels fast, then launch them without friction.
            </h1>
            <p className="hero-copy mt-3">
              Switch providers, page through channels, and narrow by category without pulling the full lineup up front.
            </p>
          </div>
          <div className="panel-soft p-4 sm:p-5">
            <p className="metric-label mb-1">Visible Channels</p>
            <p className="text-3xl font-bold text-white">{channels.length}</p>
            <p className="mt-2 text-sm text-slate-300/[0.68]">
              {hasMore
                ? 'Showing the current page set. Load more to continue browsing.'
                : 'All currently matching channels are loaded.'}
            </p>
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

        {categories.length > 1 && (
          <div className="-mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  selectedCategory === cat
                    ? 'bg-brand-500 text-white'
                    : 'border border-white/10 bg-white/[0.04] text-slate-200/[0.76] hover:bg-white/[0.08]'
                }`}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
        )}
      </section>

      {showInitialLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
          <SkeletonCard count={12} type="vod" />
        </div>
      ) : channels.length > 0 ? (
        <div className="space-y-6">
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            {channels.map((channel) => (
              <a
                key={channel.id || channel.stream_id}
                href={channel.streamUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="group overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.04] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.16]"
              >
                <div className="relative aspect-square overflow-hidden bg-surface-900/80">
                  {channel.logo || channel.poster_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={channel.logo || channel.poster_url}
                      alt={channel.name || channel.raw_title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-4xl">📺</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                </div>
                <div className="p-3">
                  <h3 className="line-clamp-2 text-sm font-semibold text-white">{channel.name || channel.raw_title}</h3>
                  {channel.category && <p className="mt-1 text-xs text-slate-300/55">{channel.category}</p>}
                  <div className="mt-3 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-slate-100">
                    Open Stream
                  </div>
                </div>
              </a>
            ))}
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
    </div>
  )
}
