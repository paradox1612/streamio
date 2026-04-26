'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Database,
  DatabaseZap,
  ExternalLink,
  Link2,
  RefreshCw,
  ShieldAlert,
  AlertTriangle,
  User,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminAPI } from '@/utils/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DataTableFilter from '@/components/ui/data-table-filter'
import AdminDataTable from '@/components/AdminDataTable'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'status' | 'coverage' | 'contacts' | 'tasks'

interface CrmPerson {
  id: string
  name?: { firstName?: string; lastName?: string }
  emails?: { primaryEmail?: string }
  customFields?: {
    streamioId?: string
    accountStatus?: string
    lastActiveAt?: string
  }
  createdAt?: string
}

interface CrmTask {
  id: string
  title?: string
  status?: string
  dueAt?: string
  assignees?: { id: string; name?: { firstName?: string; lastName?: string } }[]
  taskTargets?: { personId?: string }[]
  createdAt?: string
}

interface CoverageProvider {
  id: string
  name: string
  user_email?: string
  network_name?: string | null
  active_host?: string | null
  status?: string | null
  account_status?: string | null
  account_expires_at?: string | null
  account_last_synced_at?: string | null
  source_type: 'MARKETPLACE' | 'EXTERNAL'
  days_until_expiry: number | null
  expiry_risk: 'critical' | 'warning' | 'expired' | 'unknown' | 'healthy'
  sync_state: {
    personLinked: boolean
    companyLinked: boolean
    providerAccessLinked: boolean
  }
}

