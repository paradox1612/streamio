import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { userAPI, providerAPI } from '../utils/api';
import StatCard from '../components/StatCard';
import ProgressBar from '../components/ProgressBar';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import SkeletonCard from '../components/SkeletonCard';
import {
  ServerIcon,
  FilmIcon,
  SparklesIcon,
  ClockIcon,
  CheckIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

function formatExpiry(expiresAt) {
  if (!expiresAt) return 'No expiry';
  const end = new Date(expiresAt);
  if (Number.isNaN(end.getTime())) return 'No expiry';
  const diffDays = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `Expired ${Math.abs(diffDays)}d ago`;
  if (diffDays === 0) return 'Expires today';
  return `${diffDays}d left`;
}

function getExpiryColor(expiresAt) {
  if (!expiresAt) return 'text-slate-300/60';
  const diffDays = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'text-red-400';
  if (diffDays <= 7) return 'text-amber-400';
  return 'text-emerald-400';
}

function ProviderCard({ provider }) {
  const online = provider.status === 'online';
  const matchRate = provider.totalTitles ? Math.round((provider.matchedTitles / provider.totalTitles) * 100) : 0;
  const expiryColor = getExpiryColor(provider.accountInfo?.expiresAt);

  return (
    <Link
      to={`/providers/${provider.id}`}
      className="panel-soft group block p-5 sm:p-6 no-underline transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.15]"
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="metric-label mb-2">Provider</p>
          <h3 className="text-xl font-bold text-white transition-colors group-hover:text-brand-200">{provider.name}</h3>
          <p className="mt-2 break-all text-sm text-slate-300/60">{provider.active_host || 'No active host'}</p>
        </div>
        <StatusBadge status={online ? 'online' : 'offline'} pulse={online} />
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="metric-label mb-1">Titles</p>
            <p className="text-2xl font-bold text-white">{provider.totalTitles.toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-300/55">{provider.movieCount} movies, {provider.seriesCount} series</p>
          </div>
          <div>
            <p className="metric-label mb-1">Match Rate</p>
            <p className="text-2xl font-bold text-brand-300">{matchRate}%</p>
            <p className="mt-1 text-xs text-slate-300/55">{provider.matchedTitles.toLocaleString()} matched</p>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="metric-label">Match Progress</span>
            <span className="text-xs font-bold text-brand-300">{matchRate}%</span>
          </div>
          <ProgressBar value={matchRate} max={100} color="bg-brand-500" />
        </div>

        {provider.accountInfo?.expiresAt && (
          <div className="flex flex-col gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-slate-300/[0.65]">Expiry</span>
            <span className={`text-sm font-bold ${expiryColor}`}>{formatExpiry(provider.accountInfo.expiresAt)}</span>
          </div>
        )}

        <div className="flex items-center pt-2 text-xs font-semibold text-slate-300/55">
          <ArrowRightIcon className="mr-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          Open provider details
        </div>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const [addonUrl, setAddonUrl] = useState('');
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    Promise.all([userAPI.getAddonUrl(), providerAPI.list()])
      .then(async ([urlRes, provsRes]) => {
        setAddonUrl(urlRes.data.addonUrl);

        const providerStats = await Promise.all(
          provsRes.data.map(async (provider) => {
            try {
              const { data } = await providerAPI.getStats(provider.id);
              return {
                ...provider,
                totalTitles: parseInt(data.vodStats?.total || provider.vod_count || 0, 10),
                movieCount: parseInt(data.vodStats?.movie_count || 0, 10),
                seriesCount: parseInt(data.vodStats?.series_count || 0, 10),
                matchedTitles: parseInt(data.matchStats?.matched || provider.matched_count || 0, 10),
                unmatchedTitles: parseInt(data.matchStats?.unmatched || 0, 10),
                accountInfo: data.accountInfo,
                accountInfoError: data.accountInfoError,
              };
            } catch (_) {
              return {
                ...provider,
                totalTitles: parseInt(provider.vod_count || 0, 10),
                movieCount: 0,
                seriesCount: 0,
                matchedTitles: parseInt(provider.matched_count || 0, 10),
                unmatchedTitles: 0,
                accountInfo: null,
                accountInfoError: 'Stats unavailable',
              };
            }
          })
        );

        setProviders(providerStats);

        // 🔔 Expiry alerts — warn about providers expiring in ≤ 7 days
        providerStats.forEach(p => {
          if (!p.accountInfo?.expiresAt) return;
          const diffDays = Math.ceil((new Date(p.accountInfo.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          if (diffDays < 0) {
            toast.error(`⚠️ "${p.name}" subscription has expired!`, { duration: 8000 });
          } else if (diffDays <= 3) {
            toast.error(`🔴 "${p.name}" expires in ${diffDays} day${diffDays !== 1 ? 's' : ''}!`, { duration: 8000 });
          } else if (diffDays <= 7) {
            toast(`⏰ "${p.name}" expires in ${diffDays} days`, {
              icon: '⚠️',
              duration: 6000,
              style: { background: '#451a03', color: '#fef3c7', border: '1px solid #92400e' },
            });
          }
        });
      })
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const copyUrl = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(addonUrl);
      toast.success('Addon URL copied!');
    } catch (_) { toast.error('Copy failed'); }
    setTimeout(() => setCopying(false), 1500);
  };

  const installInStremio = () => {
    window.open(`stremio://${addonUrl.replace(/^https?:\/\//, '')}`, '_blank');
  };

  const totalTitles = providers.reduce((sum, p) => sum + p.totalTitles, 0);
  const totalMatched = providers.reduce((sum, p) => sum + p.matchedTitles, 0);
  const matchRate = totalTitles ? Math.round((totalMatched / totalTitles) * 100) : 0;
  const onlineCount = providers.filter(p => p.status === 'online').length;
  const expiringSoonCount = providers.filter((p) => {
    if (!p.accountInfo?.expiresAt) return false;
    const diffDays = Math.ceil((new Date(p.accountInfo.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
  }).length;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="panel overflow-hidden p-5 sm:p-7 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
          <div>
            <div className="kicker mb-4">Workspace Overview</div>
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
              Monitor providers, copy your addon URL, and scan catalog health.
            </h1>
            <p className="hero-copy mt-3">
              Start with the actions you need most, then move straight into provider activity and matching performance.
            </p>
            <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap">
              {addonUrl && (
                <>
                  <button onClick={copyUrl} className="btn-primary w-full sm:w-auto">
                    {copying ? 'Copied URL' : 'Copy Addon URL'}
                  </button>
                  <button onClick={installInStremio} className="btn-secondary w-full sm:w-auto">
                    Install in Stremio
                  </button>
                </>
              )}
              <Link to="/providers" className="btn-secondary w-full sm:w-auto">
                Manage Providers
              </Link>
            </div>
          </div>

          <div className="panel-soft grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <p className="metric-label mb-1">Active Providers</p>
              <p className="text-3xl font-bold text-white">{onlineCount}</p>
              <p className="mt-1 text-sm text-slate-300/[0.65]">Healthy sources ready for playback routing.</p>
            </div>
            <div>
              <p className="metric-label mb-1">Catalog Confidence</p>
              <p className="text-3xl font-bold text-white">{matchRate}%</p>
              <p className="mt-1 text-sm text-slate-300/[0.65]">{totalMatched.toLocaleString()} matched titles across your library.</p>
            </div>
          </div>
        </div>
      </section>

      {addonUrl && (
        <section className="panel-soft grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="eyebrow mb-2">Personal Addon</p>
            <h2 className="section-title">Ready to install</h2>
            <p className="section-copy mt-2">Use your private addon URL in Stremio. Copy it once or launch installation directly.</p>
            <div className="mt-5 overflow-x-auto rounded-[20px] border border-white/[0.08] bg-surface-950/70 p-4 font-mono text-sm text-slate-200/[0.8]">
              {addonUrl}
            </div>
          </div>
          <div className="grid gap-3 lg:w-52">
            <button
              onClick={copyUrl}
              className={`btn-secondary w-full ${copying ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-50' : ''}`}
            >
              {copying ? (
                <>
                  <CheckIcon className="h-4 w-4" />
                  Copied
                </>
              ) : (
                'Copy URL'
              )}
            </button>
            <button onClick={installInStremio} className="btn-primary w-full">
              Install
            </button>
          </div>
        </section>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SkeletonCard count={4} type="stat" />
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={ServerIcon} label="Providers" value={providers.length} sub={`${onlineCount} online`} color="text-blue-300" />
          <StatCard icon={FilmIcon} label="Total Titles" value={totalTitles.toLocaleString()} sub="Movies and series available" color="text-cyan-300" />
          <StatCard icon={SparklesIcon} label="Match Rate" value={`${matchRate}%`} sub={`${totalMatched.toLocaleString()} matched`} color="text-sky-300" />
          <StatCard icon={ClockIcon} label="Expiring Soon" value={expiringSoonCount} sub="within 7 days" color="text-amber-300" />
        </section>
      )}

      <section>
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow mb-2">Sources</p>
            <h2 className="section-title">Provider activity</h2>
            <p className="section-copy mt-2">Scan source health, title volume, and subscription timing at a glance.</p>
          </div>
          {!loading && providers.length > 0 && (
            <Link to="/providers" className="btn-secondary">
              View all
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SkeletonCard count={4} type="provider" />
          </div>
        ) : providers.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {providers.slice(0, 4).map(p => (
              <ProviderCard key={p.id} provider={p} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ServerIcon}
            heading="No providers connected"
            description="Add your first IPTV provider to start streaming and populate your VOD and Live TV views."
            action={() => window.location.href = '/providers'}
            actionLabel="Add Your First Provider"
          />
        )}
      </section>
    </div>
  );
}
