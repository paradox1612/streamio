'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { providerAPI } from '@/utils/api'
import { Search, X, ChevronLeft, ChevronRight, Film, Sparkles, Play, List } from 'lucide-react'
import EmptyState from '@/components/EmptyState'
import WatchModal from '@/components/video/WatchModal'
import { useAuthStore } from '@/store/auth'
import toast from 'react-hot-toast'

// ── Animation variants ────────────────────────────────────────────────────────
const containerAnim = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
}
const itemAnim = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: [0.0, 0.0, 0.58, 1.0] as [number, number, number, number] } },
}

function formatLastWatched(value: string | null | undefined) {
  if (!value) return ''
  const then = new Date(value)
  if (Number.isNaN(then.getTime())) return 'Recently watched'
  const diffMs = Date.now() - then.getTime()
  const diffMinutes = Math.max(Math.floor(diffMs / (1000 * 60)), 0)
  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return then.toLocaleDateString()
}

interface VodItem {
  id: string
  stream_id: string
  raw_title: string
  vod_type: string
  tmdb_id?: number
  imdb_id?: string
  confidence_score?: number
  poster_url?: string
  category?: string
  is_watched?: boolean
  last_watched_at?: string
  streamUrl?: string | null
}

interface TmdbResult {
  tmdbId: number
  title: string
  year?: string
  type: string
  poster?: string
}

interface Provider {
  id: string
  name: string
}

