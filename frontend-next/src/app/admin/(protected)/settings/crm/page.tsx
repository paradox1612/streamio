'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { Activity, Database, ExternalLink, RefreshCw, Users, Wifi, WifiOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminAPI } from '@/utils/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function AdminCrmStatusPage() {
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const { data } = await adminAPI.getCrmStatus()
      setStatus(data)
    } catch {
      toast.error('Failed to load CRM status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleSyncAll() {
    if (!confirm('Run a full sync of all users to Twenty CRM? This may take a while.')) return
    setSyncing(true)
    try {
      await adminAPI.syncAllToCrm()
      toast.success('Full sync started in background')
    } catch {
      toast.error('Failed to start sync')
    } finally {
      setSyncing(false)
    }
  }

  const isConnected = status?.connected === true
  const crmUrl = process.env.NEXT_PUBLIC_TWENTY_URL || status?.api_url?.replace(':3000', ':3002')

  return (
    <div className="space-y-8 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">CRM Integration</h1>
          <p className="mt-1 text-sm text-slate-400">Twenty CRM connection status and sync controls</p>
        </div>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {crmUrl && (
            <Button variant="ghost" asChild className="gap-2">
              <a href={crmUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" /> Open CRM
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-white">Connection Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-3">
            {loading ? (
              <div className="h-3 w-3 animate-pulse rounded-full bg-slate-400" />
            ) : isConnected ? (
              <div className="h-3 w-3 rounded-full bg-green-400 shadow-[0_0_8px] shadow-green-400/50" />
            ) : (
              <div className="h-3 w-3 rounded-full bg-red-400 shadow-[0_0_8px] shadow-red-400/50" />
            )}
            <span className="text-sm font-medium text-white">
              {loading ? 'Checking…' : isConnected ? 'Connected' : 'Disconnected'}
            </span>
            {!loading && (
              <Badge
                className={isConnected
                  ? 'border-green-500/20 bg-green-500/10 text-green-400'
                  : 'border-red-500/20 bg-red-500/10 text-red-400'}
              >
                {isConnected ? <Wifi className="mr-1 h-3 w-3" /> : <WifiOff className="mr-1 h-3 w-3" />}
                {status?.status ?? 'unknown'}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoRow label="API URL" value={status?.api_url || '—'} />
            <InfoRow
              label="API Key"
              value={status?.api_key_configured ? '••••••••••••' : 'Not configured'}
              tone={status?.api_key_configured ? 'text-green-400' : 'text-red-400'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Sync Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-white">Sync Statistics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard
              icon={Users}
              label="Total Users"
              value={status?.sync_stats?.total_users ?? '—'}
              tone="text-blue-400"
            />
            <StatCard
              icon={Activity}
              label="Synced to CRM"
              value={status?.sync_stats?.synced_users ?? '—'}
              tone="text-green-400"
            />
            <StatCard
              icon={Database}
              label="Pending Sync"
              value={
                status?.sync_stats
                  ? String(
                      Number(status.sync_stats.total_users || 0) -
                      Number(status.sync_stats.synced_users || 0)
                    )
                  : '—'
              }
              tone="text-orange-400"
            />
          </div>

          <div className="pt-2">
            <Button onClick={handleSyncAll} disabled={syncing || !isConnected} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Sync started…' : 'Run Full Sync'}
            </Button>
            <p className="mt-2 text-xs text-slate-400">
              Upserts all StreamBridge users to Twenty CRM as Person records.
              Runs in background — safe to navigate away.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Setup Instructions */}
      {!isConnected && !loading && (
        <Card className="border-orange-500/20 bg-orange-500/5">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-orange-400">Setup Required</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm text-slate-300">
              <li><span className="font-mono text-slate-400">1.</span> Start the Twenty CRM service: <code className="rounded bg-white/5 px-1">docker compose up twenty twenty-worker</code></li>
              <li><span className="font-mono text-slate-400">2.</span> Open Twenty at <code className="rounded bg-white/5 px-1">http://localhost:3002</code> and complete onboarding</li>
              <li><span className="font-mono text-slate-400">3.</span> Go to <strong>Settings → APIs &amp; Webhooks → Generate API Key</strong></li>
              <li><span className="font-mono text-slate-400">4.</span> Add <code className="rounded bg-white/5 px-1">TWENTY_API_KEY=&lt;key&gt;</code> to <code className="rounded bg-white/5 px-1">backend/.env</code></li>
              <li><span className="font-mono text-slate-400">5.</span> Restart the backend and run: <code className="rounded bg-white/5 px-1">node backend/src/scripts/twentySetupObjects.js</code></li>
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function InfoRow({ label, value, tone = 'text-slate-300' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 truncate text-sm font-mono ${tone}`}>{value}</p>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string | number; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-4">
      <Icon className={`h-5 w-5 ${tone}`} />
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="text-xl font-bold text-white">{value}</p>
      </div>
    </div>
  )
}
