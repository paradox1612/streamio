'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { Activity, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminAPI } from '@/utils/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

export default function AdminHealthPage() {
  const [hosts, setHosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    adminAPI
      .getHealthStats()
      .then((res) => setHosts(Array.isArray(res.data) ? res.data : []))
      .catch(() => toast.error('Failed to load health data'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const online = hosts.filter((h) => h.status === 'online').length
  const offline = hosts.filter((h) => h.status !== 'online').length

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden">
          <CardContent className="p-6 sm:p-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-200/70">Admin host health</p>
            <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
              Per-host routing confidence at a glance.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300/65">
              Every host attached to a provider is health-checked and displayed here. Degraded hosts surface before
              they cause stream failures.
            </p>
          </CardContent>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-200">
                <Wifi className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">Online</p>
                <p className="mt-1 text-3xl font-bold text-white">{online}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-red-400/20 bg-red-500/10 text-red-200">
                <WifiOff className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">Offline</p>
                <p className="mt-1 text-3xl font-bold text-white">{offline}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b border-white/[0.08] pb-5">
          <div>
            <CardTitle className="text-xl font-bold text-white">Host directory</CardTitle>
            <p className="mt-1 text-sm text-slate-400/70">{hosts.length} hosts tracked across all providers</p>
          </div>
          <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-6 py-8 text-sm text-slate-400">Loading...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400/70">Host URL</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400/70">Provider</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400/70">User</th>
                    <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400/70">Status</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400/70">Response</th>
                    <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400/70">Last Checked</th>
                  </tr>
                </thead>
                <tbody>
                  {hosts.map((h) => (
                    <tr key={h.id} className="border-b border-white/[0.06] last:border-b-0">
                      <td className="max-w-[16rem] overflow-hidden text-ellipsis whitespace-nowrap px-6 py-3 font-mono text-xs text-slate-300/80">
                        {h.host_url}
                      </td>
                      <td className="px-4 py-3 text-slate-300/80">{h.provider_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-400/70">{h.user_email}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={h.status === 'online' ? 'success' : 'danger'} className="capitalize">
                          {h.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300/80">
                        {h.response_time_ms ? `${h.response_time_ms}ms` : '—'}
                      </td>
                      <td className="px-6 py-3 text-right text-xs text-slate-400/70">{formatDate(h.last_checked)}</td>
                    </tr>
                  ))}
                  {hosts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-slate-400/60">
                        <Activity className="mx-auto mb-2 h-6 w-6 opacity-40" />
                        No host data yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
