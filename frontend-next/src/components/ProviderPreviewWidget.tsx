'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle, ArrowRight, Calendar, CheckCircle2, Clock, Film,
  Globe, Layers, Loader2, Radio, Server, ShieldCheck,
  Tv2, Wifi, Zap,
} from 'lucide-react'
import { previewAPI } from '@/utils/api'
import ShimmerButton from '@/components/sera/ShimmerButton'

export const PENDING_PROVIDER_KEY = 'sb_pending_provider'

function deriveProviderName(host: string) {
  try {
    const url = new URL(host.startsWith('http') ? host : `http://${host}`)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return 'My Provider'
  }
}

function formatCount(n: number | undefined | null) {
  if (!n && n !== 0) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function latencyLabel(ms: number | undefined | null) {
  if (ms == null) return { text: '—', tone: 'text-slate-400' }
  if (ms < 200) return { text: `${ms}ms`, tone: 'text-emerald-300' }
  if (ms < 600) return { text: `${ms}ms`, tone: 'text-amber-300' }
  return { text: `${ms}ms`, tone: 'text-red-300' }
}

function latencyQuality(ms: number | undefined | null) {
  if (ms == null) return 'Unknown'
  if (ms < 200) return 'Excellent'
  if (ms < 600) return 'Good'
  return 'High latency'
}

const CAT_COLORS = [
  'bg-sky-500/15 text-sky-300/80 border-sky-400/20',
  'bg-violet-500/15 text-violet-300/80 border-violet-400/20',
  'bg-emerald-500/15 text-emerald-300/80 border-emerald-400/20',
  'bg-amber-500/15 text-amber-300/80 border-amber-400/20',
  'bg-rose-500/15 text-rose-300/80 border-rose-400/20',
  'bg-cyan-500/15 text-cyan-300/80 border-cyan-400/20',
  'bg-fuchsia-500/15 text-fuchsia-300/80 border-fuchsia-400/20',
  'bg-teal-500/15 text-teal-300/80 border-teal-400/20',
]

function catColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return CAT_COLORS[Math.abs(hash) % CAT_COLORS.length]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SampleGroup({ items, emptyText }: { items: any[]; emptyText: string }) {
  if (!items || items.length === 0) {
    return <p className="text-xs italic text-slate-500/50">{emptyText}</p>
  }
  const grouped: Record<string, string[]> = {}
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = []
    grouped[item.category].push(item.name)
  }
  return (
    <div className="space-y-2.5">
      {Object.entries(grouped).map(([cat, names]) => (
        <div key={cat} className="flex flex-wrap items-center gap-2">
          <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${catColor(cat)}`}>
            {cat}
          </span>
          {names.slice(0, 4).map((name) => (
            <span key={name} className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-xs text-slate-300/65">
              {name}
            </span>
          ))}
          {names.length > 4 && <span className="text-[11px] text-slate-500/45">+{names.length - 4} more</span>}
        </div>
      ))}
    </div>
  )
}

function InputForm({
  onSubmit,
  loading,
  error,
}: {
  onSubmit: (host: string, username: string, password: string) => void
  loading: boolean
  error: string | null
}) {
  const [host, setHost] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (host.trim() && username.trim() && password) {
      onSubmit(host.trim(), username.trim(), password)
    }
  }

  const inputClass =
    'w-full rounded-xl border border-white/[0.16] bg-slate-950/72 px-4 py-3 text-sm text-white outline-none ring-0 transition placeholder:text-slate-400/70 hover:border-white/[0.24] focus:border-brand-400/60 focus:bg-slate-950/88 focus:ring-2 focus:ring-brand-400/20'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-200/78">Provider Host URL</label>
          <input type="text" value={host} onChange={(e) => setHost(e.target.value)} placeholder="http://your-provider.com:8080" required className={inputClass} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-200/78">Username</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" required autoComplete="off" className={inputClass} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-200/78">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="new-password" className={inputClass} />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading || !host || !username || !password}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-400/30 bg-brand-500/20 px-4 py-2.5 text-sm font-semibold text-brand-200 transition hover:border-brand-400/50 hover:bg-brand-500/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Scanning…</>
            ) : (
              <><Zap className="h-4 w-4" /> Preview Provider</>
            )}
          </button>
        </div>
      </div>
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2.5 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300/90"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </motion.div>
      )}
      <p className="text-[11px] leading-5 text-slate-400/72">
        <ShieldCheck className="mr-1 inline-block h-3 w-3 align-[-1px]" />
        Your credentials are used only for this preview. Nothing is stored unless you create an account.
      </p>
    </form>
  )
}

function PreviewResults({
  data,
  providerHost,
  onReset,
  onSignup,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
  providerHost: string
  onReset: () => void
  onSignup: () => void
}) {
  const { latencyMs, accountInfo, serverInfo, counts, liveSample, vodSample } = data
  const { text: latText, tone: latTone } = latencyLabel(latencyMs)
  const expiryDate = accountInfo.expiresAt ? new Date(accountInfo.expiresAt) : null
  // eslint-disable-next-line react-hooks/purity
  const daysLeft = expiryDate ? Math.ceil((expiryDate.getTime() - Date.now()) / 86400000) : null
  const isExpiringSoon = daysLeft !== null && daysLeft <= 30

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
      className="space-y-5"
    >
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.07] px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border border-emerald-400/25 bg-emerald-500/15">
          <Wifi className="h-4 w-4 text-emerald-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{providerHost}</p>
          <p className="text-xs text-slate-400/70">
            {serverInfo?.timezone ? `${serverInfo.timezone} · ` : ''}
            {accountInfo.status === 'Active' || accountInfo.status === 'active' ? 'Connected & authenticated' : accountInfo.status}
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1">
          <Zap className={`h-3 w-3 ${latTone}`} />
          <span className={`text-xs font-bold ${latTone}`}>{latText}</span>
          <span className="text-[10px] text-slate-500/60">{latencyQuality(latencyMs)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: Tv2, label: 'Live Channels', value: formatCount(counts.live), tone: 'text-brand-300' },
          { icon: Film, label: 'Movies', value: formatCount(counts.movies), tone: 'text-white' },
          { icon: Layers, label: 'Series', value: formatCount(counts.series), tone: 'text-white' },
          {
            icon: Calendar,
            label: 'Expires',
            value: expiryDate ? expiryDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
            tone: isExpiringSoon ? 'text-amber-300' : 'text-white',
            small: true,
          },
        ].map(({ icon: Icon, label, value, tone, small }) => (
          <div key={label} className="flex flex-col gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5">
            <Icon className="h-4 w-4 text-slate-400/50" />
            <p className={`font-bold leading-none ${tone} ${small ? 'text-sm' : 'text-xl'}`}>{value}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400/50">{label}</p>
          </div>
        ))}
      </div>

      {(serverInfo?.host || serverInfo?.port || accountInfo?.maxConnections) && (
        <div className="flex flex-wrap gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          {serverInfo?.host && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400/65">
              <Server className="h-3.5 w-3.5 text-slate-500/60" />
              <span className="font-medium text-slate-300/80">Hosted on</span>
              <span className="font-mono text-slate-400/70">{serverInfo.host}</span>
            </div>
          )}
          {serverInfo?.port && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400/65">
              <Globe className="h-3.5 w-3.5 text-slate-500/60" />
              <span className="font-medium text-slate-300/80">Port</span>
              <span className="font-mono text-slate-400/70">{serverInfo.port}</span>
              {serverInfo.httpsPort && <span className="font-mono text-slate-400/70">· HTTPS {serverInfo.httpsPort}</span>}
            </div>
          )}
          {accountInfo?.maxConnections != null && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400/65">
              <Radio className="h-3.5 w-3.5 text-slate-500/60" />
              <span className="font-medium text-slate-300/80">Connections</span>
              <span className="text-slate-400/70">{accountInfo.activeConnections ?? 0} / {accountInfo.maxConnections} active</span>
            </div>
          )}
          {accountInfo?.isTrial && (
            <div className="flex items-center gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5 text-amber-400/60" />
              <span className="font-semibold text-amber-300/80">Trial account</span>
            </div>
          )}
        </div>
      )}

      {liveSample && liveSample.length > 0 && (
        <div>
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400/60">
            <Tv2 className="h-3.5 w-3.5" /> Live TV sample
          </p>
          <SampleGroup items={liveSample} emptyText="No live channels found" />
        </div>
      )}

      {vodSample && vodSample.length > 0 && (
        <div>
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400/60">
            <Film className="h-3.5 w-3.5" /> Movies &amp; Series sample
          </p>
          <SampleGroup items={vodSample} emptyText="No VOD content found" />
        </div>
      )}

      <div className="rounded-2xl border border-brand-400/20 bg-brand-500/[0.08] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-bold text-white">Create your free account to keep this and add to Stremio</p>
            <p className="mt-1 text-sm leading-6 text-slate-300/65">
              Your {formatCount(counts.total)} titles get a private install URL — one tap to add to Stremio, no manual config.
            </p>
            <ul className="mt-3 space-y-1.5">
              {[
                'Free account — no credit card',
                'Private Stremio addon URL ready in seconds',
                'Provider health monitoring + metadata repair included',
              ].map((pt) => (
                <li key={pt} className="flex items-center gap-2 text-xs text-slate-300/70">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-brand-300" />
                  {pt}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <ShimmerButton className="text-sm font-semibold" onClick={onSignup}>
              Create Free Account <ArrowRight className="ml-1 inline-block h-4 w-4" />
            </ShimmerButton>
            <button
              type="button"
              onClick={onReset}
              className="text-center text-xs text-slate-500/60 transition hover:text-slate-400/80"
            >
              Try a different provider
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default function ProviderPreviewWidget() {
  const [state, setState] = useState<'idle' | 'loading' | 'result'>('idle')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [previewData, setPreviewData] = useState<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pendingCreds, setPendingCreds] = useState<any>(null)
  const [providerHost, setProviderHost] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(host: string, username: string, password: string) {
    setState('loading')
    setError(null)
    try {
      const normalizedHost = host.startsWith('http') ? host : `http://${host}`
      const res = await previewAPI.check(normalizedHost, username, password)
      const pending = {
        host: normalizedHost.replace(/\/+$/, ''),
        username,
        password,
        name: deriveProviderName(normalizedHost),
      }
      setPendingCreds(pending)
      setProviderHost(deriveProviderName(normalizedHost))
      setPreviewData(res.data)
      setState('result')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string }; status?: number } }).response?.data?.error ||
        ((err as { response?: { status?: number } }).response?.status === 429
          ? 'Too many attempts — please wait a few minutes.'
          : 'Could not connect to your provider. Check the host URL and credentials.')
      setError(msg)
      setState('idle')
    }
  }

  function handleSignupClick() {
    if (pendingCreds) {
      try {
        sessionStorage.setItem(PENDING_PROVIDER_KEY, JSON.stringify(pendingCreds))
      } catch {}
    }
    window.location.href = '/signup'
  }

  function handleReset() {
    setState('idle')
    setPreviewData(null)
    setPendingCreds(null)
    setProviderHost('')
    setError(null)
  }

  return (
    <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.025] p-6 sm:p-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.04]">
            <Layers className="h-4 w-4 text-brand-300" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400/60">Try it with your provider</p>
        </div>
        <h3 className="text-xl font-bold text-white">See your actual channels before signing up</h3>
        <p className="mt-1.5 text-sm leading-6 text-slate-300/65">
          Paste your Xtream credentials — StreamBridge checks the connection, measures latency, and pulls a live preview of your catalog.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {state !== 'result' ? (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
            <InputForm onSubmit={handleSubmit} loading={state === 'loading'} error={error} />
          </motion.div>
        ) : (
          <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <PreviewResults data={previewData} providerHost={providerHost} onReset={handleReset} onSignup={handleSignupClick} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
