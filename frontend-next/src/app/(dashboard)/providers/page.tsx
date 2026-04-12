'use client'

import React, { useState, useEffect, useRef, Suspense } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useRouter, useSearchParams } from 'next/navigation'
import { providerAPI } from '@/utils/api'
import { Plus, Check, RefreshCw, Signal, Trash2, ArrowRight, Sparkles, ShoppingCart } from 'lucide-react'
import StatusBadge from '@/components/StatusBadge'
import EmptyState from '@/components/EmptyState'
import ConfirmDialog from '@/components/ConfirmDialog'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'

interface Provider {
  id: string
  name: string
  status: string
  active_host?: string
  hosts?: string[]
  vod_count?: number | string
  matched_count?: number | string
  last_checked?: string
}

function AddProviderModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (p: Provider) => void }) {
  const [form, setForm] = useState({ name: '', hostsInput: '', username: '', password: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const hosts = form.hostsInput.split('\n').map(h => h.trim()).filter(Boolean)
    if (!hosts.length) return toast.error('Enter at least one host URL')
    setLoading(true)
    try {
      const res = await providerAPI.create({ name: form.name, hosts, username: form.username, password: form.password })
      toast.success('IPTV provider added')
      onAdded(res.data)
      setForm({ name: '', hostsInput: '', username: '', password: '' })
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed to add provider')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="mb-1">
            <Badge variant="brand" className="mb-3">New Provider</Badge>
          </div>
          <DialogTitle>Add IPTV provider</DialogTitle>
          <DialogDescription>
            Enter your IPTV login details. StreamBridge will connect automatically and keep everything working.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Provider name</Label>
              <Input required placeholder="My IPTV" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Username</Label>
              <Input required placeholder="your username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Server address</Label>
            <textarea
              className="flex min-h-[120px] w-full resize-y rounded-2xl border border-white/10 bg-surface-900/80 px-4 py-3 text-sm text-white placeholder:text-slate-400/55 transition-all duration-200 focus:outline-none focus:border-brand-500/40 focus:shadow-[0_0_0_3px_rgba(20,145,255,0.15)]"
              required
              placeholder={'http://provider1.com\nhttp://provider2.com'}
              value={form.hostsInput}
              onChange={e => setForm(f => ({ ...f, hostsInput: e.target.value }))}
            />
            <p className="text-xs text-slate-300/50">Paste one address per line. StreamBridge picks the best one automatically.</p>
          </div>

          <div className="space-y-2">
            <Label>Password</Label>
            <Input type="password" required placeholder="your password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Adding…
                </span>
              ) : (
                <><Plus className="h-4 w-4" />Add Provider</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ProviderRow({ provider, onRefresh, onDelete }: { provider: Provider; onRefresh: () => void; onDelete: (p: Provider) => void }) {
  const [loading, setLoading] = useState('')
  const online = provider.status === 'online'
  const matchRate = provider.vod_count && provider.matched_count
    ? Math.round((parseInt(String(provider.matched_count), 10) / parseInt(String(provider.vod_count), 10)) * 100)
    : 0

  const handleTest = async () => {
    setLoading('test')
    try {
      await providerAPI.test(provider.id)
      toast.success('Connection tested')
      onRefresh()
    } catch { toast.error('Test failed') }
    finally { setLoading('') }
  }

  const handleRefresh = async () => {
    setLoading('refresh')
    try {
      const res = await providerAPI.refresh(provider.id)
      toast.success(res.data.started ? 'Updating your content in the background' : 'Content update is already running')
      onRefresh()
    } catch (err: unknown) { toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Refresh failed') }
    finally { setLoading('') }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h3 className="text-2xl font-bold text-white">{provider.name}</h3>
              <span className="flex-shrink-0">
                <StatusBadge status={provider.status} pulse={online} />
              </span>
            </div>
            <p className="break-all text-sm text-slate-300/60">{provider.active_host || 'Not connected yet'}</p>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="metric-label mb-1">Content</p>
                <p className="text-2xl font-bold text-white">{parseInt(String(provider.vod_count || 0), 10).toLocaleString()}</p>
              </div>
              <div>
                <p className="metric-label mb-1">Ready to watch</p>
                <p className="text-2xl font-bold text-brand-300">{matchRate}%</p>
              </div>
              <div>
                <p className="metric-label mb-1">Last checked</p>
                <p className="text-sm font-medium text-slate-200">
                  {provider.last_checked ? new Date(provider.last_checked).toLocaleDateString() : 'Not checked yet'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap xl:justify-end">
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
              <Link href={`/providers/${provider.id}`}>
                Details
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button onClick={handleTest} disabled={!!loading} variant="outline" size="sm" className="w-full sm:w-auto">
              <Signal className="h-3.5 w-3.5" />
              {loading === 'test' ? 'Testing…' : 'Test'}
            </Button>
            <Button onClick={handleRefresh} disabled={!!loading} variant="outline" size="sm" className="w-full sm:w-auto">
              <RefreshCw className={`h-3.5 w-3.5 ${loading === 'refresh' ? 'animate-spin' : ''}`} />
              {loading === 'refresh' ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button onClick={() => onDelete(provider)} variant="destructive" size="sm" className="col-span-2 w-full sm:col-span-1 sm:w-auto">
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>

        <div className="mt-6 border-t border-white/[0.07] pt-5">
          <p className="metric-label mb-3">Servers</p>
          <div className="flex flex-wrap gap-2">
            {(provider.hosts || []).map(host => (
              <Badge
                key={host}
                variant={host === provider.active_host ? 'success' : 'default'}
                className="font-mono text-[11px]"
              >
                {host === provider.active_host && <Check className="h-3 w-3" />}
                <span className="break-all">{host.replace(/^https?:\/\//, '')}</span>
              </Badge>
            ))}
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

function ProvidersContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const newProviderId = searchParams.get('new')

  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(newProviderId)
  const highlightRef = useRef<HTMLDivElement | null>(null)

  const load = () => {
    providerAPI.list()
      .then(res => setProviders(res.data))
      .catch(() => toast.error('Failed to load providers'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Scroll to and clear highlight after a few seconds
  useEffect(() => {
    if (!highlightId || !highlightRef.current) return
    highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setHighlightId(null), 5000)
    return () => clearTimeout(t)
  }, [highlightId, providers])

  const handleDeleteProvider = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await providerAPI.delete(deleteTarget.id)
      toast.success('Provider deleted')
      setProviders(prev => prev.filter(x => x.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch { toast.error('Delete failed') }
    finally { setDeleting(false) }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl">
        <Card className="p-8 text-center text-slate-300/60">Loading providers…</Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <Card className="overflow-hidden p-5 sm:p-7 lg:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Badge variant="default" className="mb-4">IPTV</Badge>
              <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
                Your IPTV providers.
              </h1>
              <p className="hero-copy mt-3">
                See what&apos;s working, add new services, and keep your channels up to date — all in one place.
              </p>
            </div>
            <Button onClick={() => setShowAdd(true)} size="lg" className="w-full flex-shrink-0 sm:w-auto">
              <Plus className="h-5 w-5" />
              Add IPTV Provider
            </Button>
          </div>
        </Card>
      </motion.section>

      {providers.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          heading="Ready to start watching?"
          description="Browse our premium marketplace to get instant access to global IPTV networks, or manually add your own provider if you already have one."
          action={() => router.push('/marketplace')}
          actionLabel="Browse Marketplace"
          secondaryAction={() => setShowAdd(true)}
          secondaryActionLabel="Add Provider Manually"
        />
      ) : (
        <>
          <section className="space-y-4">
            {providers.map(p => {
              const isNew = p.id === highlightId
              return (
                <div
                  key={p.id}
                  ref={isNew ? highlightRef : null}
                  className={[
                    'rounded-2xl transition-all duration-700',
                    isNew
                      ? 'ring-2 ring-blue-500/60 shadow-[0_0_24px_rgba(59,130,246,0.25)]'
                      : '',
                  ].join(' ')}
                >
                  {isNew && (
                    <div className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-blue-400">
                      <Sparkles className="h-3.5 w-3.5" />
                      Just provisioned — your new subscription
                    </div>
                  )}
                  <ProviderRow provider={p} onRefresh={load} onDelete={setDeleteTarget} />
                </div>
              )
            })}
          </section>

          <section>
            <Card className="overflow-hidden border-brand-500/20 bg-brand-500/5 p-6 md:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/20 text-brand-400">
                    <ShoppingCart className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Get More Content</h3>
                    <p className="text-sm text-slate-400 mt-1">Explore high-performance global networks in our marketplace.</p>
                  </div>
                </div>
                <Button asChild className="gap-2 h-11 px-6 rounded-xl shadow-lg shadow-brand-500/20">
                  <Link href="/marketplace">
                    Visit Shop
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </Card>
          </section>
        </>
      )}

      <AddProviderModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={(provider) => {
          setProviders(prev => [provider, ...prev])
          setShowAdd(false)
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `Delete ${deleteTarget.name}?` : 'Delete provider?'}
        description="This removes the provider, its hosts, and its routed catalog from your account."
        confirmLabel="Delete Provider"
        danger
        loading={deleting}
        onConfirm={handleDeleteProvider}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  )
}

export default function ProvidersPage() {
  return (
    <Suspense fallback={
      <div className="mx-auto max-w-7xl">
        <Card className="p-8 text-center text-slate-300/60">Loading your providers…</Card>
      </div>
    }>
      <ProvidersContent />
    </Suspense>
  )
}
