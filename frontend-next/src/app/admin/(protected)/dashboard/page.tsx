'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, ArrowRight, FileText, Server, Shield, Users, DollarSign } from 'lucide-react'
import { adminAPI } from '@/utils/api'
import toast from 'react-hot-toast'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import NumberTicker from '@/components/sera/NumberTicker'

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  sub: string
  icon: React.ElementType
  tone: string
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">{label}</p>
            <p className="mt-3 text-4xl font-bold text-white">
              <NumberTicker value={Number(value) || 0} className="text-4xl font-bold text-white" />
            </p>
            <p className="mt-2 text-sm text-slate-300/60">{sub}</p>
          </div>
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${tone}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function JobRow({ job }: { job: any }) {
  const variant = job.status === 'success' ? 'success' : job.status === 'failed' ? 'danger' : 'warning'
  const runnerRole = job.metadata?.runnerRole || 'unknown'
  const runnerHost = job.metadata?.runnerHostname || 'unknown'

  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] py-4 last:border-b-0 last:pb-0">
      <div>
        <div className="text-sm font-semibold text-white">{job.job_name}</div>
        <div className="mt-1 text-xs text-slate-400/72">
          {job.started_at ? new Date(job.started_at).toLocaleString() : 'Never'}
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">
          {runnerRole} on {runnerHost}
        </div>
      </div>
      <Badge variant={variant as any} className="capitalize">
        {job.status}
      </Badge>
    </div>
  )
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminAPI
      .getOverview()
      .then((res) => setData(res.data))
      .catch(() => toast.error('Failed to load overview'))
      .finally(() => setLoading(false))
  }, [])

  const metrics = useMemo(() => {
    const matchRate =
      data?.matchStats?.total > 0
        ? Math.round((data.matchStats.matched / data.matchStats.total) * 100)
        : 0
    
    const mrrCents = data?.marketplace?.analytics?.mrr_cents || 0
    const activeSubs = data?.marketplace?.analytics?.active_count || 0

    return [
      { label: 'Active Subs', value: activeSubs, sub: `Generating ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(mrrCents / 100)} MRR`, icon: DollarSign, tone: 'border-green-400/20 bg-green-500/10 text-green-200' },
      { label: 'Users', value: data?.userCount || 0, sub: 'Accounts in the workspace', icon: Users, tone: 'border-brand-400/20 bg-brand-500/10 text-brand-200' },
      { label: 'Providers', value: data?.providerCount || 0, sub: 'Sources attached across users', icon: Server, tone: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200' },
      { label: 'Match Rate', value: matchRate, sub: `${parseInt(data?.matchStats?.matched || 0, 10).toLocaleString()} matched titles`, icon: Shield, tone: 'border-amber-400/20 bg-amber-400/10 text-amber-200' },
    ]
  }, [data])

  if (loading) return <div className="text-slate-400">Loading...</div>

  return (
    <div className="space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
      >
        <Card className="overflow-hidden">
          <CardContent className="p-6 sm:p-8 lg:p-10">
            <div className="grid gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-end">
              <div>
                <Badge variant="default" className="mb-5">
                  <Activity className="h-3 w-3" />
                  Admin overview
                </Badge>
                <h1 className="text-3xl font-bold leading-tight text-white sm:text-5xl">
                  Run the admin control plane with the same dashboard language as the user workspace.
                </h1>
                <p className="hero-copy mt-4 max-w-2xl">
                  Users, provider inventory, match quality, and job health stay in one operator-first surface.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[22px] border border-white/[0.07] bg-white/[0.025] p-5">
                  <p className="metric-label mb-2">Last job runs</p>
                  <p className="text-4xl font-bold text-white">{data?.lastRuns?.length || 0}</p>
                  <p className="mt-2 text-sm text-slate-300/60">Latest scheduler activity visible to admins.</p>
                </div>
                <div className="rounded-[22px] border border-white/[0.07] bg-white/[0.025] p-5">
                  <p className="metric-label mb-2">Catalog coverage</p>
                  <p className="text-4xl font-bold text-white">{metrics[3].value}%</p>
                  <p className="mt-2 text-sm text-slate-300/60">{metrics[3].sub}</p>
                </div>
                <div className="rounded-[22px] border border-white/[0.07] bg-white/[0.025] p-5 sm:col-span-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="metric-label">Current runtime</p>
                    <Badge variant={data?.runtime?.appRole === 'web' ? 'brand' : 'warning'} className="uppercase">
                      {data?.runtime?.appRole || 'unknown'}
                    </Badge>
                    <Badge variant={data?.runtime?.schedulerEnabled ? 'success' : 'outline'}>
                      scheduler {data?.runtime?.schedulerEnabled ? 'enabled' : 'disabled'}
                    </Badge>
                    <Badge variant={data?.runtime?.httpServerEnabled ? 'success' : 'outline'}>
                      http {data?.runtime?.httpServerEnabled ? 'enabled' : 'disabled'}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm text-slate-300/60">
                    Host {data?.runtime?.hostname || 'unknown'} · PID {data?.runtime?.pid || 'n/a'} · Node env {data?.runtime?.nodeEnv || 'n/a'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => <StatCard key={metric.label} {...metric} />)}
      </section>

      <Card className="overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-brand-200">
                <FileText className="h-4 w-4" />
                Blog manager
              </div>
              <h2 className="mt-3 text-2xl font-bold text-white">Manage blog posts from the admin area.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300/65">
                The public blog is now file-based MDX. Use the admin blog page to review the publishing path and current slugs before adding more posts.
              </p>
            </div>
            <Link href="/admin/blog" className="btn-secondary justify-center lg:w-auto">
              Open blog manager
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-white/[0.08] pb-5">
          <CardTitle className="text-xl font-bold text-white">Last job runs</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {data?.lastRuns?.length > 0 ? (
            data.lastRuns.map((job: any) => <JobRow key={job.id} job={job} />)
          ) : (
            <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] px-5 py-6 text-sm text-slate-400">
              No jobs run yet.
            </div>
          )}
          <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand-200">
            Control-plane telemetry stays aligned with the user workspace shell
            <ArrowRight className="h-4 w-4" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
