'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { providerAPI } from '@/utils/api'
import { ArrowLeft, RefreshCw, PenSquare, Signal, Copy, Check, ExternalLink, AlertCircle, ChevronDown } from 'lucide-react'
import StatusBadge from '@/components/StatusBadge'
import ProgressBar from '@/components/ProgressBar'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '0s'
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

function estimateRemainingMs(progressPct: number, elapsedMs: number) {
  if (!Number.isFinite(progressPct) || progressPct <= 0 || progressPct >= 100) return null
  const totalEstimate = elapsedMs / (progressPct / 100)
  const remaining = totalEstimate - elapsedMs
  return Number.isFinite(remaining) && remaining > 0 ? remaining : null
}

function splitHosts(hosts: string[] = [], activeHost?: string) {
  const uniqueHosts = Array.from(new Set(hosts.filter(Boolean)))
  const primaryHost = activeHost || uniqueHosts[0] || ''
  return {
    activeHost: primaryHost,
    standbyHosts: uniqueHosts.filter((host) => host !== primaryHost),
  }
}

const MAX_PROVIDER_HOSTS = 30

export default function ProviderDetailPage() {
  const params = useParams()
  const id = params.id as string

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [provider, setProvider] = useState<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [stats, setStats] = useState<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [health, setHealth] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [categories, setCategories] = useState<any[]>([])
  const [form, setForm] = useState({ name: '', hostsInput: '', username: '', password: '' })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [rechecking, setRechecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [copying, setCopying] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [refreshJob, setRefreshJob] = useState<any>(null)
  const [refreshNow, setRefreshNow] = useState(Date.now())
  const lastRefreshStatusRef = useRef<string | null>(null)

  const load = async () => {
    try {
      const [provRes, statsRes, healthRes] = await Promise.all([
        providerAPI.get(id),
        providerAPI.getStats(id),
        providerAPI.getHealth(id),
      ])
      setProvider(provRes.data)
      setForm({
        name: provRes.data.name || '',
        hostsInput: (provRes.data.hosts || []).join('\n'),
        username: provRes.data.username || '',
        password: '',
      })
      setStats(statsRes.data)
      setHealth(healthRes.data)
      setCategories(statsRes.data.categories || [])
    } catch {
      toast.error('Failed to load provider details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id]) // eslint-disable-line

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const poll = async () => {
      try {
        const { data } = await providerAPI.getRefreshStatus(id)
        if (!cancelled) {
          setRefreshJob(data)
          if (data.active) setRefreshNow(Date.now())
        }
      } catch {
        if (!cancelled) setRefreshJob(null)
      } finally {
        if (!cancelled) timer = setTimeout(poll, 3000)
      }
    }

    poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [id])

  useEffect(() => {
    if (!refreshJob?.active) return
    const interval = setInterval(() => setRefreshNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [refreshJob?.active])

  useEffect(() => {
    const previousStatus = lastRefreshStatusRef.current
    const currentStatus = refreshJob?.status || null
    if (previousStatus === 'running' && currentStatus === 'success') {
      load()
      toast.success('Catalog refresh complete')
    }
    if (previousStatus === 'running' && currentStatus === 'failed' && refreshJob?.errorMessage) {
      toast.error(refreshJob.errorMessage)
    }
    lastRefreshStatusRef.current = currentStatus
  }, [refreshJob]) // eslint-disable-line

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopying(label)
      toast.success(`${label} copied`)
      setTimeout(() => setCopying(null), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const hosts = form.hostsInput
      .split('\n')
      .map((h) => h.trim().replace(/\/+$/, ''))
      .filter(Boolean)
    if (!form.name.trim()) return toast.error('Provider name is required')
    if (!hosts.length) return toast.error('Enter at least one host URL')
    if (hosts.length > MAX_PROVIDER_HOSTS) return toast.error(`You can add up to ${MAX_PROVIDER_HOSTS} hosts per provider`)
    if (!form.username.trim()) return toast.error('Username is required')

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      hosts,
      username: form.username.trim(),
    }
    if (form.password.trim()) payload.password = form.password

    setSaving(true)
    try {
      await providerAPI.update(id, payload)
      await load()
      setEditing(false)
      toast.success('Provider updated')
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setForm({
      name: provider?.name || '',
      hostsInput: (provider?.hosts || []).join('\n'),
      username: provider?.username || '',
      password: '',
    })
    setEditing(false)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const res = await providerAPI.refresh(id)
      if (res.data.started) {
        toast.success('Catalog refresh started in background')
      } else {
        toast('Catalog refresh is already running', { icon: '⏳' })
      }
      const statusRes = await providerAPI.getRefreshStatus(id)
      setRefreshJob(statusRes.data)
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  const handleRecheck = async () => {
    setRechecking(true)
    try {
      const res = await providerAPI.recheckHealth(id)
      if (res.data.started) {
        toast.success('Health recheck started in background')
        setTimeout(() => {
          load()
        }, 12000)
      } else {
        toast('Health recheck is already running', { icon: '⏳' })
      }
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Recheck failed')
    } finally {
      setRechecking(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="panel p-8 text-center text-slate-300/70">Loading provider details...</div>
      </div>
    )
  }
  if (!provider) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="panel p-8 text-center text-slate-300/70">Provider not found</div>
      </div>
    )
  }

  const vodStats = stats?.vodStats || {}
  const matchStats = stats?.matchStats || {}
  const matchRate = matchStats.total > 0 ? Math.round((matchStats.matched / matchStats.total) * 100) : 0
  const refreshMeta = refreshJob?.metadata || {}
  const refreshProgress = Math.max(0, Math.min(100, refreshMeta.progressPct || 0))
  const refreshStartedAt = refreshJob?.startedAt || refreshMeta.startedAt
  const refreshElapsedMs = refreshStartedAt
    ? Math.max(refreshNow - new Date(refreshStartedAt).getTime(), 0)
    : 0
  const refreshRemainingMs = refreshJob?.active
    ? estimateRemainingMs(refreshProgress, refreshElapsedMs)
    : null

  const activeHost = provider.active_host || (provider.hosts && provider.hosts[0]) || ''
  const { standbyHosts } = splitHosts(provider.hosts || [], activeHost)
  const m3uUrl = activeHost ? `${activeHost}/get.php?username=${encodeURIComponent(provider.username)}&password=${encodeURIComponent(provider.password || '')}&type=m3u_plus&output=ts` : ''
  const activeHealth = health.find((entry) => entry.host_url === activeHost) || null
  const standbyHealth = health.filter((entry) => entry.host_url !== activeHost)

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <Link
        href="/providers"
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300/[0.72] transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Providers
      </Link>

      <section className="panel overflow-hidden p-5 sm:p-7 lg:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="kicker mb-4">Provider Detail</div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">{provider.name}</h1>
              <StatusBadge status={provider.status} pulse={provider.status === 'online'} />
            </div>
            <p className="hero-copy mt-3 break-all">{provider.active_host || 'No active host selected yet'}</p>
            {standbyHosts.length > 0 && (
              <details className="group mt-4 max-w-2xl rounded-2xl border border-white/[0.08] bg-white/[0.03]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm text-slate-200">
                  <span>Show {standbyHosts.length} standby host{standbyHosts.length === 1 ? '' : 's'}</span>
                  <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-2 border-t border-white/[0.07] px-4 py-3">
                  {standbyHosts.map((host) => (
                    <p key={host} className="break-all font-mono text-xs text-slate-300/75">
                      {host}
                    </p>
                  ))}
                </div>
              </details>
            )}
          </div>
          <div className="grid gap-3 sm:flex sm:flex-wrap">
            {!editing && (
              <button onClick={() => setEditing(true)} className="btn-secondary w-full sm:w-auto">
                <PenSquare className="h-4 w-4" />
                Edit
              </button>
            )}
            <button onClick={handleRecheck} disabled={rechecking} className="btn-secondary w-full sm:w-auto">
              <Signal className="h-4 w-4" />
              {rechecking ? 'Checking...' : 'Recheck Health'}
            </button>
            <button onClick={handleRefresh} disabled={refreshing} className="btn-primary w-full sm:w-auto">
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              {refreshing ? 'Refreshing...' : 'Refresh Catalog'}
            </button>
          </div>
        </div>
      </section>

      {/* Connection Details Section */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="panel-soft p-5 sm:p-8">
          <div className="flex items-center gap-2 text-brand-400 mb-2">
            <Signal className="h-4 w-4" />
            <p className="eyebrow !mb-0">IPTV Player Login</p>
          </div>
          <h2 className="section-title">Xtream API Details</h2>
          <p className="mt-2 text-sm text-slate-400">Use these in apps like Tivimate, Sparkle, or VLC.</p>
          
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-white/[0.08] bg-surface-950/40 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Host URL</p>
                  <p className="truncate font-mono text-sm text-slate-200">{activeHost || 'No host available'}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleCopy(activeHost, 'Host')} disabled={!activeHost}>
                  {copying === 'Host' ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/[0.08] bg-surface-950/40 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Username</p>
                    <p className="truncate font-mono text-sm text-slate-200">{provider.username}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleCopy(provider.username, 'Username')}>
                    {copying === 'Username' ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-surface-950/40 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Password</p>
                    <p className="truncate font-mono text-sm text-slate-200">••••••••</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleCopy(provider.password || '', 'Password')} disabled={!provider.password}>
                    {copying === 'Password' ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel-soft p-5 sm:p-8">
          <div className="flex items-center gap-2 text-cyan-400 mb-2">
            <ExternalLink className="h-4 w-4" />
            <p className="eyebrow !mb-0">Playlist Link</p>
          </div>
          <h2 className="section-title">M3U Plus URL</h2>
          <p className="mt-2 text-sm text-slate-400">Direct playlist URL for players that don&apos;t support Xtream API.</p>
          
          <div className="mt-6">
            <div className="rounded-2xl border border-white/[0.08] bg-surface-950/40 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">M3U URL</p>
                  <p className="break-all font-mono text-xs text-slate-300/80 leading-relaxed">
                    {m3uUrl || 'No host available to generate URL'}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleCopy(m3uUrl, 'M3U URL')} disabled={!m3uUrl}>
                    {copying === 'M3U URL' ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-500 leading-relaxed">
              <AlertCircle className="h-3 w-3 inline mr-1" />
              This URL contains your credentials. Keep it private. Use &quot;M3U Plus&quot; format for better organization.
            </p>
          </div>
        </div>
      </section>

      {(refreshJob?.active || refreshJob?.status === 'failed') && (
        <section className="panel-soft p-5 sm:p-8">
          <p className="eyebrow mb-2">Catalog Refresh</p>
          <h2 className="section-title">
            {refreshJob?.active
              ? 'Provider ingest is running in the background'
              : 'Latest catalog refresh failed'}
          </h2>
          <div className="mt-5">
            <ProgressBar
              value={refreshJob?.active ? refreshProgress : 100}
              max={100}
              color={refreshJob?.active ? 'bg-brand-500' : 'bg-red-500'}
              showLabel
              label={
                refreshJob?.active
                  ? refreshMeta.message || 'Refreshing catalog'
                  : refreshJob?.errorMessage || 'Refresh failed'
              }
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-300/[0.68]">
            {refreshJob?.active && <span>Elapsed: {formatDuration(refreshElapsedMs)}</span>}
            {refreshJob?.active && refreshRemainingMs !== null && (
              <span>Estimated remaining: {formatDuration(refreshRemainingMs)}</span>
            )}
            {refreshMeta.counts?.total > 0 && (
              <span>Total titles: {refreshMeta.counts.total.toLocaleString()}</span>
            )}
            {Number.isFinite(refreshMeta.counts?.persisted) && refreshMeta.counts?.total > 0 && (
              <span>
                Saved: {refreshMeta.counts.persisted.toLocaleString()} /{' '}
                {refreshMeta.counts.total.toLocaleString()}
              </span>
            )}
          </div>
        </section>
      )}

      {editing && (
        <section className="panel-soft p-5 sm:p-8">
          <p className="eyebrow mb-2">Edit Configuration</p>
          <h2 className="section-title">Provider credentials and hosts</h2>
          <form onSubmit={handleSave} className="mt-6 grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="field-label">Provider Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Username</label>
                <input
                  value={form.username}
                  onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                  className="field-input"
                />
              </div>
            </div>
            <div>
              <label className="field-label">Host URLs</label>
              <textarea
                value={form.hostsInput}
                onChange={(e) => setForm((prev) => ({ ...prev, hostsInput: e.target.value }))}
                className="field-input min-h-[140px] resize-y"
              />
              <p className="mt-2 text-xs text-slate-400/70">One host per line, up to 30 total.</p>
            </div>
            <div>
              <label className="field-label">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Leave blank to keep current password"
                className="field-input"
              />
            </div>
            <div className="grid gap-3 sm:flex sm:flex-wrap sm:justify-end">
              <button type="button" onClick={handleCancelEdit} disabled={saving} className="btn-secondary w-full sm:w-auto">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn-primary w-full sm:w-auto">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Movies', value: parseInt(vodStats.movie_count || 0, 10).toLocaleString() },
          { label: 'Series', value: parseInt(vodStats.series_count || 0, 10).toLocaleString() },
          { label: 'Categories', value: vodStats.category_count || 0 },
          { label: 'Match Rate', value: `${matchRate}%` },
          { label: 'Unmatched', value: parseInt(matchStats.unmatched || 0, 10).toLocaleString() },
        ].map((s) => (
          <div key={s.label} className="panel-soft p-4 sm:p-5">
            <p className="metric-label mb-2">{s.label}</p>
            <p className="text-3xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="panel-soft p-5 sm:p-8">
          <p className="eyebrow mb-2">Matching</p>
          <h2 className="section-title">Catalog confidence</h2>
          <div className="mt-6">
            <ProgressBar value={matchRate} max={100} color="bg-brand-500" label="Matched Titles" showLabel />
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-300/[0.68]">
            {parseInt(matchStats.matched || 0, 10).toLocaleString()} matched out of{' '}
            {parseInt(matchStats.total || 0, 10).toLocaleString()} titles.
          </p>
        </div>

        <div className="panel-soft p-5 sm:p-8">
          <p className="eyebrow mb-2">Hosts</p>
          <h2 className="section-title">Health status</h2>
          <div className="mt-5 space-y-4">
            {health.length === 0 ? (
              <p className="text-sm text-slate-300/[0.68]">
                No health data yet. Run a recheck to populate response times and status.
              </p>
            ) : (
              <>
                <div className="rounded-[22px] border border-emerald-400/20 bg-emerald-500/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200/80">
                        Active host
                      </p>
                      <p className="mt-2 break-all text-sm font-semibold text-white">{activeHost || 'No active host selected'}</p>
                      <p className="mt-1 text-xs text-slate-300/55">
                        {activeHealth?.last_checked ? new Date(activeHealth.last_checked).toLocaleString() : 'Not checked yet'}
                      </p>
                    </div>
                    <StatusBadge status={activeHealth?.status || provider.status || 'unknown'} />
                  </div>
                  <div className="mt-3 flex flex-col gap-2 text-sm text-slate-300/[0.68] sm:flex-row sm:items-center sm:justify-between">
                    <span>{activeHealth?.response_time_ms ? `${activeHealth.response_time_ms}ms response` : 'No response time'}</span>
                    <span>Current routing target</span>
                  </div>
                </div>

                {standbyHealth.length > 0 && (
                  <details className="group rounded-[22px] border border-white/[0.08] bg-white/[0.03]">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm text-slate-200">
                      <span>Show {standbyHealth.length} standby host{standbyHealth.length === 1 ? '' : 's'}</span>
                      <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="space-y-3 border-t border-white/[0.07] px-4 py-3">
                      {standbyHealth.map((h) => (
                        <div key={h.id} className="rounded-[18px] border border-white/[0.08] bg-surface-950/30 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="break-all text-sm font-semibold text-white">{h.host_url}</p>
                              <p className="mt-1 text-xs text-slate-300/55">
                                {h.last_checked ? new Date(h.last_checked).toLocaleString() : 'Not checked yet'}
                              </p>
                            </div>
                            <StatusBadge status={h.status} />
                          </div>
                          <div className="mt-3 flex flex-col gap-2 text-sm text-slate-300/[0.68] sm:flex-row sm:items-center sm:justify-between">
                            <span>{h.response_time_ms ? `${h.response_time_ms}ms response` : 'No response time'}</span>
                            <span>Standby host</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {categories.length > 0 && (
        <section className="panel-soft p-5 sm:p-8">
          <p className="eyebrow mb-2">Catalog Layout</p>
          <h2 className="section-title">Category breakdown</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {categories.slice(0, 30).map((cat) => (
              <div
                key={`${cat.category}-${cat.vod_type}`}
                className="flex items-center justify-between rounded-[20px] border border-white/[0.08] bg-white/[0.03] px-4 py-3"
              >
                <span className="min-w-0 flex-1 text-sm text-slate-200/[0.82]">
                  {cat.category} <span className="text-xs text-slate-300/50">({cat.vod_type})</span>
                </span>
                <span className="ml-3 text-sm font-bold text-brand-300">
                  {parseInt(cat.count, 10).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
