import React, { useState, useEffect } from 'react';
import { providerAPI } from '../utils/api';
import { SparklesIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import EmptyState from '../components/EmptyState';
import SkeletonCard from '../components/SkeletonCard';
import toast from 'react-hot-toast';

function normalizeCategoryName(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : 'Live TV';
}

export default function LiveTV() {
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    providerAPI.list()
      .then(res => {
        setProviders(res.data);
        if (res.data.length > 0) {
          setSelectedProvider(res.data[0].id);
        }
      })
      .catch(() => toast.error('Failed to load providers'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedProvider) return;

    setLoadingChannels(true);
    setChannels([]);
    setCategories(['all']);
    setSelectedCategory('all');

    Promise.all([
      providerAPI.getLive ? providerAPI.getLive(selectedProvider, { limit: 20000 }) : Promise.resolve({ data: [] }),
    ])
      .then(([res]) => {
        const channelList = (res.data || []).map(channel => ({
          ...channel,
          category: normalizeCategoryName(channel.category),
        }));
        setChannels(channelList);
        const uniqueCategories = [
          'all',
          ...Array.from(new Set(channelList.map(c => c.category))).sort((a, b) => a.localeCompare(b)),
        ];
        setCategories(uniqueCategories);
      })
      .catch(() => toast.error('Failed to load live channels'))
      .finally(() => setLoadingChannels(false));
  }, [selectedProvider]);

  const filteredChannels = channels
    .filter(c => selectedCategory === 'all' || c.category === selectedCategory)
    .filter(c => {
      const channelName = c.name || c.raw_title || '';
      return channelName.toLowerCase().includes(searchQuery.toLowerCase());
    });

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
    );
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
          icon={SparklesIcon}
          heading="No providers available"
          description="Add at least one IPTV provider before browsing live channels."
          action={() => window.location.href = '/providers'}
          actionLabel="Add Provider"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="panel overflow-hidden p-5 sm:p-7 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div>
            <div className="kicker mb-4">Live TV</div>
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">Find channels fast, then launch them without friction.</h1>
            <p className="hero-copy mt-3">
              Switch providers, search by name, and narrow by category while keeping logos and metadata easy to scan.
            </p>
          </div>
          <div className="panel-soft p-4 sm:p-5">
            <p className="metric-label mb-1">Visible Channels</p>
            <p className="text-3xl font-bold text-white">{filteredChannels.length}</p>
            <p className="mt-2 text-sm text-slate-300/[0.68]">Filtered from {channels.length} channels in the selected provider.</p>
          </div>
        </div>
      </section>

      <section className="panel-soft p-5 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <div>
            <label className="field-label">Provider</label>
            <select
              value={selectedProvider}
              onChange={e => setSelectedProvider(e.target.value)}
              className="field-select"
            >
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <label className="field-label">Search Channels</label>
            <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-[3.1rem] h-5 w-5 text-slate-400/50" />
            <input
              type="text"
              placeholder="Search channels..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="field-input pl-12"
            />
          </div>
        </div>

        {categories.length > 1 && (
          <div className="-mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1">
            {categories.map(cat => (
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

      {loadingChannels ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
          <SkeletonCard count={12} type="vod" />
        </div>
      ) : filteredChannels.length > 0 ? (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          {filteredChannels.map(channel => (
            <a
              key={channel.id || channel.stream_id}
              href={channel.streamUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="group overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.04] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.16]"
            >
              <div className="relative aspect-square overflow-hidden bg-surface-900/80">
                {channel.logo || channel.poster_url ? (
                  <img
                    src={channel.logo || channel.poster_url}
                    alt={channel.name || channel.raw_title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
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
      ) : (
        <EmptyState
          icon={SparklesIcon}
          heading="No channels found"
          description="Try adjusting the selected category or search term."
        />
      )}
    </div>
  );
}
