import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, Check, Clock, Film, Server, Sparkles, Copy, ExternalLink, Activity,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { reportableError } from '../utils/reportableToast';
import { freeAccessAPI, providerAPI, userAPI } from '../utils/api';
import EmptyState from '../components/EmptyState';
import ProgressBar from '../components/ProgressBar';
import SkeletonCard from '../components/SkeletonCard';
import StatusBadge from '../components/StatusBadge';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';

// ── Sera UI ─────────────────────────────────────────────────────────────────
import NumberTicker  from '../components/sera/NumberTicker';
import ShimmerButton from '../components/sera/ShimmerButton';
import { useAuth } from '../context/AuthContext';

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function estimateRemainingMs(progressPct, elapsedMs) {
  if (!Number.isFinite(progressPct) || progressPct <= 0 || progressPct >= 100) return null;
  const totalEstimate = elapsedMs / (progressPct / 100);
  const remaining = totalEstimate - elapsedMs;
  return Number.isFinite(remaining) && remaining > 0 ? remaining : null;
}

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

function formatLastWatched(value) {
  if (!value) return 'Not watched yet';

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

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  }),
};

function ProviderRow({ provider }) {
  const online = provider.status === 'online';
  const matchRate = provider.totalTitles ? Math.round((provider.matchedTitles / provider.totalTitles) * 100) : 0;
  const ingest = provider.refreshJob;
  const ingestMeta = ingest?.metadata || {};
  const ingestProgress = Math.max(0, Math.min(100, ingestMeta.progressPct || 0));

  return (
    <Link
      to={`/providers/${provider.id}`}
      className="group grid gap-4 rounded-[26px] border border-white/[0.07] bg-white/[0.025] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.13] hover:bg-white/[0.04] lg:grid-cols-[1.2fr_0.8fr]"
    >
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-xl font-bold text-white">{provider.name}</h3>
          <StatusBadge status={online ? 'online' : 'offline'} pulse={online} />
        </div>
        <p className="mt-2 break-all text-sm text-slate-300/55">
          {provider.active_host || 'No active host selected'}
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="metric-label mb-1">Titles</p>
            <p className="text-2xl font-bold text-white">{provider.totalTitles.toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-300/50">{provider.movieCount} movies, {provider.seriesCount} series</p>
          </div>
          <div>
            <p className="metric-label mb-1">Matched</p>
            <p className="text-2xl font-bold text-white">{provider.matchedTitles.toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-300/50">{matchRate}% of catalog</p>
          </div>
          <div>
            <p className="metric-label mb-1">Expiry</p>
            <p className={`text-2xl font-bold ${getExpiryTone(provider.accountInfo?.expiresAt)}`}>
              {formatExpiry(provider.accountInfo?.expiresAt)}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-[22px] border border-white/[0.07] bg-surface-950/60 p-4">
        {ingest?.active && (
          <div className="mb-4 rounded-[18px] border border-brand-400/20 bg-brand-500/10 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="metric-label text-brand-100">Catalog ingest</p>
              <span className="text-sm font-semibold text-brand-200">{ingestProgress}%</span>
            </div>
            <div className="mt-2">
              <ProgressBar value={ingestProgress} max={100} color="bg-brand-500" />
            </div>
            <p className="mt-2 text-xs text-slate-200/70">{ingestMeta.message || 'Refreshing catalog'}</p>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <p className="metric-label">Match progress</p>
          <span className="text-sm font-semibold text-brand-200">{matchRate}%</span>
        </div>
        <div className="mt-3">
          <ProgressBar value={matchRate} max={100} color="bg-brand-500" />
        </div>
        <div className="surface-divider mt-4 pt-4">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-100 group-hover:text-white transition-colors">
            Open provider
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { user, setUser } = useAuth();
  const [addonUrl, setAddonUrl] = useState('');
  const [providers, setProviders] = useState([]);
  const [watchHistory, setWatchHistory] = useState([]);
  const [freeAccess, setFreeAccess] = useState({ status: 'inactive', canStart: true, canExtend: false });
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [activeRefreshes, setActiveRefreshes] = useState([]);
  const [refreshNow, setRefreshNow] = useState(Date.now());

  useEffect(() => {
    Promise.all([
      userAPI.getAddonUrl(),
      providerAPI.list(),
      userAPI.getWatchHistory({ limit: 6 }),
      freeAccessAPI.getStatus(),
    ])
      .then(async ([urlRes, provsRes, watchRes, freeRes]) => {
        setAddonUrl(urlRes.data.addonUrl);
        setWatchHistory(Array.isArray(watchRes.data) ? watchRes.data : []);
        setFreeAccess(freeRes.data || { status: 'inactive', canStart: true, canExtend: false });
        const { data: activeJobs } = await providerAPI.listActiveRefreshes();
        setActiveRefreshes(Array.isArray(activeJobs) ? activeJobs : []);
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
                movieCount: 0, seriesCount: 0,
                matchedTitles: parseInt(provider.matched_count || 0, 10),
                unmatchedTitles: 0,
                accountInfo: null,
                accountInfoError: 'Stats unavailable',
              };
            }
          })
        );
        const activeMap = new Map((activeJobs || []).map((job) => [job.providerId, job]));
        setProviders(providerStats.map((provider) => ({
          ...provider,
          refreshJob: activeMap.get(provider.id) || null,
        })));
        providerStats.forEach((provider) => {
          if (!provider.accountInfo?.expiresAt) return;
          const diffDays = Math.ceil((new Date(provider.accountInfo.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          if (diffDays < 0) reportableError(`⚠️ "${provider.name}" subscription has expired!`, { duration: 8000 });
          else if (diffDays <= 3) reportableError(`🔴 "${provider.name}" expires in ${diffDays} day${diffDays !== 1 ? 's' : ''}!`, { duration: 8000 });
          else if (diffDays <= 7) toast(`⏰ "${provider.name}" expires in ${diffDays} days`, { icon: '⚠️', duration: 6000, style: { background: '#451a03', color: '#fef3c7', border: '1px solid #92400e' } });
        });
      })
      .catch(() => reportableError('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const poll = async () => {
      try {
        const { data } = await providerAPI.listActiveRefreshes();
        if (cancelled) return;
        const jobs = Array.isArray(data) ? data : [];
        setActiveRefreshes(jobs);
        setRefreshNow(Date.now());
        setProviders((prev) => {
          const activeMap = new Map(jobs.map((job) => [job.providerId, job]));
          return prev.map((provider) => ({
            ...provider,
            refreshJob: activeMap.get(provider.id) || null,
          }));
        });
      } catch (_) {
        if (!cancelled) setActiveRefreshes([]);
      } finally {
        if (!cancelled) timer = setTimeout(poll, 3000);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!activeRefreshes.length) return undefined;
    const interval = setInterval(() => setRefreshNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [activeRefreshes.length]);

  const refreshProfile = async () => {
    const { data } = await userAPI.getProfile();
    setUser(data.user);
    return data.user;
  };

  const handleStartFreeAccess = async () => {
    try {
      const action = freeAccess.status === 'expired' ? freeAccessAPI.extend : freeAccessAPI.start;
      await action();
      toast.success(freeAccess.status === 'expired' ? 'Free access extended' : 'Free access started');
      const [{ data: freeStatus }] = await Promise.all([
        freeAccessAPI.getStatus(),
        refreshProfile(),
      ]);
      setFreeAccess(freeStatus);
    } catch (err) {
      reportableError(err.response?.data?.error || 'Unable to update free access');
    }
  };

  const copyUrl = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(addonUrl);
      toast.success('Addon URL copied!');
    } catch (_) { reportableError('Copy failed'); }
    setTimeout(() => setCopying(false), 1500);
  };

  const installInStremio = () => window.open(`stremio://${addonUrl.replace(/^https?:\/\//, '')}`, '_blank');

  const totalTitles = providers.reduce((sum, p) => sum + p.totalTitles, 0);
  const totalMatched = providers.reduce((sum, p) => sum + p.matchedTitles, 0);
  const matchRate = totalTitles ? Math.round((totalMatched / totalTitles) * 100) : 0;
  const onlineCount = providers.filter(p => p.status === 'online').length;
  const expiringSoon = providers.filter(p => {
    if (!p.accountInfo?.expiresAt) return false;
    const diffDays = Math.ceil((new Date(p.accountInfo.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
  });
  const hasByoProviders = Boolean(user?.has_byo_providers);
  const activeRefreshCount = activeRefreshes.length;
  const freeAccessLabel = freeAccess.status === 'active'
    ? formatExpiry(freeAccess.expiresAt)
    : freeAccess.status === 'expired'
      ? 'Expired'
      : 'Inactive';
  const freeAccessActionLabel = freeAccess.status === 'expired'
    ? 'Extend Free Access'
    : freeAccess.status === 'active'
      ? 'Free Access Active'
      : 'Start Free Access';

  // Raw numeric values – rendered via Sera UI NumberTicker
  const stats = [
    { label: 'Providers',     numVal: providers.length,  sub: `${onlineCount} online`,        icon: Server,   tone: 'text-blue-300' },
    { label: 'Total titles',  numVal: totalTitles,        sub: 'Movies & series',               icon: Film,     tone: 'text-cyan-300' },
    { label: 'Matched titles',numVal: totalMatched,       sub: `${matchRate}% of catalog`,      icon: Sparkles, tone: 'text-sky-300'  },
    { label: 'Expiring soon', numVal: expiringSoon.length,sub: hasByoProviders ? 'Within 7 days' : `Free access: ${freeAccessLabel}`, icon: Clock, tone: expiringSoon.length > 0 || freeAccess.status === 'expired' ? 'text-amber-300' : 'text-slate-300/60' },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8">

      {/* Hero panel */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <Card className="overflow-hidden p-6 sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div>
              <Badge variant="default" className="mb-5">
                <Activity className="h-3 w-3" />
                Workspace overview
              </Badge>
              <h1 className="text-3xl font-bold leading-tight text-white sm:text-5xl">
                Operate providers, addon delivery, and catalog health from one surface.
              </h1>
              <p className="hero-copy mt-4 max-w-2xl">
                Fast decisions: is the addon ready, are providers healthy, and where is cleanup still needed.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {addonUrl && (
                  <>
                    {/* Sera UI – Shimmer Button for primary addon action */}
                    <ShimmerButton onClick={copyUrl} className="text-sm font-semibold">
                      {copying
                        ? <><Check className="h-4 w-4 inline-block mr-1" /> Copied!</>
                        : <><Copy className="h-4 w-4 inline-block mr-1" /> Copy Addon URL</>}
                    </ShimmerButton>
                    <Button onClick={installInStremio} variant="outline" size="lg">
                      <ExternalLink className="h-4 w-4" />
                      Install in Stremio
                    </Button>
                  </>
                )}
                <Button asChild variant="outline" size="lg">
                  <Link to="/providers">
                    <Server className="h-4 w-4" />
                    {hasByoProviders ? 'Manage Providers' : 'Add BYO Provider'}
                  </Link>
                </Button>
                {!hasByoProviders && (
                  <Button onClick={handleStartFreeAccess} variant="outline" size="lg" disabled={freeAccess.status === 'active'}>
                    <Clock className="h-4 w-4" />
                    {freeAccessActionLabel}
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: 'Providers online',  numVal: onlineCount,        desc: providers.length ? `${providers.length - onlineCount} need attention.` : 'No BYO providers added yet.' },
                { label: 'Catalog confidence',numVal: matchRate, suffix:'%', desc: hasByoProviders ? `${totalMatched.toLocaleString()} matched titles.` : (freeAccess.status === 'active' ? 'Free access is active for hidden addon fallback resolution.' : 'Add a BYO provider to unlock dashboard catalog browsing.') },
                { label: 'Addon status',      display: addonUrl ? 'Ready' : 'Pending', desc: 'Private install path available.' },
                { label: 'Free access',       display: freeAccess.status === 'active' ? freeAccessLabel : freeAccess.status === 'expired' ? 'Expired' : 'Not started', desc: hasByoProviders ? 'Managed fallback is available alongside your BYO sources; live TV stays BYO-only.' : 'Start it manually for hidden addon fallback resolution. Web browsing and Live TV still require BYO.' },
              ].map(({ label, numVal, suffix, display, desc }) => (
                <div key={label} className="rounded-[22px] border border-white/[0.07] bg-white/[0.025] p-5">
                  <p className="metric-label mb-2">{label}</p>
                  {/* Sera UI – NumberTicker for numeric cells */}
                  <p className="text-4xl font-bold text-white">
                    {numVal !== undefined
                      ? <NumberTicker value={numVal} suffix={suffix || ''} duration={1200} className="text-4xl font-bold text-white" />
                      : display}
                  </p>
                  <p className="mt-2 text-sm text-slate-300/60">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {activeRefreshCount > 0 && (
            <div className="mt-8 rounded-[24px] border border-brand-400/20 bg-brand-500/10 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="eyebrow mb-2 text-brand-100">Ingest Activity</p>
                  <h2 className="text-xl font-bold text-white">
                    {activeRefreshCount} provider {activeRefreshCount === 1 ? 'is' : 'are'} refreshing in the background
                  </h2>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to="/providers">Open providers</Link>
                </Button>
              </div>
              <div className="mt-5 grid gap-4">
                {activeRefreshes.map((job) => {
                  const meta = job.metadata || {};
                  const progress = Math.max(0, Math.min(100, meta.progressPct || 0));
                  const startedAt = job.startedAt || meta.startedAt;
                  const elapsedMs = startedAt ? Math.max(refreshNow - new Date(startedAt).getTime(), 0) : 0;
                  const remainingMs = estimateRemainingMs(progress, elapsedMs);
                  return (
                    <div key={job.id} className="rounded-[18px] border border-white/[0.08] bg-surface-950/60 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">{job.providerName || meta.providerName || 'Provider refresh'}</p>
                        <span className="text-sm font-semibold text-brand-200">{progress}%</span>
                      </div>
                      <div className="mt-3">
                        <ProgressBar value={progress} max={100} color="bg-brand-500" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-300/65">
                        <span>{meta.message || 'Refreshing catalog'}</span>
                        <span>Elapsed: {formatDuration(elapsedMs)}</span>
                        {remainingMs !== null && <span>Est. remaining: {formatDuration(remainingMs)}</span>}
                        {meta.counts?.persisted > 0 && meta.counts?.total > 0 && (
                          <span>Saved: {meta.counts.persisted.toLocaleString()} / {meta.counts.total.toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </motion.section>

      {/* Addon URL panel */}
      {addonUrl && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]"
        >
          <Card className="p-5 sm:p-6">
            <p className="eyebrow mb-2">Personal addon</p>
            <h2 className="section-title">Install once, keep it private</h2>
            <p className="section-copy mt-2">Your account-scoped endpoint is ready.</p>
            <div className="mt-5 overflow-x-auto whitespace-nowrap rounded-[18px] border border-white/[0.08] bg-surface-950/70 p-4 font-mono text-sm text-slate-200/80">
              {addonUrl}
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <p className="eyebrow mb-4">Immediate actions</p>
            <div className="grid gap-3">
              <Button onClick={copyUrl} variant={copying ? 'outline' : 'outline'} className={`w-full ${copying ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-50' : ''}`}>
                {copying ? <><Check className="h-4 w-4" /> Copied</> : 'Copy URL'}
              </Button>
              <Button onClick={installInStremio} className="w-full">Install in Stremio</Button>
              <Button asChild variant="outline" className="w-full">
                <Link to="/addon">Open Addon Settings</Link>
              </Button>
            </div>
          </Card>
        </motion.section>
      )}

      {/* Stat cards */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SkeletonCard count={4} type="stat" />
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map(({ label, numVal, sub, icon: Icon, tone }, i) => (
            <motion.div
              key={label}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={i}
            >
              <Card className="p-5 sm:p-6">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <p className="metric-label">{label}</p>
                  <span className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-white/[0.08] bg-white/[0.04]">
                    <Icon className={`h-[18px] w-[18px] ${tone}`} />
                  </span>
                </div>
                {/* Sera UI – NumberTicker for animated stat values */}
                <p className="text-[2rem] font-bold text-white">
                  <NumberTicker
                    value={numVal}
                    duration={1400}
                    delay={i * 80}
                    className="text-[2rem] font-bold text-white"
                  />
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300/65">{sub}</p>
              </Card>
            </motion.div>
          ))}
        </section>
      )}

      {/* Providers + Attention */}
      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow mb-2">Providers</p>
              <h2 className="section-title">{hasByoProviders ? 'Source activity' : 'BYO-first workspace'}</h2>
              <p className="section-copy mt-2">
                {hasByoProviders
                  ? 'Provider health, catalog coverage, and account timing at a glance.'
                  : 'Free access stays hidden and fallback-only. Add your own provider to unlock web browsing and Live TV.'}
              </p>
            </div>
            {!loading && providers.length > 0 && (
              <Button asChild variant="outline" size="sm">
                <Link to="/providers">
                  View all
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>

          {loading ? (
            <div className="grid gap-5"><SkeletonCard count={3} type="provider" /></div>
          ) : providers.length > 0 ? (
            <div className="grid gap-5">
              {providers.slice(0, 4).map(p => <ProviderRow key={p.id} provider={p} />)}
            </div>
          ) : (
            <EmptyState
              icon={Server}
              heading={freeAccess.status === 'active' ? 'Free access is active' : 'No BYO providers connected'}
              description={freeAccess.status === 'active'
                ? 'Managed free access is available as a hidden addon fallback, but the web dashboard and Live TV stay BYO-only.'
                : 'Add your first IPTV provider to unlock dashboard browsing and Live TV. Free access can still be started manually for fallback use.'}
              action={() => window.location.href = '/providers'}
              actionLabel="Add BYO Provider"
            />
          )}
        </div>

        <div className="space-y-5">
          {!hasByoProviders && (
            <Card className="p-5 sm:p-6">
              <p className="eyebrow mb-2">Free access</p>
              <h2 className="section-title">Managed fallback status</h2>
              <div className="mt-4 rounded-[18px] border border-white/[0.07] bg-white/[0.025] p-4">
                <p className="text-sm font-semibold text-white">
                  {freeAccess.status === 'active' ? `Active · ${formatExpiry(freeAccess.expiresAt)}` : freeAccess.status === 'expired' ? 'Expired' : 'Not started'}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300/65">
                  Movies and series can be resolved through the addon, but web browsing and Live TV remain unavailable until you add your own provider.
                </p>
                <Button onClick={handleStartFreeAccess} variant="outline" className="mt-4" disabled={freeAccess.status === 'active'}>
                  {freeAccessActionLabel}
                </Button>
              </div>
            </Card>
          )}

          <Card className="p-5 sm:p-6">
            <p className="eyebrow mb-2">Watch history</p>
            <h2 className="section-title">Recent Stremio activity</h2>
            <div className="mt-5 grid gap-3">
              {watchHistory.length > 0 ? watchHistory.map((item) => (
                <div key={`${item.raw_title}-${item.last_watched_at}`} className="flex items-center gap-3 rounded-[18px] border border-white/[0.07] bg-white/[0.025] p-3">
                  <div className="h-16 w-12 overflow-hidden rounded-[12px] border border-white/[0.08] bg-surface-950/70">
                    {item.poster_url ? (
                      <img src={item.poster_url} alt={item.raw_title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400/55">
                        {item.vod_type || 'vod'}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{item.raw_title}</p>
                    <p className="mt-1 text-xs text-slate-300/55">
                      {item.provider_name || 'Provider unavailable'} · {formatLastWatched(item.last_watched_at)}
                    </p>
                  </div>
                </div>
              )) : (
                <div className="rounded-[18px] border border-white/[0.07] bg-white/[0.025] p-4 text-sm leading-6 text-slate-300/65">
                  Start a movie or episode from Stremio and it will appear here automatically.
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <p className="eyebrow mb-2">Attention</p>
            <h2 className="section-title">What to watch next</h2>
            <div className="mt-5 grid gap-3">
              {[
                { title: 'Expiring providers', desc: hasByoProviders ? (expiringSoon.length ? `${expiringSoon.length} provider${expiringSoon.length !== 1 ? 's are' : ' is'} approaching renewal.` : 'No renewals due inside the next week.') : `Free access is ${freeAccess.status}.` },
                { title: 'Metadata backlog', desc: totalTitles ? `${(totalTitles - totalMatched).toLocaleString()} titles still need matching or review.` : 'Managed free libraries refresh in the background; BYO metrics appear after sync.' },
                { title: 'Next step', desc: hasByoProviders ? 'Review provider details first, then open addon settings once source health is stable.' : 'Start free access for hidden fallback, then add a BYO provider when you want dashboard browsing and Live TV.' },
              ].map(({ title, desc }) => (
                <div key={title} className="rounded-[18px] border border-white/[0.07] bg-white/[0.025] p-4">
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300/65">{desc}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <p className="eyebrow mb-2">Coverage</p>
            <h2 className="section-title">Catalog match progress</h2>
            <div className="mt-5">
              <ProgressBar value={matchRate} max={100} color="bg-brand-500" showLabel label="Matched catalog" />
            </div>
            <div className="surface-divider mt-5 pt-5 text-sm leading-6 text-slate-300/65">
              {hasByoProviders
                ? 'Higher match rates mean posters, titles, and discovery stay usable across the app.'
                : 'Coverage becomes visible in the dashboard once you connect your own provider.'}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
