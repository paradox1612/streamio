import React, { useState, useEffect, useCallback, useRef } from 'react';
import { providerAPI } from '../utils/api';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  FilmIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import EmptyState from '../components/EmptyState';
import toast from 'react-hot-toast';

function FixMatchModal({ item, providerId, onClose, onSuccess }) {
  const [query, setQuery] = useState(item.raw_title);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(null);

  const search = useCallback(async (q) => {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const res = await providerAPI.tmdbSearch(providerId, q, item.vod_type === 'series' ? 'series' : 'movie');
      setResults(res.data.results || []);
    } catch (_) {
      toast.error('Search failed');
    } finally {
      setSearching(false);
    }
  }, [providerId, item.vod_type]);

  useEffect(() => { search(query); }, []); // eslint-disable-line

  const handleSelect = async (result) => {
    setSaving(result.tmdbId);
    try {
      await providerAPI.manualMatch(providerId, {
        rawTitle: item.raw_title,
        tmdbId: result.tmdbId,
        tmdbType: result.type,
      });
      toast.success(`Matched to "${result.title}"`);
      onSuccess();
      onClose();
    } catch (_) {
      toast.error('Failed to save match');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
      <div className="panel max-h-[calc(100svh-2rem)] w-full max-w-2xl overflow-y-auto p-5 sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow mb-2">Manual Match</p>
            <h2 className="section-title">Fix title mapping</h2>
            <p className="mt-2 text-sm text-slate-300/[0.65]">{item.raw_title}</p>
          </div>
          <button onClick={onClose} className="btn-secondary !rounded-2xl !px-3 !py-3">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search(query)}
            placeholder="Search TMDB..."
            className="field-input"
          />
          <button onClick={() => search(query)} disabled={searching} className="btn-primary">
            <MagnifyingGlassIcon className="h-4 w-4" />
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        <div className="max-h-96 space-y-2 overflow-y-auto">
          {searching && <div className="py-8 text-center text-sm text-slate-300/[0.65]">Searching TMDB...</div>}
          {!searching && results.length === 0 && <div className="py-8 text-center text-sm text-slate-300/[0.65]">No results found. Try a different query.</div>}
          {results.map(result => (
            <button
              key={result.tmdbId}
              onClick={() => handleSelect(result)}
              disabled={saving !== null}
              className="flex w-full items-center gap-4 rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-3 text-left transition-all hover:border-white/[0.14] hover:bg-white/[0.05]"
            >
              {result.poster ? (
                <img src={result.poster} alt={result.title} className="h-20 w-14 rounded-xl object-cover" />
              ) : (
                <div className="flex h-20 w-14 items-center justify-center rounded-xl bg-surface-900/80">
                  <FilmIcon className="h-5 w-5 text-slate-400/50" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{result.title}</p>
                <p className="mt-1 text-xs text-slate-300/55">{result.year || 'Unknown year'} · {result.type}</p>
              </div>
              <span className="text-sm font-semibold text-brand-300">
                {saving === result.tmdbId ? 'Saving...' : 'Select'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function VodCard({ item, providerId, onMatchFixed }) {
  const [showFixModal, setShowFixModal] = useState(false);
  const matched = item.tmdb_id != null;
  const score = item.confidence_score ? Math.round(item.confidence_score * 100) : null;

  return (
    <>
      <div className="group relative overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.04]" style={{ aspectRatio: '2/3' }}>
        {item.poster_url ? (
          <img
            src={item.poster_url}
            alt={item.raw_title}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            onError={e => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400/45">
            <FilmIcon className="h-10 w-10" />
            <span className="line-clamp-3 px-3 text-center text-xs">{item.raw_title}</span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/[0.85] via-black/10 to-transparent" />

        <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/45 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-100">
          {item.vod_type}
        </div>

        <div className={`absolute right-3 top-3 rounded-full px-2 py-1 text-[10px] font-bold ${
          matched ? 'bg-emerald-400/90 text-white' : 'bg-black/45 text-slate-200'
        }`}>
          {matched ? `${score}%` : 'Unmatched'}
        </div>

        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="line-clamp-2 text-xs font-semibold leading-tight text-white">{item.raw_title}</p>
          {item.category && <p className="mt-1 truncate text-[10px] text-slate-300/[0.65]">{item.category}</p>}
          <button
            onClick={() => setShowFixModal(true)}
            className="mt-3 inline-flex rounded-full border border-white/[0.15] bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm transition hover:bg-white/15"
          >
            {matched ? 'Fix Match' : 'Match Title'}
          </button>
        </div>
      </div>

      {showFixModal && (
        <FixMatchModal
          item={item}
          providerId={providerId}
          onClose={() => setShowFixModal(false)}
          onSuccess={onMatchFixed}
        />
      )}
    </>
  );
}

export default function VodBrowser() {
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [filter, setFilter] = useState({ type: '', matched: '', page: 1 });
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setItems([]);
      setFilter(f => ({ ...f, page: 1 }));
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  useEffect(() => {
    providerAPI.list()
      .then(res => {
        setProviders(res.data);
        if (res.data.length > 0) setSelectedProvider(res.data[0].id);
      })
      .catch(() => toast.error('Failed to load providers'))
      .finally(() => setLoadingProviders(false));
  }, []);

  const loadVod = useCallback(async () => {
    if (!selectedProvider) return;
    setLoading(true);
    try {
      const params = { page: filter.page, limit: 60 };
      if (filter.type) params.type = filter.type;
      if (debouncedSearch) params.search = debouncedSearch;
      if (filter.matched !== '') params.matched = filter.matched;
      const res = await providerAPI.getVod(selectedProvider, params);
      setItems(prev => filter.page === 1 ? res.data : [...prev, ...res.data]);
    } catch (_) {
      toast.error('Failed to load catalog');
    } finally {
      setLoading(false);
    }
  }, [selectedProvider, filter, debouncedSearch]);

  useEffect(() => {
    setItems([]);
    setFilter(f => ({ ...f, page: 1 }));
  }, [selectedProvider, filter.type, filter.matched]);

  useEffect(() => { loadVod(); }, [filter.page, debouncedSearch, selectedProvider, filter.type, filter.matched]); // eslint-disable-line

  const handleFilterChange = (key, value) => {
    setItems([]);
    setFilter(f => ({ ...f, [key]: value, page: 1 }));
  };

  if (loadingProviders) {
    return (
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="panel p-8"><h1 className="hero-title">Loading VOD library...</h1></div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[2/3]" />
          ))}
        </div>
      </div>
    );
  }

  const selectedProviderName = providers.find(p => p.id === selectedProvider)?.name || '';

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="panel overflow-hidden p-5 sm:p-7 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div>
            <div className="kicker mb-4">VOD Browser</div>
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">Browse posters first, then fix metadata only when needed.</h1>
            <p className="hero-copy mt-3">
              Search within a provider, filter by type or match status, and jump into manual TMDB correction from the poster grid.
            </p>
          </div>
          <div className="panel-soft p-5">
            <p className="metric-label mb-1">Current Provider</p>
            <p className="text-2xl font-bold text-white">{selectedProviderName || 'None selected'}</p>
            <p className="mt-2 text-sm text-slate-300/[0.68]">{items.length} visible items{debouncedSearch ? ` for "${debouncedSearch}"` : ''}.</p>
          </div>
        </div>
      </section>

      <section className="panel-soft p-5 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
          <div className="relative">
            <label className="field-label">Search Library</label>
            <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-[3.1rem] h-5 w-5 text-slate-400/50" />
            <input
              placeholder={`Search in ${selectedProviderName || 'your library'}...`}
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="field-input pl-12 pr-11"
            />
            {searchInput && (
              <button
                onClick={() => { setSearchInput(''); setDebouncedSearch(''); }}
                className="absolute right-4 top-[3.05rem] text-slate-300/55 transition-colors hover:text-white"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>

          <div>
            <label className="field-label">Provider</label>
            <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)} className="field-select">
              {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {['', 'movie', 'series'].map(type => (
            <button
              key={type}
              onClick={() => handleFilterChange('type', type)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                filter.type === type
                  ? 'bg-brand-500 text-white'
                  : 'border border-white/10 bg-white/[0.04] text-slate-200/[0.76] hover:bg-white/[0.08]'
              }`}
            >
              {type === '' ? 'All titles' : type === 'movie' ? 'Movies' : 'Series'}
            </button>
          ))}

          <div className="w-full sm:ml-auto sm:w-auto">
            <select value={filter.matched} onChange={e => handleFilterChange('matched', e.target.value)} className="field-select w-full sm:min-w-[180px]">
            <option value="">All matches</option>
            <option value="true">Matched</option>
            <option value="false">Unmatched</option>
            </select>
          </div>
        </div>
      </section>

      {items.length === 0 && !loading ? (
        <EmptyState
          icon={<SparklesIcon className="h-12 w-12" />}
          heading={debouncedSearch ? `No results for "${debouncedSearch}"` : 'No titles found'}
          description={debouncedSearch ? 'Try a different search term or adjust the filters.' : 'Refresh your provider catalog to load titles here.'}
        />
      ) : (
        <>
          <section className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
            {items.map(item => (
              <VodCard
                key={item.id}
                item={item}
                providerId={selectedProvider}
                onMatchFixed={() => {
                  setItems([]);
                  setFilter(f => ({ ...f, page: 1 }));
                }}
              />
            ))}
            {loading && filter.page > 1 && Array.from({ length: 8 }).map((_, i) => (
              <div key={`sk-${i}`} className="skeleton aspect-[2/3]" />
            ))}
          </section>

          {!loading && items.length > 0 && items.length % 60 === 0 && (
            <div className="text-center">
              <button onClick={() => setFilter(f => ({ ...f, page: f.page + 1 }))} className="btn-secondary">
                Load More Titles
              </button>
            </div>
          )}

          {loading && filter.page === 1 && (
            <section className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
              {Array.from({ length: 16 }).map((_, i) => (
                <div key={i} className="skeleton aspect-[2/3]" />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
