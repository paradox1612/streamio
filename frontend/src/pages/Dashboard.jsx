import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, Check, Clock, Film, Server, Sparkles, Copy, ExternalLink, Activity,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { providerAPI, userAPI } from '../utils/api';
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
                movieCount: 0, seriesCount: 0,
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
          if (diffDays < 0) toast.error(`⚠️ "${provider.name}" subscription has expired!`, { duration: 8000 });
          else if (diffDays <= 3) toast.error(`🔴 "${provider.name}" expires in ${diffDays} day${diffDays !== 1 ? 's' : ''}!`, { duration: 8000 });
          else if (diffDays <= 7) toast(`⏰ "${provider.name}" expires in ${diffDays} days`, { icon: '⚠️', duration: 6000, style: { background: '#451a03', color: '#fef3c7', border: '1px solid #92400e' } });
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

  // Raw numeric values – rendered via Sera UI NumberTicker
  const stats = [
    { label: 'Providers',     numVal: providers.length,  sub: `${onlineCount} online`,        icon: Server,   tone: 'text-blue-300' },
    { label: 'Total titles',  numVal: totalTitles,        sub: 'Movies & series',               icon: Film,     tone: 'text-cyan-300' },
    { label: 'Matched titles',numVal: totalMatched,       sub: `${matchRate}% of catalog`,      icon: Sparkles, tone: 'text-sky-300'  },
    { label: 'Expiring soon', numVal: expiringSoon.length,sub: 'Within 7 days',                 icon: Clock,    tone: expiringSoon.length > 0 ? 'text-amber-300' : 'text-slate-300/60' },
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
                    Manage Providers
                  </Link>
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: 'Providers online',  numVal: onlineCount,        desc: providers.length ? `${providers.length - onlineCount} need attention.` : 'No providers added yet.' },
                { label: 'Catalog confidence',numVal: matchRate, suffix:'%', desc: `${totalMatched.toLocaleString()} matched titles.` },
                { label: 'Addon status',      display: addonUrl ? 'Ready' : 'Pending', desc: 'Private install path available.' },
                { label: 'Expiring soon',     numVal: expiringSoon.length, desc: 'Providers due within 7 days.' },
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
            <div className="mt-5 overflow-x-auto rounded-[18px] border border-white/[0.08] bg-surface-950/70 p-4 font-mono text-sm text-slate-200/80">
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
              <h2 className="section-title">Source activity</h2>
              <p className="section-copy mt-2">Provider health, catalog coverage, and account timing at a glance.</p>
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
              heading="No providers connected"
              description="Add your first IPTV provider to populate routing, VOD, and Live TV views."
              action={() => window.location.href = '/providers'}
              actionLabel="Add Your First Provider"
            />
          )}
        </div>

        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <p className="eyebrow mb-2">Attention</p>
            <h2 className="section-title">What to watch next</h2>
            <div className="mt-5 grid gap-3">
              {[
                { title: 'Expiring providers', desc: expiringSoon.length ? `${expiringSoon.length} provider${expiringSoon.length !== 1 ? 's are' : ' is'} approaching renewal.` : 'No renewals due inside the next week.' },
                { title: 'Metadata backlog', desc: totalTitles ? `${(totalTitles - totalMatched).toLocaleString()} titles still need matching or review.` : 'Catalog metrics will appear after providers finish syncing.' },
                { title: 'Next step', desc: 'Review provider details first, then open addon settings once source health is stable.' },
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
              Higher match rates mean posters, titles, and discovery stay usable across the app.
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
