import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Tv2, Film, Layers, CheckCircle2,
  AlertCircle, Loader2, ShieldCheck, Calendar, Wifi,
} from 'lucide-react';
import { previewAPI } from '../utils/api';
import ShimmerButton from './sera/ShimmerButton';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatExpiry(isoDate) {
  if (!isoDate) return 'No expiry';
  const d = new Date(isoDate);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCount(n) {
  if (!n) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// Palette of subtle category pill colors
const CAT_COLORS = [
  'bg-sky-500/15 text-sky-300/80 border-sky-400/20',
  'bg-violet-500/15 text-violet-300/80 border-violet-400/20',
  'bg-emerald-500/15 text-emerald-300/80 border-emerald-400/20',
  'bg-amber-500/15 text-amber-300/80 border-amber-400/20',
  'bg-rose-500/15 text-rose-300/80 border-rose-400/20',
  'bg-cyan-500/15 text-cyan-300/80 border-cyan-400/20',
  'bg-fuchsia-500/15 text-fuchsia-300/80 border-fuchsia-400/20',
  'bg-teal-500/15 text-teal-300/80 border-teal-400/20',
];

function catColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return CAT_COLORS[Math.abs(hash) % CAT_COLORS.length];
}

// ── Sub-components ───────────────────────────────────────────────────────────

function InputForm({ onSubmit, loading, error }) {
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (host.trim() && username.trim() && password) {
      onSubmit(host.trim(), username.trim(), password);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <label className="block mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400/70">
            Provider Host URL
          </label>
          <input
            type="text"
            value={host}
            onChange={e => setHost(e.target.value)}
            placeholder="http://your-provider.com:8080"
            required
            className="w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-slate-500/60 outline-none ring-0 transition focus:border-brand-400/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-brand-400/20"
          />
        </div>
        <div>
          <label className="block mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400/70">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="username"
            required
            autoComplete="off"
            className="w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-slate-500/60 outline-none ring-0 transition focus:border-brand-400/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-brand-400/20"
          />
        </div>
        <div>
          <label className="block mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400/70">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="new-password"
            className="w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-slate-500/60 outline-none ring-0 transition focus:border-brand-400/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-brand-400/20"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading || !host || !username || !password}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-brand-400/30 bg-brand-500/20 px-4 py-2.5 text-sm font-semibold text-brand-200 transition hover:bg-brand-500/30 hover:border-brand-400/50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Scanning…</>
              : <><Tv2 className="h-4 w-4" /> Preview My Channels</>
            }
          </button>
        </div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2.5 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300/90"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </motion.div>
      )}

      <p className="text-[11px] leading-5 text-slate-500/60">
        <ShieldCheck className="inline-block h-3 w-3 mr-1 align-[-1px]" />
        Your credentials are used only for this preview. Nothing is stored unless you create an account.
      </p>
    </form>
  );
}

function PreviewResults({ data, onReset }) {
  const { accountInfo, counts, channelSample } = data;

  // Group channelSample by category for display
  const grouped = {};
  for (const ch of channelSample) {
    if (!grouped[ch.category]) grouped[ch.category] = [];
    grouped[ch.category].push(ch.name);
  }

  const expiryDate = accountInfo.expiresAt ? new Date(accountInfo.expiresAt) : null;
  const daysLeft = expiryDate ? Math.ceil((expiryDate - Date.now()) / 86400000) : null;
  const isExpiringSoon = daysLeft !== null && daysLeft <= 30;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-6"
    >
      {/* Account status strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            icon: Wifi,
            label: 'Status',
            value: accountInfo.status || 'Active',
            tone: 'text-emerald-300',
          },
          {
            icon: Calendar,
            label: 'Expires',
            value: formatExpiry(accountInfo.expiresAt),
            tone: isExpiringSoon ? 'text-amber-300' : 'text-white',
          },
          {
            icon: Tv2,
            label: 'Live Channels',
            value: formatCount(counts.live),
            tone: 'text-brand-300',
          },
          {
            icon: Film,
            label: 'Movies & Series',
            value: formatCount(counts.movies + counts.series),
            tone: 'text-white',
          },
        ].map(({ icon: Icon, label, value, tone }) => (
          <div
            key={label}
            className="flex flex-col gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5"
          >
            <Icon className="h-4 w-4 text-slate-400/60" />
            <p className={`text-xl font-bold leading-none ${tone}`}>{value}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400/55">{label}</p>
          </div>
        ))}
      </div>

      {/* Channel sample */}
      {channelSample.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400/60">
            Sample from your catalog
          </p>
          <div className="space-y-3">
            {Object.entries(grouped).map(([cat, names]) => (
              <div key={cat} className="flex flex-wrap items-center gap-2">
                <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${catColor(cat)}`}>
                  {cat}
                </span>
                {names.slice(0, 4).map(name => (
                  <span
                    key={name}
                    className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-xs text-slate-300/70"
                  >
                    {name}
                  </span>
                ))}
                {names.length > 4 && (
                  <span className="text-xs text-slate-500/50">+{names.length - 4} more</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The CTA */}
      <div className="rounded-2xl border border-brand-400/20 bg-brand-500/[0.08] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-bold text-white">
              Create your free account to keep this and add to Stremio
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-300/65">
              Your {formatCount(counts.total)} titles get a private install URL — one tap to add to Stremio, no manual config.
            </p>
            <ul className="mt-3 space-y-1.5">
              {[
                'Free account, no credit card',
                'Private Stremio addon URL ready in seconds',
                'Provider health monitoring + metadata repair included',
              ].map(pt => (
                <li key={pt} className="flex items-center gap-2 text-xs text-slate-300/70">
                  <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-brand-300" />
                  {pt}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <ShimmerButton
              className="text-sm font-semibold"
              onClick={() => window.location.href = '/signup'}
            >
              Create Free Account <ArrowRight className="h-4 w-4 inline-block ml-1" />
            </ShimmerButton>
            <button
              onClick={onReset}
              className="text-center text-xs text-slate-500/60 hover:text-slate-400/80 transition"
            >
              Try a different provider
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main Widget ───────────────────────────────────────────────────────────────

export default function ProviderPreviewWidget() {
  const [state, setState] = useState('idle'); // idle | loading | result | error
  const [previewData, setPreviewData] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(host, username, password) {
    setState('loading');
    setError(null);
    try {
      const res = await previewAPI.check(host, username, password);
      setPreviewData(res.data);
      setState('result');
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        (err.response?.status === 429
          ? 'Too many attempts — please wait a few minutes and try again.'
          : 'Could not connect to your provider. Check the host URL and credentials.');
      setError(msg);
      setState('idle');
    }
  }

  function handleReset() {
    setState('idle');
    setPreviewData(null);
    setError(null);
  }

  return (
    <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.025] p-6 sm:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.04]">
            <Layers className="h-4 w-4 text-brand-300" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400/60">
            Try it with your provider
          </p>
        </div>
        <h3 className="text-xl font-bold text-white">
          See your actual channels before signing up
        </h3>
        <p className="mt-1.5 text-sm leading-6 text-slate-300/65">
          Paste your Xtream credentials and StreamBridge will scan your catalog in seconds — live channels, movies, and series.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {state !== 'result' ? (
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <InputForm
              onSubmit={handleSubmit}
              loading={state === 'loading'}
              error={error}
            />
          </motion.div>
        ) : (
          <motion.div
            key="result"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <PreviewResults data={previewData} onReset={handleReset} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
