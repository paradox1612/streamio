/**
 * VodBrowser — rebuilt on Sera UI Video Gallery patterns:
 *   • Card hover overlay with staggered slide-in info + action button
 *   • AnimatePresence + layout for filter/search transitions
 *   • Keyboard shortcuts: "/" → focus search, Esc → clear
 *   • FixMatch modal upgraded with Sera UI lightbox style (prev/next, Esc)
 *   • Staggered containerAnimation / itemAnimation for the grid
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { providerAPI } from '../utils/api';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  FilmIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import {
  Search, X, ChevronLeft, ChevronRight, Play,
} from 'lucide-react';
import EmptyState from '../components/EmptyState';
import toast from 'react-hot-toast';
import { reportableError } from '../utils/reportableToast';
import { useAuth } from '../context/AuthContext';

// ── Animation variants (Sera UI Video Gallery pattern) ───────────────────────
const containerAnim = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const itemAnim = {
  hidden:  { opacity: 0, y: 24, scale: 0.96 },
  visible: { opacity: 1, y: 0,  scale: 1,  transition: { duration: 0.45, ease: 'easeOut' } },
};

function formatLastWatched(value) {
  if (!value) return '';

  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return 'Recently watched';

  const diffMs = Date.now() - then.getTime();
  const diffMinutes = Math.max(Math.floor(diffMs / (1000 * 60)), 0);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return then.toLocaleDateString();
}

// ── FixMatch Modal (Sera UI lightbox-style) ──────────────────────────────────
function FixMatchModal({ item, providerId, allItems, currentIndex, onClose, onSuccess, onNavigate }) {
  const [query, setQuery]       = useState(item.raw_title);
  const [results, setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving]     = useState(null);
  const inputRef = useRef(null);

  const search = useCallback(async (q) => {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const res = await providerAPI.tmdbSearch(providerId, q, item.vod_type === 'series' ? 'series' : 'movie');
      setResults(res.data.results || []);
    } catch (_) {
      reportableError('Search failed');
    } finally {
      setSearching(false);
    }
  }, [providerId, item.vod_type]);

  useEffect(() => { search(query); }, []); // eslint-disable-line
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowLeft')  { onNavigate('prev'); }
      if (e.key === 'ArrowRight') { onNavigate('next'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onNavigate]);

  const handleSelect = async (result) => {
    setSaving(result.tmdbId);
    try {
      await providerAPI.manualMatch(providerId, {
        rawTitle: item.raw_title,
        tmdbId:   result.tmdbId,
        tmdbType: result.type,
      });
      toast.success(`Matched to "${result.title}"`);
      onSuccess();
      onClose();
    } catch (_) {
      reportableError('Failed to save match');
    } finally {
      setSaving(null);
    }
  };

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
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top bar */}
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

          {/* Prev / Next arrows */}
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

          {/* Body */}
          <div className="grid gap-6 p-6 sm:grid-cols-[160px_1fr] sm:p-8">
            {/* Poster */}
            <div className="mx-auto w-40 sm:mx-0 sm:w-auto">
              {item.poster_url ? (
                <img
                  src={item.poster_url}
                  alt={item.raw_title}
                  className="w-full rounded-[18px] object-cover"
                  style={{ aspectRatio: '2/3' }}
                />
              ) : (
                <div className="flex w-full items-center justify-center rounded-[18px] bg-surface-800/60" style={{ aspectRatio: '2/3' }}>
                  <FilmIcon className="h-10 w-10 text-slate-400/40" />
                </div>
              )}
            </div>

            {/* Search panel */}
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
                    className="field-input pl-9 pr-4 py-2.5 text-sm"
                  />
                </div>
                <button
                  onClick={() => search(query)}
                  disabled={searching}
                  className="btn-primary whitespace-nowrap !rounded-2xl !py-2.5 !px-4 text-sm"
                >
                  {searching ? 'Searching…' : 'Search'}
                </button>
              </div>

              <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                {searching && (
                  <div className="py-6 text-center text-sm text-slate-300/55">Searching TMDB…</div>
                )}
                {!searching && results.length === 0 && (
                  <div className="py-6 text-center text-sm text-slate-300/55">
                    No results. Try a different query.
                  </div>
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
                        <img src={result.poster} alt={result.title} className="h-16 w-11 flex-shrink-0 rounded-xl object-cover" />
                      ) : (
                        <div className="flex h-16 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-surface-800/80">
                          <FilmIcon className="h-4 w-4 text-slate-400/40" />
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
  );
}

