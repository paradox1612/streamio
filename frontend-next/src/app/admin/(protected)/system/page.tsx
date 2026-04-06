'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { Database, RefreshCw, Settings } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminAPI } from '@/utils/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const JOB_LABELS: Record<string, { label: string; schedule: string; icon: string }> = {
  healthCheckJob: { label: 'Host Health Check', schedule: 'Every 5 minutes', icon: '🩺' },
  tmdbSyncJob: { label: 'TMDB Export Sync', schedule: 'Daily at 2:00 AM', icon: '⬇️' },
  freeAccessCatalogRefreshJob: { label: 'Free Catalog Refresh', schedule: 'Daily at 3:00 AM', icon: '🎁' },
  catalogRefreshJob: { label: 'Catalog Refresh', schedule: 'Daily at 4:00 AM', icon: '🔄' },
  matchingJob: { label: 'TMDB Matching', schedule: 'Daily at 5:00 AM', icon: '🎯' },
  epgRefreshJob: { label: 'EPG Refresh', schedule: 'Every 4 hours', icon: '📺' },
  freeAccessExpiryJob: { label: 'Free Access Expiry', schedule: 'Every hour', icon: '⏳' },
}

export default function AdminSystemPage() {
  const [jobData, setJobData] = useState<any>(null)
  const [dbStats, setDbStats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState('')

  const load = async () => {
    try {
      const [jobRes, dbRes] = await Promise.all([
        adminAPI.getJobs(),
        adminAPI.getDbStats(),
      ])
      setJobData(jobRes.data)
      setDbStats(Array.isArray(dbRes.data) ? dbRes.data : [])
    } catch {
      toast.error('Failed to load system info')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleRunJob = async (jobName: string) => {
    setRunning(jobName)
    try {
      await adminAPI.runJob(jobName)
      toast.success(`${JOB_LABELS[jobName]?.label || jobName} started`)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to run job')
    } finally {
      setTimeout(() => setRunning(''), 2000)
    }
  }

  const handleRefreshAll = async () => {
    setRunning('refreshAll')
    try {
      await adminAPI.refreshAll()
      toast.success('Catalog refresh for all providers started')
    } catch {
      toast.error('Failed')
    } finally {
      setTimeout(() => setRunning(''), 2000)
    }
  }

  const lastRunsMap: Record<string, any> = {}
  ;(jobData?.lastRuns || []).forEach((r: any) => { lastRunsMap[r.job_name] = r })

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden">
          <CardContent className="p-6 sm:p-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-200/70">Admin system</p>
            <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
              Background jobs, runtime state, and database stats.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300/65">
              Trigger any scheduled job manually, refresh all provider catalogs at once, and inspect table sizes so
              infrastructure changes are always visible to operators.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col justify-center gap-3 p-6">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start rounded-2xl"
              onClick={load}
            >
              <RefreshCw className="h-4 w-4" />
              Reload System Info
            </Button>
            <Button
              type="button"
              variant="default"
              className="w-full justify-start rounded-2xl"
              disabled={!!running}
              onClick={handleRefreshAll}
            >
              <Settings className="h-4 w-4" />
              {running === 'refreshAll' ? 'Running...' : 'Refresh All Providers'}
            </Button>
          </CardContent>
        </Card>
      </section>

      {loading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : (
        <>
          <Card className="overflow-hidden">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">Current Runtime</p>
                  <p className="mt-2 text-sm text-slate-300/80">
                    Host {jobData?.runtime?.hostname || 'unknown'} · PID {jobData?.runtime?.pid || 'n/a'} · Node env {jobData?.runtime?.nodeEnv || 'n/a'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={jobData?.runtime?.appRole === 'web' ? 'brand' : 'warning'} className="uppercase">
                    {jobData?.runtime?.appRole || 'unknown'}
                  </Badge>
                  <Badge variant={jobData?.runtime?.httpServerEnabled ? 'success' : 'outline'}>
                    http {jobData?.runtime?.httpServerEnabled ? 'enabled' : 'disabled'}
                  </Badge>
                  <Badge variant={jobData?.runtime?.schedulerEnabled ? 'success' : 'outline'}>
                    scheduler {jobData?.runtime?.schedulerEnabled ? 'enabled' : 'disabled'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b border-white/[0.08] pb-4">
              <CardTitle>Background Jobs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              {(jobData?.jobs || []).map((jobName: string) => {
                const info = JOB_LABELS[jobName] || { label: jobName, schedule: '', icon: '⚙️' }
                const lastRun = lastRunsMap[jobName]
                const statusVariant = lastRun?.status === 'success' ? 'success' : lastRun?.status === 'failed' ? 'danger' : 'warning'
                return (
                  <div
                    key={jobName}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-[22px] border border-white/[0.07] bg-white/[0.025] px-4 py-4"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{info.icon}</span>
                        <span className="text-sm font-semibold text-white">{info.label}</span>
                        {lastRun && (
                          <Badge variant={statusVariant as any} className="capitalize">{lastRun.status}</Badge>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-slate-400/70">
                        {info.schedule}
                        {lastRun?.started_at && ` · Last: ${new Date(lastRun.started_at).toLocaleString()}`}
                      </div>
                      {lastRun?.metadata && (
                        <div className="mt-1 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                          Runner: {lastRun.metadata.runnerRole || 'unknown'} on {lastRun.metadata.runnerHostname || 'unknown'}
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      disabled={!!running}
                      onClick={() => handleRunJob(jobName)}
                    >
                      {running === jobName ? 'Running...' : 'Run Now'}
                    </Button>
                  </div>
                )
              })}
              {(jobData?.jobs || []).length === 0 && (
                <p className="text-sm text-slate-400/60">No jobs registered.</p>
              )}
            </CardContent>
          </Card>

          {dbStats.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-white/[0.08] pb-4">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-slate-400" />
                  <CardTitle>Database Tables</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                        <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400/70">Table</th>
                        <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400/70">Size</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbStats.map((row) => (
                        <tr key={row.tablename} className="border-b border-white/[0.06] last:border-b-0">
                          <td className="px-6 py-3 font-mono text-slate-300/80">{row.tablename}</td>
                          <td className="px-6 py-3 text-right text-slate-400/70">{row.size}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
