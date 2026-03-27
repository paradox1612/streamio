import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  FilmIcon,
  ServerIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { providerAPI, userAPI } from '../utils/api';
import EmptyState from '../components/EmptyState';
import ProgressBar from '../components/ProgressBar';
import SkeletonCard from '../components/SkeletonCard';
import StatusBadge from '../components/StatusBadge';

function formatExpiry(expiresAt) {
  if (!expiresAt) return 'No expiry';
  const end = new Date(expiresAt);
  if (Number.isNaN(end.getTime())) return 'No expiry';
  const diffDays = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `Expired ${Math.abs(diffDays)}d ago`;
  if (diffDays === 0) return 'Expires today';
  return `${diffDays}d left`;
}

function getExpiryTone(expiresAt) {
  if (!expiresAt) return 'text-slate-300/60';
  const diffDays = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'text-red-400';
  if (diffDays <= 7) return 'text-amber-300';
  return 'text-emerald-300';
}

function ProviderRow({ provider }) {
  const online = provider.status === 'online';
  const matchRate = provider.totalTitles ? Math.round((provider.matchedTitles / provider.totalTitles) * 100) : 0;

  return (
    <Link
      to={`/providers/${provider.id}`}
      className="grid gap-4 rounded-[26px] border border-white/[0.08] bg-white/[0.03] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.14] lg:grid-cols-[1.2fr_0.8fr]"
    >
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-xl font-bold text-white">{provider.name}</h3>
          <StatusBadge status={online ? 'online' : 'offline'} pulse={online} />
        </div>
        <p className="mt-2 break-all text-sm text-slate-300/58">
          {provider.active_host || 'No active host selected'}
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="metric-label mb-1">Titles</p>
            <p className="text-2xl font-bold text-white">{provider.totalTitles.toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-300/55">
              {provider.movieCount} movies, {provider.seriesCount} series
            </p>
          </div>
          <div>
            <p className="metric-label mb-1">Matched</p>
            <p className="text-2xl font-bold text-white">{provider.matchedTitles.toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-300/55">{matchRate}% of the current catalog</p>
          </div>
          <div>
            <p className="metric-label mb-1">Expiry</p>
            <p className={`text-2xl font-bold ${getExpiryTone(provider.accountInfo?.expiresAt)}`}>
              {formatExpiry(provider.accountInfo?.expiresAt)}
            </p>
            <p className="mt-1 text-xs text-slate-300/55">
              {provider.accountInfoError || 'Subscription timing check'}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-[22px] border border-white/[0.08] bg-surface-950/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="metric-label">Match Progress</p>
          <span className="text-sm font-semibold text-brand-200">{matchRate}%</span>
        </div>
        <div className="mt-3">
          <ProgressBar value={matchRate} max={100} color="bg-brand-500" />
        </div>

        <div className="surface-divider mt-5 pt-5">
          <p className="metric-label mb-2">Next action</p>
          <p className="text-sm leading-6 text-slate-300/72">
            {online
              ? 'Open provider details to inspect hosts, account info, and metadata gaps.'
              : 'Provider is degraded. Open details to switch hosts or verify credentials.'}
          </p>
          <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-100">
            Open provider
            <ArrowRightIcon className="h-4 w-4" />
          </div>
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

        providerStats.forEach((provider) => {
          if (!provider.accountInfo?.expiresAt) return;
          const diffDays = Math.ceil((new Date(provider.accountInfo.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          if (diffDays < 0) {
            toast.error(`⚠️ "${provider.name}" subscription has expired!`, { duration: 8000 });
          } else if (diffDays <= 3) {
            toast.error(`🔴 "${provider.name}" expires in ${diffDays} day${diffDays !== 1 ? 's' : ''}!`, { duration: 8000 });
          } else if (diffDays <= 7) {
            toast(`⏰ "${provider.name}" expires in ${diffDays} days`, {
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
    } catch (_) {
      toast.error('Copy failed');
    }
    setTimeout(() => setCopying(false), 1500);
  };

  const installInStremio = () => {
    window.open(`stremio://${addonUrl.replace(/^https?:\/\//, '')}`, '_blank');
  };

  const totalTitles = providers.reduce((sum, provider) => sum + provider.totalTitles, 0);
  const totalMatched = providers.reduce((sum, provider) => sum + provider.matchedTitles, 0);
  const matchRate = totalTitles ? Math.round((totalMatched / totalTitles) * 100) : 0;
  const onlineCount = providers.filter((provider) => provider.status === 'online').length;
  const expiringSoon = providers.filter((provider) => {
    if (!provider.accountInfo?.expiresAt) return false;
    const diffDays = Math.ceil((new Date(provider.accountInfo.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
  });

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="panel overflow-hidden p-6 sm:p-8 lg:p-10">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div>
            <div className="kicker mb-5">Workspace overview</div>
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-5xl">
              Operate your providers, addon delivery, and catalog health from one surface.
            </h1>
            <p className="hero-copy mt-4 max-w-2xl">
              The dashboard is now focused on fast decisions: is the addon ready, are providers healthy, and where is cleanup still needed.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[26px] border border-white/[0.08] bg-white/[0.03] p-5">
              <p className="metric-label mb-2">Providers online</p>
              <p className="text-4xl font-bold text-white">{onlineCount}</p>
              <p className="mt-2 text-sm text-slate-300/68">
                {providers.length ? `${providers.length - onlineCount} need attention.` : 'No providers added yet.'}
              </p>
            </div>
            <div className="rounded-[26px] border border-white/[0.08] bg-white/[0.03] p-5">
              <p className="metric-label mb-2">Catalog confidence</p>
              <p className="text-4xl font-bold text-white">{matchRate}%</p>
              <p className="mt-2 text-sm text-slate-300/68">{totalMatched.toLocaleString()} matched titles available now.</p>
            </div>
            <div className="rounded-[26px] border border-white/[0.08] bg-white/[0.03] p-5">
              <p className="metric-label mb-2">Addon status</p>
              <p className="text-4xl font-bold text-white">{addonUrl ? 'Ready' : 'Pending'}</p>
              <p className="mt-2 text-sm text-slate-300/68">Private install path available for this account.</p>
            </div>
            <div className="rounded-[26px] border border-white/[0.08] bg-white/[0.03] p-5">
              <p className="metric-label mb-2">Expiring soon</p>
              <p className="text-4xl font-bold text-white">{expiringSoon.length}</p>
              <p className="mt-2 text-sm text-slate-300/68">Providers due within the next 7 days.</p>
            </div>
          </div>
        </div>
      </section>

      {addonUrl && (
        <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="panel-soft p-5 sm:p-6">
            <p className="eyebrow mb-2">Personal addon</p>
            <h2 className="section-title">Install once, keep it private</h2>
            <p className="section-copy mt-2">
              Your account-scoped endpoint is ready. Copy it directly or launch the Stremio install flow.
            </p>
            <div className="mt-5 overflow-x-auto rounded-[20px] border border-white/[0.08] bg-surface-950/70 p-4 font-mono text-sm text-slate-200/[0.8]">
              {addonUrl}
            </div>
          </div>

          <div className="panel-soft p-5 sm:p-6">
            <p className="eyebrow mb-2">Immediate actions</p>
            <div className="grid gap-3">
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
                Install in Stremio
              </button>
              <Link to="/addon" className="btn-secondary w-full">
                Open Addon Settings
              </Link>
            </div>
          </div>
        </section>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SkeletonCard count={4} type="stat" />
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Providers',
              value: providers.length,
              sub: `${onlineCount} online now`,
              icon: ServerIcon,
              tone: 'text-blue-300',
            },
            {
              label: 'Total titles',
              value: totalTitles.toLocaleString(),
              sub: 'Movies and series available',
              icon: FilmIcon,
              tone: 'text-cyan-300',
            },
            {
              label: 'Matched titles',
              value: totalMatched.toLocaleString(),
              sub: `${matchRate}% of the catalog`,
              icon: SparklesIcon,
              tone: 'text-sky-300',
            },
            {
              label: 'Expiring soon',
              value: expiringSoon.length,
              sub: 'Require renewal inside 7 days',
              icon: ClockIcon,
              tone: 'text-amber-300',
            },
          ].map(({ label, value, sub, icon: Icon, tone }) => (
            <div key={label} className="panel-soft p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <p className="metric-label">{label}</p>
                <span className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.04]">
                  <Icon className={`h-5 w-5 ${tone}`} />
                </span>
              </div>
              <p className="text-[2rem] font-bold text-white">{value}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300/70">{sub}</p>
            </div>
          ))}
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow mb-2">Providers</p>
              <h2 className="section-title">Source activity</h2>
              <p className="section-copy mt-2">
                Watch provider health, catalog coverage, and account timing without opening each record first.
              </p>
            </div>
            {!loading && providers.length > 0 && (
              <Link to="/providers" className="btn-secondary">
                View all providers
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            )}
          </div>

          {loading ? (
            <div className="grid gap-5">
              <SkeletonCard count={3} type="provider" />
            </div>
          ) : providers.length > 0 ? (
            <div className="grid gap-5">
              {providers.slice(0, 4).map((provider) => (
                <ProviderRow key={provider.id} provider={provider} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ServerIcon}
              heading="No providers connected"
              description="Add your first IPTV provider to populate routing, VOD, and Live TV views."
              action={() => window.location.href = '/providers'}
              actionLabel="Add Your First Provider"
            />
          )}
        </div>

        <div className="space-y-5">
          <div className="panel-soft p-5 sm:p-6">
            <p className="eyebrow mb-2">Attention</p>
            <h2 className="section-title">What to watch next</h2>
            <div className="mt-5 grid gap-3">
              <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-white">Expiring providers</p>
                <p className="mt-2 text-sm leading-6 text-slate-300/72">
                  {expiringSoon.length
                    ? `${expiringSoon.length} provider${expiringSoon.length !== 1 ? 's are' : ' is'} approaching renewal.`
                    : 'No renewals are due inside the next week.'}
                </p>
              </div>
              <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-white">Metadata backlog</p>
                <p className="mt-2 text-sm leading-6 text-slate-300/72">
                  {totalTitles
                    ? `${(totalTitles - totalMatched).toLocaleString()} titles still need matching or review.`
                    : 'Catalog metrics will appear after providers finish syncing.'}
                </p>
              </div>
              <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-white">Operational next step</p>
                <p className="mt-2 text-sm leading-6 text-slate-300/72">
                  Review provider details first, then open addon settings once source health is stable.
                </p>
              </div>
            </div>
          </div>

          <div className="panel-soft p-5 sm:p-6">
            <p className="eyebrow mb-2">Coverage</p>
            <h2 className="section-title">Catalog match progress</h2>
            <div className="mt-5">
              <ProgressBar value={matchRate} max={100} color="bg-brand-500" showLabel label="Matched catalog" />
            </div>
            <div className="surface-divider mt-5 pt-5 text-sm leading-6 text-slate-300/72">
              Higher match rates mean posters, titles, and discovery stay usable across the app.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