// ── VodCard (Sera UI Video Gallery card pattern) ─────────────────────────────
function VodCard({ item, onOpenModal, animVariants }) {
  const matched  = item.tmdb_id != null;
  const score    = item.confidence_score ? Math.round(item.confidence_score * 100) : null;
  const watchedLabel = formatLastWatched(item.last_watched_at);

  return (
    <motion.div
      layout
      variants={animVariants}
      /* aspect ratio on the card itself — no outer wrapper needed */
      className={`group relative cursor-pointer overflow-hidden rounded-[20px] border bg-surface-800/60 sm:rounded-[22px] ${
        item.is_watched ? 'border-emerald-300/35 shadow-[0_0_0_1px_rgba(110,231,183,0.15)]' : 'border-white/[0.08]'
      }`}
      style={{ aspectRatio: '2/3' }}
      whileHover={{ scale: 1.03, y: -6, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onOpenModal(item)}
    >
      {/* Poster image */}
      {item.poster_url ? (
        <img
          src={item.poster_url}
          alt={item.raw_title}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
          loading="lazy"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400/40">
          <FilmIcon className="h-10 w-10" />
          <span className="line-clamp-3 px-3 text-center text-xs">{item.raw_title}</span>
        </div>
      )}

      {/* Static gradient (always visible at bottom) */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

      {/* Type tag top-left */}
      <div className="absolute left-2.5 top-2.5 rounded-full border border-white/10 bg-black/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-100 backdrop-blur-sm">
        {item.vod_type}
      </div>

      {item.is_watched && (
        <div className="absolute left-2.5 top-9 rounded-full border border-emerald-200/25 bg-emerald-400/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-50 backdrop-blur-sm">
          Watched
        </div>
      )}

      {/* Match badge top-right */}
      <div className={`absolute right-2.5 top-2.5 rounded-full px-2 py-0.5 text-[9px] font-bold backdrop-blur-sm ${
        matched ? 'bg-emerald-500/80 text-white' : 'border border-white/10 bg-black/50 text-slate-300'
      }`}>
        {matched ? `${score ?? '—'}%` : 'Unmatched'}
      </div>

      {/* Hover overlay (Sera UI Video Gallery pattern) */}
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/50 to-black/10 opacity-0 transition-all duration-300 group-hover:opacity-100">
        <div className="p-3">
          {/* Title – slides in */}
          <motion.p
            className="line-clamp-2 text-xs font-bold leading-snug text-white"
            initial={{ y: 12, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.05 }}
          >
            {item.raw_title}
          </motion.p>

          {/* Category */}
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

          {/* Action button (Sera UI play-button pattern) */}
          <motion.div
            className="mt-2.5 flex items-center gap-2"
            initial={{ y: 10, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            <div
              onClick={(e) => { e.stopPropagation(); onOpenModal(item); }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.2)]"
            >
              <SparklesIcon className="h-3.5 w-3.5 text-black" />
            </div>
            <span className="text-[11px] font-semibold text-white">
              {matched ? 'Fix Match' : 'Match Title'}
            </span>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function VodBrowser() {
  const { user } = useAuth();
  const [providers, setProviders]           = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [items, setItems]                   = useState([]);
  const [loading, setLoading]               = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [filter, setFilter]                 = useState({ type: '', matched: '', page: 1 });
  const [searchInput, setSearchInput]       = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [modalItem, setModalItem]           = useState(null);
  const [modalIndex, setModalIndex]         = useState(0);

  const debounceRef = useRef(null);
  const searchRef   = useRef(null);

  // "/" shortcut → focus search
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setItems([]);
      setFilter((f) => ({ ...f, page: 1 }));
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  // Load providers
  useEffect(() => {
    providerAPI.list()
      .then((res) => {
        setProviders(res.data);
        if (res.data.length > 0) setSelectedProvider(res.data[0].id);
      })
      .catch(() => reportableError('Failed to load providers'))
      .finally(() => setLoadingProviders(false));
  }, []);

  // Reset on provider/filter change
  useEffect(() => {
    setItems([]);
    setFilter((f) => ({ ...f, page: 1 }));
  }, [selectedProvider, filter.type, filter.matched]);

  // Load VOD catalog
  const loadVod = useCallback(async () => {
    if (!selectedProvider) return;
    setLoading(true);
    try {
      const params = { page: filter.page, limit: 60 };
      if (filter.type)         params.type    = filter.type;
      if (debouncedSearch)     params.search  = debouncedSearch;
      if (filter.matched !== '') params.matched = filter.matched;
      const res = await providerAPI.getVod(selectedProvider, params);
      setItems((prev) => filter.page === 1 ? res.data : [...prev, ...res.data]);
    } catch (_) {
      reportableError('Failed to load catalog');
    } finally {
      setLoading(false);
    }
  }, [selectedProvider, filter, debouncedSearch]);

  useEffect(() => { loadVod(); }, [filter.page, debouncedSearch, selectedProvider, filter.type, filter.matched]); // eslint-disable-line

  const handleFilterChange = (key, value) => {
    setItems([]);
    setFilter((f) => ({ ...f, [key]: value, page: 1 }));
  };

  // Modal navigation
  const openModal = (item) => {
    const idx = items.findIndex((i) => i.id === item.id);
    setModalIndex(idx >= 0 ? idx : 0);
    setModalItem(item);
  };

  const navigateModal = useCallback((dir) => {
    const next = dir === 'next'
      ? (modalIndex + 1) % items.length
      : (modalIndex - 1 + items.length) % items.length;
    setModalIndex(next);
    setModalItem(items[next]);
  }, [modalIndex, items]);

  const selectedProviderName = providers.find((p) => p.id === selectedProvider)?.name || '';

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loadingProviders) {
    return (
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="panel p-8"><h1 className="hero-title">Loading VOD library…</h1></div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
          {Array.from({ length: 16 }).map((_, i) => <div key={i} className="skeleton aspect-[2/3]" />)}
        </div>
      </div>
    );
  }

  if (!user?.has_byo_providers) {
    return (
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="panel p-8">
          <div className="kicker mb-5">Browse VOD</div>
          <h1 className="hero-title">Web catalog browsing unlocks only after you add a BYO provider.</h1>
          <p className="hero-copy mt-4">Managed free access stays hidden and fallback-only. Connect your own source to browse movies and series here.</p>
        </section>
        <EmptyState
          icon={SparklesIcon}
          heading="BYO required for web browsing"
          description="Free access can still help inside addon fallback, but it is not exposed in the dashboard catalog."
          action={() => window.location.href = '/providers'}
          actionLabel="Add BYO Provider"
        />
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-7xl space-y-8">

      {/* Header panel */}
      <motion.section
        className="panel overflow-hidden p-5 sm:p-7 lg:p-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div>
            <div className="kicker mb-4">VOD Browser</div>
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
              Browse posters first, then fix metadata only when needed.
            </h1>
            <p className="hero-copy mt-3">
              Search within a provider, filter by type or match status, and jump into manual TMDB correction from the poster grid.
            </p>
          </div>
          <div className="panel-soft p-5">
            <p className="metric-label mb-1">Current Provider</p>
            <p className="break-words text-2xl font-bold text-white">{selectedProviderName || 'None selected'}</p>
            <p className="mt-2 text-sm text-slate-300/[0.68]">
              {items.length} visible items{debouncedSearch ? ` for "${debouncedSearch}"` : ''}.
            </p>
          </div>
        </div>
      </motion.section>

      {/* Filter + search bar */}
      <motion.section
        className="panel-soft p-5 sm:p-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
          <div className="relative">
            <label className="field-label">Search Library <span className="ml-1 rounded border border-white/10 bg-white/[0.04] px-1 py-0.5 text-[9px] font-bold uppercase text-slate-400/55">/</span></label>
            <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-[3.1rem] h-5 w-5 text-slate-400/50" />
            <input
              ref={searchRef}
              placeholder={`Search in ${selectedProviderName || 'your library'}…`}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="field-input pl-12 pr-11"
            />
            <AnimatePresence>
              {searchInput && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => { setSearchInput(''); setDebouncedSearch(''); }}
                  className="absolute right-4 top-[3.05rem] text-slate-300/55 transition-colors hover:text-white"
                >
                  <XMarkIcon className="h-4 w-4" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <div>
            <label className="field-label">Provider</label>
            <select value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value)} className="field-select">
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {/* Type filter – Sera UI category buttons */}
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
            <select value={filter.matched} onChange={(e) => handleFilterChange('matched', e.target.value)} className="field-select min-w-[160px]">
              <option value="">All matches</option>
              <option value="true">Matched</option>
              <option value="false">Unmatched</option>
            </select>
          </div>
        </div>
      </motion.section>

      {/* Grid or empty state */}
      {items.length === 0 && !loading ? (
        <EmptyState
          icon={<SparklesIcon className="h-12 w-12" />}
          heading={debouncedSearch ? `No results for "${debouncedSearch}"` : 'No titles found'}
          description={debouncedSearch ? 'Try a different search term or adjust the filters.' : 'Refresh your provider catalog to load titles here.'}
        />
      ) : (
        <>
          {/* Skeleton (first page load) */}
          {loading && filter.page === 1 ? (
            <section className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
              {Array.from({ length: 16 }).map((_, i) => <div key={i} className="skeleton aspect-[2/3]" />)}
            </section>
          ) : (
            <>
              {/* Sera UI Video Gallery grid – AnimatePresence + layout */}
              {/* Each VodCard carries its own animation variants — no wrapper div needed */}
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
                      onMatchFixed={() => { setItems([]); setFilter((f) => ({ ...f, page: 1 })); }}
                      onOpenModal={openModal}
                    />
                  ))}
                </AnimatePresence>

                {/* Append skeleton when loading more pages */}
                {loading && filter.page > 1 && Array.from({ length: 8 }).map((_, i) => (
                  <div key={`sk-${i}`} className="skeleton aspect-[2/3]" />
                ))}
              </motion.section>

              {/* Load more */}
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

      {/* Sera UI lightbox-style Fix Match modal */}
      {modalItem && (
        <FixMatchModal
          item={modalItem}
          providerId={selectedProvider}
          allItems={items}
          currentIndex={modalIndex}
          onClose={() => setModalItem(null)}
          onSuccess={() => { setItems([]); setFilter((f) => ({ ...f, page: 1 })); }}
          onNavigate={navigateModal}
        />
      )}
    </div>
  );
}
