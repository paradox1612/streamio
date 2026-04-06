'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { Crosshair, Download, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminAPI } from '@/utils/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function AdminTmdbPage() {
  const [status, setStatus] = useState<any>(null)
  const [matching, setMatching] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [rematching, setRematching] = useState(false)

  const load = async () => {
    try {
      const [statusRes, matchRes] = await Promise.all([
        adminAPI.getTmdbStatus(),
        adminAPI.getMatchingStats(),
      ])
      setStatus(statusRes.data)
      setMatching(matchRes.data)
    } catch {
      toast.error('Failed to load TMDB data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await adminAPI.syncTmdb()
      toast.success('TMDB sync started in background')
    } catch {
      toast.error('Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const handleRematch = async () => {
    setRematching(true)
    try {
      await adminAPI.rematch()
      toast.success('Re-matching started in background')
    } catch {
      toast.error('Rematch failed')
    } finally {
      setRematching(false)
    }
  }

  const stats = matching?.globalStats || {}
  const matchRate = stats.total > 0 ? Math.round((stats.matched / stats.total) * 100) : 0

  const statCards = [
    { label: 'TMDB Movies', value: parseInt(status?.movieCount || 0, 10).toLocaleString(), tone: 'border-violet-400/20 bg-violet-500/10 text-violet-200' },
    { label: 'TMDB Series', value: parseInt(status?.seriesCount || 0, 10).toLocaleString(), tone: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200' },
    { label: 'Total Cached', value: parseInt(stats.total || 0, 10).toLocaleString(), tone: 'border-orange-400/20 bg-orange-400/10 text-orange-200' },
    { label: 'Matched', value: parseInt(stats.matched || 0, 10).toLocaleString(), tone: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' },
    { label: 'Unmatched', value: parseInt(stats.unmatched || 0, 10).toLocaleString(), tone: 'border-red-400/20 bg-red-500/10 text-red-200' },
    { label: 'Match Rate', value: `${matchRate}%`, tone: 'border-lime-400/20 bg-lime-400/10 text-lime-200' },
  ]

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden">
          <CardContent className="p-6 sm:p-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-200/70">Admin TMDB</p>
            <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
              Catalog integrity and match quality in one place.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300/65">
              Sync TMDB exports, trigger the re-matching job, and inspect which titles remain unmatched so browsing
              quality stays high.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col justify-center gap-4 p-6">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start rounded-2xl"
              disabled={syncing}
              onClick={handleSync}
            >
              <Download className="h-4 w-4" />
              {syncing ? 'Syncing...' : 'Sync TMDB Exports'}
            </Button>
            <Button
              type="button"
              variant="default"
              className="w-full justify-start rounded-2xl"
              disabled={rematching}
              onClick={handleRematch}
            >
              <Crosshair className="h-4 w-4" />
              {rematching ? 'Rematching...' : 'Run Rematch'}
            </Button>
          </CardContent>
        </Card>
      </section>

      {loading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {statCards.map((s) => (
              <Card key={s.label} className="overflow-hidden">
                <CardContent className="p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">{s.label}</p>
                  <p className={`mt-2 text-2xl font-bold ${s.tone.split(' ')[2]}`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {status?.lastRuns?.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-white/[0.08] pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle>Recent Sync Runs</CardTitle>
                  <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={load}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Reload
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="divide-y divide-white/[0.06] p-0">
                {status.lastRuns.map((run: any) => (
                  <div key={run.id} className="flex items-center justify-between px-6 py-4">
                    <span className="text-sm text-slate-300/80">{new Date(run.started_at).toLocaleString()}</span>
                    <Badge variant={run.status === 'success' ? 'success' : 'danger'} className="capitalize">
                      {run.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {matching?.unmatched?.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-white/[0.08] pb-4">
                <CardTitle>Unmatched Titles (sample)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-5">
                {matching.unmatched.map((item: any) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3"
                  >
                    <span className="text-sm text-slate-300/80">{item.raw_title}</span>
                    <span className="text-xs text-slate-400/60">{item.tmdb_type}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