// ── FixMatch Modal ────────────────────────────────────────────────────────────
function FixMatchModal({
  item,
  providerId,
  allItems,
  currentIndex,
  onClose,
  onSuccess,
  onNavigate,
}: {
  item: VodItem
  providerId: string
  allItems: VodItem[]
  currentIndex: number
  onClose: () => void
  onSuccess: () => void
  onNavigate: (dir: 'prev' | 'next') => void
}) {
  const [query, setQuery] = useState(item.raw_title)
  const [results, setResults] = useState<TmdbResult[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const search = useCallback(
    async (q: string) => {
      if (!q.trim()) return
      setSearching(true)
      try {
        const res = await providerAPI.tmdbSearch(
          providerId,
          q,
          item.vod_type === 'series' ? 'series' : 'movie'
        )
        setResults(res.data.results || [])
      } catch {
        toast.error('Search failed')
      } finally {
        setSearching(false)
      }
    },
    [providerId, item.vod_type]
  )

  useEffect(() => { search(query) }, []) // eslint-disable-line
  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowLeft') onNavigate('prev')
      if (e.key === 'ArrowRight') onNavigate('next')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onNavigate])

  const handleSelect = async (result: TmdbResult) => {
    setSaving(result.tmdbId)
    try {
      await providerAPI.manualMatch(providerId, {
        rawTitle: item.raw_title,
        tmdbId: result.tmdbId,
        tmdbType: result.type,
      })
      toast.success(`Matched to "${result.title}"`)
      onSuccess()
      onClose()
    } catch {
      toast.error('Failed to save match')
    } finally {
      setSaving(null)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="relative w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/[0.1] bg-surface-900/95 shadow-[0_40px_100px_rgba(0,0,0,0.55)]"
          initial={{ scale: 0.92, opacity: 0, y: 40 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 40 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] px-6 py-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-slate-400/70">
                {currentIndex + 1} / {allItems.length}
              </span>
              <span className="hidden text-xs text-slate-400/45 sm:block">← → navigate · Esc close</span>
            </div>
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.05] text-slate-300 transition hover:bg-white/[0.1] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {allItems.length > 1 && (
            <>
              <button
                onClick={() => onNavigate('prev')}
                className="absolute left-4 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/[0.1] bg-surface-950/80 text-white transition hover:bg-white/[0.12]"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => onNavigate('next')}
                className="absolute right-4 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/[0.1] bg-surface-950/80 text-white transition hover:bg-white/[0.12]"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          <div className="grid gap-6 p-6 sm:grid-cols-[160px_1fr] sm:p-8">
            <div className="mx-auto w-40 sm:mx-0 sm:w-auto">
              {item.poster_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.poster_url}
                  alt={item.raw_title}
                  className="w-full rounded-[18px] object-cover"
                  style={{ aspectRatio: '2/3' }}
                  loading="lazy"
                />
              ) : (
                <div
                  className="flex w-full items-center justify-center rounded-[18px] bg-surface-800/60"
                  style={{ aspectRatio: '2/3' }}
                >
                  <Film className="h-10 w-10 text-slate-400/40" />
                </div>
              )}
            </div>

            <div className="min-w-0">
              <p className="eyebrow mb-1">Manual Match</p>
              <h2 className="section-title line-clamp-2 text-lg">{item.raw_title}</h2>

              <div className="mt-4 flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400/55" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && search(query)}
                    placeholder="Search TMDB…"
                    className="field-input py-2.5 pl-9 pr-4 text-sm"
                  />
                </div>
                <button
                  onClick={() => search(query)}
                  disabled={searching}
                  className="btn-primary whitespace-nowrap !rounded-2xl !px-4 !py-2.5 text-sm"
                >
                  {searching ? 'Searching…' : 'Search'}
                </button>
              </div>

              <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                {searching && (
                  <div className="py-6 text-center text-sm text-slate-300/55">Searching TMDB…</div>
                )}
                {!searching && results.length === 0 && (
                  <div className="py-6 text-center text-sm text-slate-300/55">No results. Try a different query.</div>
                )}
                <AnimatePresence mode="popLayout">
                  {results.map((result) => (
                    <motion.button
                      layout
                      key={result.tmdbId}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.22 }}
                      onClick={() => handleSelect(result)}
                      disabled={saving !== null}
                      className="flex w-full items-center gap-3 rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-3 text-left transition-all hover:border-white/[0.14] hover:bg-white/[0.06]"
                    >
                      {result.poster ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={result.poster}
                          alt={result.title}
                          className="h-16 w-11 flex-shrink-0 rounded-xl object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-16 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-surface-800/80">
                          <Film className="h-4 w-4 text-slate-400/40" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{result.title}</p>
                        <p className="mt-0.5 text-xs text-slate-300/50">{result.year || 'Unknown year'} · {result.type}</p>
                      </div>
                      <span className="flex-shrink-0 text-sm font-semibold text-brand-300">
                        {saving === result.tmdbId ? 'Saving…' : 'Select →'}
                      </span>
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── VodCard ───────────────────────────────────────────────────────────────────
function VodCard({
  item,
  onOpenModal,
  onWatch,
  animVariants,
  allowManualMatch = true,
}: {
  item: VodItem
  onOpenModal: (item: VodItem) => void
  onWatch: (item: VodItem) => void
  animVariants: typeof itemAnim
  allowManualMatch?: boolean
}) {
  const matched = item.tmdb_id != null
  const score = item.confidence_score ? Math.round(item.confidence_score * 100) : null
  const watchedLabel = formatLastWatched(item.last_watched_at)

  return (
    <motion.div
      layout
      variants={animVariants}
      className={`group relative cursor-pointer overflow-hidden rounded-[20px] border bg-surface-800/60 sm:rounded-[22px] ${
        item.is_watched
          ? 'border-emerald-300/35 shadow-[0_0_0_1px_rgba(110,231,183,0.15)]'
          : 'border-white/[0.08]'
      }`}
      style={{ aspectRatio: '2/3' }}
      whileHover={{ scale: 1.03, y: -6, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
      whileTap={{ scale: 0.98 }}
      onClick={() => { if (allowManualMatch) onOpenModal(item) }}
    >
      {item.poster_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.poster_url}
          alt={item.raw_title}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
          loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400/40">
          <Film className="h-10 w-10" />
          <span className="line-clamp-3 px-3 text-center text-xs">{item.raw_title}</span>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

      <div className="absolute left-2.5 top-2.5 rounded-full border border-white/10 bg-black/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-100 backdrop-blur-sm">
        {item.vod_type}
      </div>

      {item.is_watched && (
        <div className="absolute left-2.5 top-9 rounded-full border border-emerald-200/25 bg-emerald-400/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-50 backdrop-blur-sm">
          Watched
        </div>
      )}

      <div
        className={`absolute right-2.5 top-2.5 rounded-full px-2 py-0.5 text-[9px] font-bold backdrop-blur-sm ${
          matched ? 'bg-emerald-500/80 text-white' : 'border border-white/10 bg-black/50 text-slate-300'
        }`}
      >
        {matched ? `${score ?? '—'}%` : 'Unmatched'}
      </div>

      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/50 to-black/10 opacity-0 transition-all duration-300 group-hover:opacity-100">
        <div className="p-3">
          {item.vod_type === 'movie' && item.streamUrl && (
            <motion.button
              onClick={(e) => {
                e.stopPropagation()
                onWatch(item)
              }}
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.92 }}
              className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white shadow-[0_0_15px_rgba(20,145,255,0.4)]"
            >
              <Play className="ml-0.5 h-4 w-4 fill-current" />
            </motion.button>
          )}

          {item.vod_type === 'series' && (
            <motion.button
              onClick={(e) => {
                e.stopPropagation()
                onWatch(item)
              }}
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.92 }}
              className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-black shadow-lg"
            >
              <List className="h-4 w-4" />
            </motion.button>
          )}
          <motion.p
            className="line-clamp-2 text-xs font-bold leading-snug text-white"
            initial={{ y: 12, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.05 }}
          >
            {item.raw_title}
          </motion.p>

          {item.category && (
            <motion.p
              className="mt-0.5 truncate text-[9px] font-medium uppercase tracking-wider text-slate-300/60"
              initial={{ y: 10, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              {item.category}
            </motion.p>
          )}

          {item.is_watched && watchedLabel && (
            <motion.p
              className="mt-1 text-[10px] font-medium text-emerald-200/90"
              initial={{ y: 10, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.12 }}
            >
              Started in Stremio {watchedLabel}
            </motion.p>
          )}

          <motion.div
            className="mt-2.5 flex items-center gap-2"
            initial={{ y: 10, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            <div
              onClick={(e) => {
                e.stopPropagation()
                if (allowManualMatch) onOpenModal(item)
              }}
              className={`flex h-8 w-8 items-center justify-center rounded-full shadow-[0_0_12px_rgba(255,255,255,0.2)] ${
                allowManualMatch ? 'bg-white' : 'bg-slate-500/40'
              }`}
            >
              <Sparkles className={`h-3.5 w-3.5 ${allowManualMatch ? 'text-black' : 'text-white/70'}`} />
            </div>
            <span className="text-[11px] font-semibold text-white">
              {!allowManualMatch ? 'Metadata View' : matched ? 'Fix Match' : 'Match Title'}
            </span>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function VodBrowserPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [items, setItems] = useState<VodItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingProviders, setLoadingProviders] = useState(true)
  const [filter, setFilter] = useState({ type: '', matched: '', page: 1 })
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [modalItem, setModalItem] = useState<VodItem | null>(null)
  const [modalIndex, setModalIndex] = useState(0)
  const [watchItem, setWatchItem] = useState<VodItem | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const hasByoProviders = Boolean((user as typeof user & { has_byo_providers?: boolean })?.has_byo_providers)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchRef.current) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!hasByoProviders) {
      setProviders([])
      setSelectedProvider('')
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

  useEffect(() => {
    setItems([])
    setFilter((f) => ({ ...f, page: 1 }))
  }, [selectedProvider, filter.type, filter.matched])

  const loadVod = useCallback(async () => {
    if (!selectedProvider) return
    setLoading(true)
    try {
      const params: Record<string, unknown> = { page: filter.page, limit: 60 }
      if (filter.type) params.type = filter.type
      if (searchQuery) params.search = searchQuery
      if (filter.matched !== '') params.matched = filter.matched
      const res = await providerAPI.getVod(selectedProvider, params)
      setItems((prev) => (filter.page === 1 ? res.data : [...prev, ...res.data]))
    } catch {
      toast.error('Failed to load catalog')
    } finally {
      setLoading(false)
    }
  }, [selectedProvider, filter, searchQuery])

  useEffect(() => { loadVod() }, [filter.page, searchQuery, selectedProvider, filter.type, filter.matched]) // eslint-disable-line

  const handleFilterChange = (key: string, value: string) => {
    setItems([])
    setFilter((f) => ({ ...f, [key]: value, page: 1 }))
  }

  const applySearch = useCallback(() => {
    const nextQuery = searchInput.trim()
    setItems([])
    setSearchQuery(nextQuery)
    setFilter((f) => ({ ...f, page: 1 }))
  }, [searchInput])

  const openModal = (item: VodItem) => {
    const idx = items.findIndex((i) => i.id === item.id)
    setModalIndex(idx >= 0 ? idx : 0)
    setModalItem(item)
  }

  const navigateModal = useCallback(
    (dir: 'prev' | 'next') => {
      const next =
        dir === 'next'
          ? (modalIndex + 1) % items.length
          : (modalIndex - 1 + items.length) % items.length
      setModalIndex(next)
      setModalItem(items[next])
    },
    [modalIndex, items]
  )

  const selectedProviderName = providers.find((p) => p.id === selectedProvider)?.name || ''

  if (loadingProviders) {
    return (
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="panel p-8"><h1 className="hero-title">Loading VOD library…</h1></div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
          {Array.from({ length: 16 }).map((_, i) => <div key={i} className="skeleton aspect-[2/3]" />)}
        </div>
      </div>
    )
  }

  if (!hasByoProviders) {
    return (
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="panel p-8">
          <div className="kicker mb-5">Browse VOD</div>
          <h1 className="hero-title">Add a provider to browse movies and series.</h1>
          <p className="hero-copy mt-4">
            Free access stays addon-only for hidden movie and series resolution. Web browsing remains BYO-only.
          </p>
        </section>
        <EmptyState
          icon={Sparkles}
          heading="No BYO catalog source connected yet"
          description="Add your own provider to browse the web catalog. Free access remains hidden addon fallback only."
          action={() => router.push('/providers')}
          actionLabel="Add BYO Provider"
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <motion.section
        className="panel overflow-hidden p-5 sm:p-7 lg:p-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
      >
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div>
            <div className="kicker mb-4">VOD Browser</div>
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
              Browse posters first, then fix metadata only when needed.
            </h1>
            <p className="hero-copy mt-3">
              Search within a provider, filter by type or match status, and jump into manual TMDB correction from the
              poster grid.
            </p>
          </div>
          <div className="panel-soft p-5">
            <p className="metric-label mb-1">Current Provider</p>
            <p className="break-words text-2xl font-bold text-white">{selectedProviderName || 'None selected'}</p>
            <p className="mt-2 text-sm text-slate-300/[0.68]">
              {items.length} visible items{searchQuery ? ` for "${searchQuery}"` : ''}.
            </p>
          </div>
        </div>
      </motion.section>

      <motion.section
        className="panel-soft p-5 sm:p-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
          <div className="relative">
            <label className="field-label">
              Search Library{' '}
              <span className="ml-1 rounded border border-white/10 bg-white/[0.04] px-1 py-0.5 text-[9px] font-bold uppercase text-slate-400/55">
                /
              </span>
            </label>
            <Search className="pointer-events-none absolute left-4 top-[3.1rem] h-5 w-5 text-slate-400/50" />
            <input
              ref={searchRef}
              placeholder={`Search in ${selectedProviderName || 'your library'}…`}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applySearch() }}
              className="field-input pl-12 pr-11"
            />
            <AnimatePresence>
              {searchInput && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => {
                    setSearchInput('')
                    setSearchQuery('')
                    setItems([])
                    setFilter((f) => ({ ...f, page: 1 }))
                  }}
                  className="absolute right-4 top-[3.05rem] text-slate-300/55 transition-colors hover:text-white"
                >
                  <X className="h-4 w-4" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div>
              <label className="field-label">Provider</label>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="field-select"
              >
                {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button type="button" onClick={applySearch} className="btn-primary w-full whitespace-nowrap sm:w-auto">
                Search Title
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {['', 'movie', 'series'].map((type) => (
            <motion.button
              key={type}
              onClick={() => handleFilterChange('type', type)}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className={`rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-wider transition-all duration-200 ${
                filter.type === type
                  ? 'bg-brand-500 text-white shadow-[0_0_16px_rgba(20,145,255,0.35)]'
                  : 'border border-white/10 bg-white/[0.04] text-slate-200/70 hover:border-white/20 hover:text-white'
              }`}
            >
              {type === '' ? 'All' : type === 'movie' ? 'Movies' : 'Series'}
            </motion.button>
          ))}
          <div className="sm:ml-auto">
            <select
              value={filter.matched}
              onChange={(e) => handleFilterChange('matched', e.target.value)}
              className="field-select min-w-[160px]"
            >
              <option value="">All matches</option>
              <option value="true">Matched</option>
              <option value="false">Unmatched</option>
            </select>
          </div>
        </div>
      </motion.section>

      {items.length === 0 && !loading ? (
        <EmptyState
          icon={<Sparkles className="h-12 w-12" />}
          heading={searchQuery ? `No results for "${searchQuery}"` : 'No titles found'}
          description={
            searchQuery
              ? 'Try the full title or adjust the filters.'
              : 'Refresh your catalog source to load titles here.'
          }
        />
      ) : (
        <>
          {loading && filter.page === 1 ? (
            <section className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
              {Array.from({ length: 16 }).map((_, i) => <div key={i} className="skeleton aspect-[2/3]" />)}
            </section>
          ) : (
            <>
              <motion.section
                layout
                variants={containerAnim}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8"
              >
                <AnimatePresence mode="popLayout">
                  {items.map((item) => (
                    <VodCard
                      key={item.id}
                      item={item}
                      animVariants={itemAnim}
                      allowManualMatch={true}
                      onOpenModal={openModal}
                      onWatch={(item) => setWatchItem(item)}
                    />
                  ))}
                </AnimatePresence>
                {loading && filter.page > 1 &&
                  Array.from({ length: 8 }).map((_, i) => (
                    <div key={`sk-${i}`} className="skeleton aspect-[2/3]" />
                  ))}
              </motion.section>

              {!loading && items.length > 0 && items.length % 60 === 0 && (
                <div className="text-center">
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setFilter((f) => ({ ...f, page: f.page + 1 }))}
                    className="btn-secondary"
                  >
                    Load More Titles
                  </motion.button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {modalItem && (
        <FixMatchModal
          item={modalItem}
          providerId={selectedProvider}
          allItems={items}
          currentIndex={modalIndex}
          onClose={() => setModalItem(null)}
          onSuccess={() => { setItems([]); setFilter((f) => ({ ...f, page: 1 })) }}
          onNavigate={navigateModal}
        />
      )}

      <WatchModal
        isOpen={Boolean(watchItem)}
        onClose={() => setWatchItem(null)}
        src={watchItem?.streamUrl || null}
        title={watchItem?.raw_title || ''}
        vodType={watchItem?.vod_type}
        providerId={selectedProvider}
        streamId={watchItem?.stream_id}
        tmdbId={watchItem?.tmdb_id}
        imdbId={watchItem?.imdb_id}
      />
    </div>
  )
}