interface CoverageSummary {
  totalProviders: number
  peopleLinked: number
  companiesLinked: number
  providerAccessLinked: number
  criticalExpiry: number
  warningExpiry: number
  expired: number
  unknownExpiry: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function personLabel(p: CrmPerson) {
  const fn = p.name?.firstName?.trim()
  const ln = p.name?.lastName?.trim()
  const full = [fn, ln].filter(Boolean).join(' ')
  return full || p.emails?.primaryEmail || p.id
}

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

function getNetworkDisplayMeta(name?: string | null) {
  const raw = String(name || '').trim()
  const migratedPrefix = 'Migrated network: '
  if (!raw) return { name: '', migrated: false }
  if (raw.startsWith(migratedPrefix)) {
    return { name: raw.slice(migratedPrefix.length).trim() || raw, migrated: true }
  }
  return { name: raw, migrated: false }
}

function formatExpiry(provider: CoverageProvider) {
  if (!provider.account_expires_at) return 'No expiry'
  if (provider.days_until_expiry === null || provider.days_until_expiry === undefined) return 'Unknown'
  if (provider.days_until_expiry < 0) return `Expired ${Math.abs(provider.days_until_expiry)}d ago`
  if (provider.days_until_expiry === 0) return 'Expires today'
  return `${provider.days_until_expiry}d left`
}

function getRiskBadge(provider: CoverageProvider) {
  if (provider.expiry_risk === 'critical') return { variant: 'danger', label: 'Critical' } as const
  if (provider.expiry_risk === 'warning') return { variant: 'warning', label: 'Warning' } as const
  if (provider.expiry_risk === 'expired') return { variant: 'danger', label: 'Expired' } as const
  if (provider.expiry_risk === 'healthy') return { variant: 'success', label: 'Healthy' } as const
  return { variant: 'outline', label: 'Unknown' } as const
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value, tone = 'text-slate-300' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 truncate font-mono text-sm ${tone}`}>{value}</p>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any
  label: string
  value: string | number
  tone: string
}) {
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

function CoverageMetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: any
  label: string
  value: string | number
  detail: string
  tone: string
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-bold text-white">{value}</p>
          <p className="mt-2 text-sm text-slate-400">{detail}</p>
        </div>
        <Icon className={`h-5 w-5 ${tone}`} />
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-b-2 border-indigo-400 text-white'
          : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}

// ─── Status Tab ───────────────────────────────────────────────────────────────

function StatusTab({
  status,
  summary,
  loading,
  syncing,
  onSyncAll,
}: {
  status: any
  summary: CoverageSummary | null
  loading: boolean
  syncing: boolean
  onSyncAll: () => void
}) {
  const isConnected = status?.connected === true

  return (
    <div className="space-y-6">
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
                className={
                  isConnected
                    ? 'border-green-500/20 bg-green-500/10 text-green-400'
                    : 'border-red-500/20 bg-red-500/10 text-red-400'
                }
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-white">Sync Statistics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard icon={Users} label="Total Users" value={status?.sync_stats?.total_users ?? '—'} tone="text-blue-400" />
            <StatCard icon={Activity} label="Synced to CRM" value={status?.sync_stats?.synced_users ?? '—'} tone="text-green-400" />
            <StatCard
              icon={Database}
              label="Pending Sync"
              value={
                status?.sync_stats
                  ? String(
                      Number(status.sync_stats.total_users || 0) -
                        Number(status.sync_stats.synced_users || 0),
                    )
                  : '—'
              }
              tone="text-orange-400"
            />
          </div>
          {summary && (
            <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4 sm:grid-cols-4">
              <CoverageMetricCard
                icon={Link2}
                label="Access linked"
                value={`${summary.providerAccessLinked}/${summary.totalProviders}`}
                detail="Providers with persisted Twenty access IDs"
                tone="text-brand-200"
              />
              <CoverageMetricCard
                icon={DatabaseZap}
                label="Companies linked"
                value={summary.companiesLinked}
                detail="Provider networks linked to Twenty companies"
                tone="text-sky-300"
              />
              <CoverageMetricCard
                icon={ShieldAlert}
                label="Critical expiry"
                value={summary.criticalExpiry + summary.expired}
                detail="Expired or expiring within 3 days"
                tone="text-red-300"
              />
              <CoverageMetricCard
                icon={AlertTriangle}
                label="Unknown expiry"
                value={summary.unknownExpiry}
                detail="No usable expiry date yet"
                tone="text-amber-300"
              />
            </div>
          )}
          <div className="pt-2">
            <Button onClick={onSyncAll} disabled={syncing || !isConnected} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Sync started…' : 'Run Full Sync'}
            </Button>
            <p className="mt-2 text-xs text-slate-400">
              Upserts all StreamBridge users to Twenty CRM as Person records. Runs in background — safe to navigate away.
            </p>
          </div>
        </CardContent>
      </Card>

      {!isConnected && !loading && (
        <Card className="border-orange-500/20 bg-orange-500/5">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-orange-400">Setup Required</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm text-slate-300">
              <li>
                <span className="font-mono text-slate-400">1.</span> Start the Twenty CRM service:{' '}
                <code className="rounded bg-white/5 px-1">docker compose up twenty twenty-worker</code>
              </li>
              <li>
                <span className="font-mono text-slate-400">2.</span> Open Twenty at{' '}
                <code className="rounded bg-white/5 px-1">http://localhost:3002</code> and complete onboarding
              </li>
              <li>
                <span className="font-mono text-slate-400">3.</span> Go to{' '}
                <strong>Settings → APIs &amp; Webhooks → Generate API Key</strong>
              </li>
              <li>
                <span className="font-mono text-slate-400">4.</span> Add{' '}
                <code className="rounded bg-white/5 px-1">TWENTY_API_KEY=&lt;key&gt;</code> to{' '}
                <code className="rounded bg-white/5 px-1">backend/.env</code>
              </li>
              <li>
                <span className="font-mono text-slate-400">5.</span> Restart the backend and run:{' '}
                <code className="rounded bg-white/5 px-1">node backend/src/scripts/twentySetupObjects.js</code>
              </li>
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function CoverageTab({
  providers,
  summary,
  loading,
  syncing,
  onSyncAll,
}: {
  providers: CoverageProvider[]
  summary: CoverageSummary | null
  loading: boolean
  syncing: boolean
  onSyncAll: () => void
}) {
  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState<string[]>([])
  const [coverageFilter, setCoverageFilter] = useState<string[]>([])

  const filteredProviders = providers.filter((provider) => {
    const haystack = [
      provider.name,
      provider.user_email,
      provider.network_name,
      provider.active_host,
      provider.source_type,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    const coverageState =
      provider.sync_state.personLinked &&
      provider.sync_state.companyLinked &&
      provider.sync_state.providerAccessLinked
        ? 'linked'
        : 'missing-links'

    const matchesSearch = haystack.includes(search.toLowerCase())
    const matchesRisk = riskFilter.length === 0 || riskFilter.includes(provider.expiry_risk)
    const matchesCoverage = coverageFilter.length === 0 || coverageFilter.includes(coverageState)

    return matchesSearch && matchesRisk && matchesCoverage
  })

  const columns = [
    {
      key: 'provider',
      header: 'Provider Access',
      render: (provider: CoverageProvider) => {
        const networkMeta = getNetworkDisplayMeta(provider.network_name)
        return (
          <div className="min-w-[16rem]">
            <div className="font-semibold text-white">{provider.name}</div>
            <div className="mt-1 text-xs text-slate-400/75">{provider.user_email}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <span>{networkMeta.name || 'No network linked'}</span>
              {networkMeta.migrated && (
                <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-[10px] text-amber-300">
                  Migrated
                </Badge>
              )}
            </div>
          </div>
        )
      },
    },
    {
      key: 'source',
      header: 'Source',
      render: (provider: CoverageProvider) => (
        <div>
          <Badge variant={provider.source_type === 'MARKETPLACE' ? 'success' : 'brand'} className="w-fit">
            {provider.source_type}
          </Badge>
          <div className="mt-2 text-xs text-slate-400/75">{provider.active_host || 'No active host'}</div>
        </div>
      ),
    },
    {
      key: 'coverage',
      header: 'CRM Coverage',
      cellClassName: 'min-w-[14rem]',
      render: (provider: CoverageProvider) => (
        <div className="space-y-1 text-xs">
          <div className={provider.sync_state.personLinked ? 'text-emerald-300' : 'text-red-300'}>
            Person {provider.sync_state.personLinked ? 'linked' : 'missing'}
          </div>
          <div className={provider.sync_state.companyLinked ? 'text-emerald-300' : 'text-red-300'}>
            Company {provider.sync_state.companyLinked ? 'linked' : 'missing'}
          </div>
          <div className={provider.sync_state.providerAccessLinked ? 'text-emerald-300' : 'text-red-300'}>
            Access {provider.sync_state.providerAccessLinked ? 'linked' : 'missing'}
          </div>
        </div>
      ),
    },
    {
      key: 'expiry',
      header: 'Expiry Risk',
      render: (provider: CoverageProvider) => {
        const badge = getRiskBadge(provider)
        return (
          <div>
            <Badge variant={badge.variant} className="w-fit">{badge.label}</Badge>
            <div className="mt-2 font-medium text-slate-100">{formatExpiry(provider)}</div>
            <div className="text-xs text-slate-400/75">{formatDateTime(provider.account_expires_at)}</div>
          </div>
        )
      },
    },
    {
      key: 'sync',
      header: 'Last Account Sync',
      render: (provider: CoverageProvider) => (
        <div>
          <div className="font-medium text-slate-100">{formatDateTime(provider.account_last_synced_at)}</div>
          <div className="text-xs text-slate-400/75">
            Health {provider.status || 'unknown'} · Account {provider.account_status || 'unknown'}
          </div>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <CoverageMetricCard icon={CheckCircle2} label="People linked" value={summary.peopleLinked} detail="Providers whose user is linked to a Twenty person" tone="text-emerald-300" />
          <CoverageMetricCard icon={DatabaseZap} label="Companies linked" value={summary.companiesLinked} detail="Providers whose network is linked to a Twenty company" tone="text-sky-300" />
          <CoverageMetricCard icon={AlertTriangle} label="Warning window" value={summary.warningExpiry} detail="Providers expiring in 4 to 7 days" tone="text-amber-300" />
          <CoverageMetricCard icon={ShieldAlert} label="Unknown expiry" value={summary.unknownExpiry} detail="Providers with no usable expiry date yet" tone="text-slate-300" />
        </div>
      )}

      <AdminDataTable
        title="CRM provider coverage"
        description="Use this table to find missing Twenty links and provider accounts that need refresh before expiry tasks can become reliable."
        count={filteredProviders.length}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by provider, user, network, host, or source..."
        primaryAction={{
          label: syncing ? 'Syncing...' : 'Run Full Sync',
          icon: RefreshCw,
          onClick: onSyncAll,
          variant: 'outline',
        }}
        filters={[
          (
            <DataTableFilter
              key="expiry-risk"
              label="Expiry risk"
              options={[
                { value: 'critical', label: 'Critical', icon: ShieldAlert },
                { value: 'warning', label: 'Warning', icon: AlertTriangle },
                { value: 'expired', label: 'Expired', icon: ShieldAlert },
                { value: 'unknown', label: 'Unknown', icon: DatabaseZap },
                { value: 'healthy', label: 'Healthy', icon: CheckCircle2 },
              ]}
              selectedValues={riskFilter}
              onChange={setRiskFilter}
              isMultiSelect
            />
          ),
          (
            <DataTableFilter
              key="coverage"
              label="Coverage"
              options={[
                { value: 'linked', label: 'All linked', icon: CheckCircle2 },
                { value: 'missing-links', label: 'Missing links', icon: Link2 },
              ]}
              selectedValues={coverageFilter}
              onChange={setCoverageFilter}
              isMultiSelect
            />
          ),
        ]}
        columns={columns}
        rows={filteredProviders}
        loading={loading}
        emptyMessage="No provider access rows match the current CRM filters."
        rowKey={(provider) => provider.id}
      />
    </div>
  )
}

// ─── Contacts Tab ─────────────────────────────────────────────────────────────

function ContactsTab() {
  const [people, setPeople] = useState<CrmPerson[]>([])
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState<string | undefined>()
  const [nextCursor, setNextCursor] = useState<string | undefined>()
  const [prevCursors, setPrevCursors] = useState<string[]>([])

  async function load(afterCursor?: string) {
    setLoading(true)
    try {
      const { data } = await adminAPI.getCrmPeople({ limit: 20, cursor: afterCursor })
      // Twenty REST returns { data: { people: [...] }, pageInfo: { ... } }
      // or { data: [...] } — handle both shapes
      const records: CrmPerson[] =
        data?.data?.people ?? data?.data?.people ?? data?.data ?? []
      const pageInfo = data?.pageInfo ?? data?.data?.pageInfo
      setPeople(records)
      setNextCursor(pageInfo?.endCursor)
    } catch {
      toast.error('Failed to load contacts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function goNext() {
    if (!nextCursor) return
    setPrevCursors((p) => [...p, cursor ?? ''])
    setCursor(nextCursor)
    load(nextCursor)
  }

  function goPrev() {
    const stack = [...prevCursors]
    const prev = stack.pop()
    setPrevCursors(stack)
    setCursor(prev || undefined)
    load(prev || undefined)
  }

  const statusColor: Record<string, string> = {
    active: 'border-green-500/20 bg-green-500/10 text-green-400',
    inactive: 'border-slate-500/20 bg-slate-500/10 text-slate-400',
    trial: 'border-blue-500/20 bg-blue-500/10 text-blue-400',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{people.length} contacts loaded</p>
        <Button variant="ghost" size="sm" onClick={() => load(cursor)} disabled={loading} className="gap-2">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg border border-white/5 bg-white/[0.02]" />
          ))}
        </div>
      ) : people.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Users className="h-10 w-10 text-slate-500" />
            <p className="text-sm text-slate-400">No contacts found in Twenty CRM.</p>
            <p className="text-xs text-slate-500">Run a full sync from the Status tab to populate contacts.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Name / Email</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Status</th>
                <th className="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">Last Active</th>
                <th className="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:table-cell">Synced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {people.map((p) => {
                const acctStatus = p.customFields?.accountStatus ?? 'unknown'
                return (
                  <tr key={p.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-400">
                          <User className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white">{personLabel(p)}</p>
                          {p.emails?.primaryEmail && (
                            <p className="truncate text-xs text-slate-400">{p.emails.primaryEmail}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={statusColor[acctStatus] ?? 'border-slate-500/20 bg-slate-500/10 text-slate-400'}>
                        {acctStatus}
                      </Badge>
                    </td>
                    <td className="hidden px-4 py-3 text-slate-300 sm:table-cell">
                      {fmt(p.customFields?.lastActiveAt)}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-300 md:table-cell">
                      {fmt(p.createdAt)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {(prevCursors.length > 0 || nextCursor) && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={goPrev} disabled={prevCursors.length === 0} className="gap-1">
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </Button>
          <Button variant="ghost" size="sm" onClick={goNext} disabled={!nextCursor} className="gap-1">
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Tasks Tab ────────────────────────────────────────────────────────────────

function TasksTab() {
  const [tasks, setTasks] = useState<CrmTask[]>([])
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState<string | undefined>()
  const [nextCursor, setNextCursor] = useState<string | undefined>()
  const [prevCursors, setPrevCursors] = useState<string[]>([])

  async function load(afterCursor?: string) {
    setLoading(true)
    try {
      const { data } = await adminAPI.getCrmTasks({ limit: 20, cursor: afterCursor })
      const records: CrmTask[] =
        data?.data?.tasks ?? data?.data ?? []
      const pageInfo = data?.pageInfo ?? data?.data?.pageInfo
      setTasks(records)
      setNextCursor(pageInfo?.endCursor)
    } catch {
      toast.error('Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function goNext() {
    if (!nextCursor) return
    setPrevCursors((p) => [...p, cursor ?? ''])
    setCursor(nextCursor)
    load(nextCursor)
  }

  function goPrev() {
    const stack = [...prevCursors]
    const prev = stack.pop()
    setPrevCursors(stack)
    setCursor(prev || undefined)
    load(prev || undefined)
  }

  function isOverdue(dueAt?: string) {
    if (!dueAt) return false
    return new Date(dueAt) < new Date()
  }

  const statusIcon = (status?: string, dueAt?: string) => {
    if (status === 'DONE') return <CheckCircle2 className="h-4 w-4 text-green-400" />
    if (isOverdue(dueAt)) return <CircleAlert className="h-4 w-4 text-red-400" />
    return <Clock className="h-4 w-4 text-orange-400" />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{tasks.length} tasks loaded</p>
        <Button variant="ghost" size="sm" onClick={() => load(cursor)} disabled={loading} className="gap-2">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg border border-white/5 bg-white/[0.02]" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-slate-500" />
            <p className="text-sm text-slate-400">No tasks in Twenty CRM.</p>
            <p className="text-xs text-slate-500">Tasks are auto-created on churn and payment failures.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="w-8 px-4 py-3" />
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Title</th>
                <th className="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">Status</th>
                <th className="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:table-cell">Due</th>
                <th className="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 lg:table-cell">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tasks.map((t) => (
                <tr key={t.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">{statusIcon(t.status, t.dueAt)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{t.title || '(untitled)'}</p>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <Badge
                      className={
                        t.status === 'DONE'
                          ? 'border-green-500/20 bg-green-500/10 text-green-400'
                          : isOverdue(t.dueAt)
                          ? 'border-red-500/20 bg-red-500/10 text-red-400'
                          : 'border-orange-500/20 bg-orange-500/10 text-orange-400'
                      }
                    >
                      {t.status === 'DONE' ? 'Done' : isOverdue(t.dueAt) ? 'Overdue' : 'Open'}
                    </Badge>
                  </td>
                  <td className="hidden px-4 py-3 text-slate-300 md:table-cell">{fmt(t.dueAt)}</td>
                  <td className="hidden px-4 py-3 text-slate-300 lg:table-cell">{fmt(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(prevCursors.length > 0 || nextCursor) && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={goPrev} disabled={prevCursors.length === 0} className="gap-1">
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </Button>
          <Button variant="ghost" size="sm" onClick={goNext} disabled={!nextCursor} className="gap-1">
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminCrmStatusPage() {
  const [tab, setTab] = useState<Tab>('status')
  const [status, setStatus] = useState<any>(null)
  const [coverage, setCoverage] = useState<{ summary: CoverageSummary; providers: CoverageProvider[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const crmUrl =
    process.env.NEXT_PUBLIC_TWENTY_URL || status?.api_url?.replace(':3000', ':3002')

  async function loadStatus() {
    setLoading(true)
    try {
      const [{ data: statusData }, { data: coverageData }] = await Promise.all([
        adminAPI.getCrmStatus(),
        adminAPI.getCrmCoverage(),
      ])
      setStatus(statusData)
      setCoverage(coverageData)
    } catch {
      toast.error('Failed to load CRM status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStatus() }, [])

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

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">CRM Integration</h1>
          <p className="mt-1 text-sm text-slate-400">Twenty CRM — contacts, tasks, and sync controls</p>
        </div>
        {crmUrl && (
          <Button variant="ghost" asChild className="gap-2">
            <a href={crmUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" /> Open CRM
            </a>
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-white/10">
        <nav className="flex gap-1">
          <TabButton active={tab === 'status'} onClick={() => setTab('status')}>
            Status
          </TabButton>
          <TabButton active={tab === 'contacts'} onClick={() => setTab('contacts')}>
            Contacts
          </TabButton>
          <TabButton active={tab === 'coverage'} onClick={() => setTab('coverage')}>
            Coverage
          </TabButton>
          <TabButton active={tab === 'tasks'} onClick={() => setTab('tasks')}>
            Tasks
          </TabButton>
        </nav>
      </div>

      {/* Tab content */}
      {tab === 'status' && (
        <StatusTab
          status={status}
          summary={coverage?.summary ?? null}
          loading={loading}
          syncing={syncing}
          onSyncAll={handleSyncAll}
        />
      )}
      {tab === 'coverage' && (
        <CoverageTab
          providers={coverage?.providers ?? []}
          summary={coverage?.summary ?? null}
          loading={loading}
          syncing={syncing}
          onSyncAll={handleSyncAll}
        />
      )}
      {tab === 'contacts' && <ContactsTab />}
      {tab === 'tasks' && <TasksTab />}
    </div>
  )
}
