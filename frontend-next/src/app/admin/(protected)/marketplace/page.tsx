'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useState } from 'react'
import {
  DollarSign, Package, ShoppingCart, TrendingUp,
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Loader2,
  Globe2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminAPI } from '@/utils/api'
import { COUNTRY_OPTIONS, getCountryOption } from '@/lib/countries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type PlanOption = {
  code: string
  name: string
  price_cents: string
  billing_period: 'day' | 'month' | 'year'
  billing_interval_count: string
  trial_days: string
  max_connections: string
  reseller_package_id: string
  reseller_bouquet_ids: string[]
}

type PlanConstraintRule = {
  allowed_values?: Array<string | number>
  locked?: boolean
  input?: 'number' | 'select'
}

type OfferingPlanConstraints = {
  billing_period?: PlanConstraintRule
  billing_interval_count?: PlanConstraintRule
} | null

type Network = {
  id: string
  name: string
  adapter_type?: string
  xtream_ui_scraped?: boolean
  gold_package_catalog?: ResellerPackage[]
  offering_plan_constraints?: OfferingPlanConstraints
}

type ResellerPackage = {
  id: string
  name: string
  billing_period?: PlanOption['billing_period']
  billing_interval_count?: number
  is_trial?: boolean
}

function formatCents(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

function MetricCard({ label, value, detail, icon: Icon, tone }: any) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">{label}</p>
            <p className="mt-3 text-3xl font-bold text-white">{value ?? '—'}</p>
            <p className="mt-2 text-sm text-slate-300/60">{detail}</p>
          </div>
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${tone}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function createBlankPlan(index = 1): PlanOption {
  return {
    code: `plan_${index}`,
    name: '',
    price_cents: '',
    billing_period: 'month',
    billing_interval_count: '1',
    trial_days: '0',
    max_connections: '1',
    reseller_package_id: '',
    reseller_bouquet_ids: [],
  }
}

function normalizePlanWithConstraints(plan: PlanOption, constraints: OfferingPlanConstraints): PlanOption {
  if (!constraints) return plan

  let nextPlan = plan
  const allowedPeriods = constraints.billing_period?.allowed_values?.map((value) => String(value) as PlanOption['billing_period']) || []
  const allowedCounts = constraints.billing_interval_count?.allowed_values?.map((value) => String(value)) || []

  if (allowedPeriods.length > 0 && !allowedPeriods.includes(nextPlan.billing_period)) {
    nextPlan = { ...nextPlan, billing_period: allowedPeriods[0] }
  }

  if (allowedCounts.length > 0 && !allowedCounts.includes(nextPlan.billing_interval_count)) {
    nextPlan = { ...nextPlan, billing_interval_count: allowedCounts[0] }
  }

  return nextPlan
}

function normalizePlanForPackage(plan: PlanOption, pkg?: ResellerPackage | null): PlanOption {
  if (!pkg?.billing_period || !pkg?.billing_interval_count) return plan

  return {
    ...plan,
    billing_period: pkg.billing_period,
    billing_interval_count: String(pkg.billing_interval_count),
  }
}

function findPackage(packages: ResellerPackage[], packageId: string) {
  return packages.find((pkg) => pkg.id === packageId) || null
}

function networkSupportsResellerPackages(network?: Network | null) {
  return network?.adapter_type === 'xtream_ui_scraper'
    || network?.xtream_ui_scraped === true
    || network?.adapter_type === 'gold_panel_api'
}

function networkUsesPlanPackageField(network?: Network | null) {
  if (!network) return false
  return networkSupportsResellerPackages(network)
}

const EMPTY_FORM = {
  name: '',
  description: '',
  currency: 'usd',
  features: '',
  catalog_tags: '',
  provider_network_id: '',
  is_featured: false,
  is_trial: false,
  group_id: '',
  provisioning_mode: 'pooled_account',
  reseller_bouquet_ids: [] as string[],
  reseller_notes: '',
  trial_ticket_enabled: false,
  trial_ticket_message: '',
  country_codes: [] as string[],
  provider_stats_vod: '',
  provider_stats_live: '',
  provider_stats_series: '',
  plans: [createBlankPlan(1)],
}

export default function AdminMarketplacePage() {
  const [offerings, setOfferings] = useState<any[]>([])
  const [networks, setNetworks] = useState<Network[]>([])
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [loadingBouquets, setLoadingBouquets] = useState(false)
  const [bouquets, setBouquets] = useState<{ id: string; bouquet_name: string }[]>([])
  const [packages, setPackages] = useState<ResellerPackage[]>([])
  const [loadingPackages, setLoadingPackages] = useState(false)

  async function load() {
    try {
      const [{ data }, networkRes] = await Promise.all([
        adminAPI.getMarketplace(),
        adminAPI.listNetworks(),
      ])
      setOfferings(data.offerings || [])
      setAnalytics(data.analytics || null)
      setNetworks(Array.isArray(networkRes.data) ? networkRes.data : [])
    } catch {
      toast.error('Failed to load marketplace data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const selectedNetwork = useMemo(
    () => networks.find((network) => network.id === form.provider_network_id) || null,
    [form.provider_network_id, networks],
  )

  const selectedPlanConstraints = selectedNetwork?.offering_plan_constraints || null
  const selectedNetworkSupportsPackages = networkSupportsResellerPackages(selectedNetwork)
  const selectedNetworkUsesPlanPackageField = networkUsesPlanPackageField(selectedNetwork)

  useEffect(() => {
    if (!selectedPlanConstraints) return

    setForm((current) => {
      const nextPlans = current.plans.map((plan) => normalizePlanWithConstraints(plan, selectedPlanConstraints))
      const changed = nextPlans.some((plan, index) => (
        plan.billing_period !== current.plans[index]?.billing_period
        || plan.billing_interval_count !== current.plans[index]?.billing_interval_count
      ))

      return changed ? { ...current, plans: nextPlans } : current
    })
  }, [selectedPlanConstraints])

  useEffect(() => {
    if (packages.length === 0) return

    setForm((current) => {
      const nextPlans = current.plans.map((plan) => normalizePlanForPackage(plan, findPackage(packages, plan.reseller_package_id)))
      const changed = nextPlans.some((plan, index) => (
        plan.billing_period !== current.plans[index]?.billing_period
        || plan.billing_interval_count !== current.plans[index]?.billing_interval_count
      ))

      return changed ? { ...current, plans: nextPlans } : current
    })
  }, [packages])

  function openCreate() {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, plans: [createBlankPlan(1)] })
    setBouquets([])
    setPackages([])
    setShowModal(true)
  }

  async function loadBouquets(networkId: string, force = false) {
    if (!networkId) {
      setBouquets([])
      return
    }
    if (!force && networkId === form.provider_network_id && bouquets.length > 0) return
    setLoadingBouquets(true)
    try {
      const { data } = await adminAPI.getNetworkBouquets(networkId)
      setBouquets(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setBouquets([])
      toast.error(err.response?.data?.error || 'Failed to load bouquets')
    } finally {
      setLoadingBouquets(false)
    }
  }

  async function loadPackages(networkId: string, force = false) {
    if (!networkId) {
      setPackages([])
      return
    }
    const network = networks.find((entry) => entry.id === networkId) || null
    if (!networkSupportsResellerPackages(network)) {
      setPackages([])
      return
    }
    if (!force && networkId === form.provider_network_id && packages.length > 0) return
    setLoadingPackages(true)
    try {
      const { data } = await adminAPI.getNetworkPackages(networkId)
      setPackages(Array.isArray(data) ? data : [])
    } catch {
      // Adapter may not expose packages — silent.
      setPackages([])
    } finally {
      setLoadingPackages(false)
    }
  }

  async function openEdit(offering: any) {
    setEditingId(offering.id)
    const plans = Array.isArray(offering.plan_options) && offering.plan_options.length > 0
      ? offering.plan_options
      : [{
        code: 'default',
        name: offering.trial_days > 0 ? `${offering.trial_days} Day Trial` : offering.name,
        price_cents: offering.price_cents,
        billing_period: offering.billing_period || 'month',
        billing_interval_count: offering.billing_interval_count || 1,
        trial_days: offering.trial_days || 0,
        max_connections: offering.max_connections || 1,
      }]

    setForm({
      name: offering.name || '',
      description: offering.description || '',
      currency: offering.currency || 'usd',
      features: Array.isArray(offering.features) ? offering.features.join(', ') : '',
      catalog_tags: Array.isArray(offering.catalog_tags) ? offering.catalog_tags.join(', ') : '',
      provider_network_id: offering.provider_network_id || '',
      is_featured: offering.is_featured || false,
      is_trial: offering.is_trial || false,
      group_id: offering.group_id || '',
      provisioning_mode: offering.provisioning_mode || 'pooled_account',
      reseller_bouquet_ids: Array.isArray(offering.reseller_bouquet_ids) ? offering.reseller_bouquet_ids : [],
      reseller_notes: offering.reseller_notes || '',
      trial_ticket_enabled: offering.trial_ticket_enabled || false,
      trial_ticket_message: offering.trial_ticket_message || '',
      country_codes: Array.isArray(offering.country_codes) ? offering.country_codes : [],
      provider_stats_vod: String(offering.provider_stats?.vod ?? ''),
      provider_stats_live: String(offering.provider_stats?.live ?? ''),
      provider_stats_series: String(offering.provider_stats?.series ?? ''),
      plans: plans.map((plan: any, index: number) => ({
        code: String(plan.code || `plan_${index + 1}`),
        name: String(plan.name || ''),
        price_cents: String(plan.price_cents || ''),
        billing_period: (plan.billing_period || 'month') as 'day' | 'month' | 'year',
        billing_interval_count: String(plan.billing_interval_count || 1),
        trial_days: String(plan.trial_days || 0),
        max_connections: String(plan.max_connections || offering.max_connections || 1),
        reseller_package_id: String(plan.reseller_package_id || ''),
        reseller_bouquet_ids: Array.isArray(plan.reseller_bouquet_ids)
          ? plan.reseller_bouquet_ids.map((value: unknown) => String(value))
          : Array.isArray(offering.reseller_bouquet_ids) ? offering.reseller_bouquet_ids.map((value: unknown) => String(value)) : [],
      })),
    })

    setShowModal(true)

    if (offering.provisioning_mode === 'reseller_line' && offering.provider_network_id) {
      void loadBouquets(offering.provider_network_id, true)
      void loadPackages(offering.provider_network_id, true)
    } else {
      setBouquets([])
      setPackages([])
    }
  }

  function updatePlan(index: number, patch: Partial<PlanOption>) {
    setForm((current) => ({
      ...current,
      plans: current.plans.map((plan, planIndex) => {
        if (planIndex !== index) return plan
        const nextPlan = normalizePlanWithConstraints({ ...plan, ...patch }, selectedPlanConstraints)
        return normalizePlanForPackage(nextPlan, findPackage(packages, nextPlan.reseller_package_id))
      }),
    }))
  }

  function addPlan() {
    setForm((current) => ({
      ...current,
      plans: [...current.plans, normalizePlanWithConstraints(createBlankPlan(current.plans.length + 1), selectedPlanConstraints)],
    }))
  }

  function removePlan(index: number) {
    setForm((current) => ({
      ...current,
      plans: current.plans.filter((_, planIndex) => planIndex !== index),
    }))
  }

  const normalizedPlans = useMemo(() => (
    form.plans
      .map((plan, index) => ({
        code: (plan.code || `plan_${index + 1}`).trim(),
        name: plan.name.trim(),
        price_cents: parseInt(plan.price_cents, 10),
        billing_period: plan.billing_period,
        billing_interval_count: parseInt(plan.billing_interval_count, 10) || 1,
        trial_days: parseInt(plan.trial_days, 10) || 0,
        max_connections: parseInt(plan.max_connections, 10) || 1,
        reseller_package_id: plan.reseller_package_id?.trim() || null,
        reseller_bouquet_ids: Array.isArray(plan.reseller_bouquet_ids)
          ? plan.reseller_bouquet_ids.map((value) => String(value))
          : [],
      }))
      .filter((plan) => plan.name && Number.isFinite(plan.price_cents))
  ), [form.plans])

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Offering name is required')
      return
    }
    if (normalizedPlans.length === 0) {
      toast.error('Add at least one valid plan')
      return
    }
    setSaving(true)
    try {
      const primaryPlan = normalizedPlans[0]
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        currency: form.currency.trim() || 'usd',
        price_cents: primaryPlan.price_cents,
        billing_period: primaryPlan.billing_period,
        billing_interval_count: primaryPlan.billing_interval_count,
        trial_days: primaryPlan.trial_days,
        max_connections: primaryPlan.max_connections,
        features: form.features.split(',').map((item) => item.trim()).filter(Boolean),
        catalog_tags: form.catalog_tags.split(',').map((item) => item.trim()).filter(Boolean),
        country_codes: form.country_codes,
        provider_stats: {
          vod: parseInt(form.provider_stats_vod, 10) || 0,
          live: parseInt(form.provider_stats_live, 10) || 0,
          series: parseInt(form.provider_stats_series, 10) || 0,
        },
        is_featured: form.is_featured,
        is_trial: form.is_trial,
        group_id: form.group_id.trim() || null,
        provisioning_mode: form.provisioning_mode,
        provider_network_id: form.provider_network_id || null,
        reseller_bouquet_ids: form.reseller_bouquet_ids,
        reseller_notes: form.reseller_notes.trim() || null,
        trial_ticket_enabled: form.trial_ticket_enabled,
        trial_ticket_message: form.trial_ticket_message.trim() || null,
        plan_options: normalizedPlans,
      }

      if (editingId) {
        await adminAPI.updateOffering(editingId, payload)
        toast.success('Offering updated')
      } else {
        await adminAPI.createOffering(payload)
        toast.success('Offering created')
      }
      setShowModal(false)
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(offering: any) {
    try {
      await adminAPI.updateOffering(offering.id, { is_active: !offering.is_active })
      toast.success(offering.is_active ? 'Offering deactivated' : 'Offering activated')
      load()
    } catch {
      toast.error('Failed to update offering')
    }
  }

  async function handleDelete(offering: any) {
    if (!confirm(`Permanently delete "${offering.name}"? This cannot be undone. Subscription history will be preserved, but the offering will be removed from the catalog.`)) return
    try {
      await adminAPI.deleteOffering(offering.id)
      toast.success('Offering deleted successfully')
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete offering')
    }
  }

  const mrrDisplay = analytics?.mrr_cents
    ? formatCents(Number(analytics.mrr_cents))
    : '$0.00'

  return (
    <div className="space-y-8 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Marketplace</h1>
          <p className="mt-1 text-sm text-slate-400">Manage plans, countries, tags, pricing, and provider stats</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Add Offering
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          label="Active Subs"
          value={analytics?.active_count ?? '—'}
          detail="currently paying"
          icon={TrendingUp}
          tone="border-green-500/30 bg-green-500/10 text-green-400"
        />
        <MetricCard
          label="Trialing"
          value={analytics?.trialing_count ?? '—'}
          detail="trial or short-term"
          icon={ShoppingCart}
          tone="border-blue-500/30 bg-blue-500/10 text-blue-400"
        />
        <MetricCard
          label="Past Due"
          value={analytics?.past_due_count ?? '—'}
          detail="payment overdue"
          icon={DollarSign}
          tone="border-orange-500/30 bg-orange-500/10 text-orange-400"
        />
        <MetricCard
          label="MRR"
          value={mrrDisplay}
          detail="selected-plan revenue"
          icon={Package}
          tone="border-purple-500/30 bg-purple-500/10 text-purple-400"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-white">Provider Offerings</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading…</div>
          ) : offerings.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No offerings yet. Click &quot;Add Offering&quot; to create one.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">Plans</th>
                    <th className="px-5 py-3">Coverage</th>
                    <th className="px-5 py-3">Stats</th>
                    <th className="px-5 py-3">Provisioning</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Featured</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {offerings.map((offering) => {
                    const plans = Array.isArray(offering.plan_options) && offering.plan_options.length > 0
                      ? offering.plan_options
                      : [{ name: offering.name, price_cents: offering.price_cents, billing_period: offering.billing_period, billing_interval_count: offering.billing_interval_count || 1 }]
                    const countries = Array.isArray(offering.country_codes) ? offering.country_codes : []
                    const countryFlags = countries.slice(0, 4).map((code: string) => getCountryOption(code)?.flag || code).join(' ')
                    return (
                      <tr key={offering.id} className="hover:bg-white/[0.02]">
                        <td className="px-5 py-3">
                          <div className="font-medium text-white">{offering.name}</div>
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            {offering.network_name && <div className="text-xs text-slate-400">{offering.network_name}</div>}
                            {offering.group_id && <div className="text-[10px] font-mono text-slate-500 uppercase tracking-tight">{offering.group_id}</div>}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-slate-300">
                          <div className="font-medium text-white">{plans.length} configured</div>
                          <div className="text-xs text-slate-400">
                            {plans.slice(0, 2).map((plan: any) => `${plan.name} · ${formatCents(plan.price_cents, offering.currency)}`).join(' | ')}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-slate-300">
                          <div className="flex items-center gap-2">
                            <Globe2 className="h-4 w-4 text-slate-500" />
                            <span>{countries.length > 0 ? countryFlags || `${countries.length} countries` : 'Global'}</span>
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            {(offering.catalog_tags || []).slice(0, 3).join(' · ') || 'No tags'}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-slate-300">
                          <div className="text-xs text-slate-400">
                            VOD {Number(offering.provider_stats?.vod || 0).toLocaleString()}
                          </div>
                          <div className="text-xs text-slate-400">
                            Live {Number(offering.provider_stats?.live || 0).toLocaleString()}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-slate-300">
                          {offering.provisioning_mode === 'reseller_line' ? 'Reseller line' : 'Pooled account'}
                          {offering.trial_ticket_enabled && (
                            <div className="mt-1 text-xs text-amber-400">Trial via support ticket</div>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <Badge
                            className={offering.is_active
                              ? 'border-green-500/20 bg-green-500/10 text-green-400'
                              : 'border-slate-500/20 bg-slate-500/10 text-slate-400'}
                          >
                            {offering.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="px-5 py-3">
                          {offering.is_featured ? (
                            <Badge className="border-yellow-500/20 bg-yellow-500/10 text-yellow-400">Featured</Badge>
                          ) : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => openEdit(offering)} className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-white" title="Edit">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => handleToggleActive(offering)} className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-white" title={offering.is_active ? 'Deactivate' : 'Activate'}>
                              {offering.is_active ? <ToggleRight className="h-4 w-4 text-green-400" /> : <ToggleLeft className="h-4 w-4" />}
                            </button>
                            <button onClick={() => handleDelete(offering)} className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-red-400" title="Delete permanently">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Offering' : 'Add Offering'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Provider Alpha — Premium" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Premium IPTV with multi-country coverage" />
              </div>
              <div className="space-y-1">
                <Label>Group ID</Label>
                <Input value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })} placeholder="e.g. starshare-premium" />
              </div>
              <div className="space-y-1">
                <Label>Currency</Label>
                <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder="usd" />
              </div>
              <div className="space-y-1">
                <Label>Featured</Label>
                <div className="flex h-10 items-center rounded-md border border-white/10 bg-slate-900 px-3">
                  <input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} className="h-4 w-4" />
                  <span className="ml-3 text-sm text-slate-300">Highlight on marketplace</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Tags</Label>
                <Input value={form.catalog_tags} onChange={(e) => setForm({ ...form, catalog_tags: e.target.value })} placeholder="4K, M3U, VOD, Sports" />
              </div>
              <div className="space-y-1">
                <Label>Features</Label>
                <Input value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} placeholder="Fast channel switch, Catch-up, EPG" />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white">Plan Options</h3>
                  <p className="text-sm text-slate-400">User-facing plans like 1 day trial, 1 month, 3 months, 6 months, or 1 year.</p>
                  {selectedPlanConstraints && (
                    <p className="mt-2 text-xs text-amber-300/80">
                      This provider network defines billing rules. Plan period/count fields are constrained automatically.
                    </p>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addPlan} className="gap-2">
                  <Plus className="h-4 w-4" /> Add plan
                </Button>
              </div>

              <div className="mt-4 space-y-4">
                {form.plans.map((plan, index) => (
                  <div key={`${plan.code}-${index}`} className="grid grid-cols-12 gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                    {(() => {
                      const selectedPackage = findPackage(packages, plan.reseller_package_id)
                      const packageConstraints: OfferingPlanConstraints = selectedPackage?.billing_period && selectedPackage?.billing_interval_count
                        ? {
                          billing_period: {
                            allowed_values: [selectedPackage.billing_period],
                            locked: true,
                          },
                          billing_interval_count: {
                            allowed_values: [selectedPackage.billing_interval_count],
                            input: 'select',
                          },
                        }
                        : null
                      const effectiveConstraints = packageConstraints || selectedPlanConstraints
                      const allowedPeriods = effectiveConstraints?.billing_period?.allowed_values?.map((value) => String(value) as PlanOption['billing_period']) || ['day', 'month', 'year']
                      const allowedCounts = effectiveConstraints?.billing_interval_count?.allowed_values?.map((value) => String(value)) || []
                      const lockPeriod = effectiveConstraints?.billing_period?.locked || allowedPeriods.length === 1
                      const countInputMode = effectiveConstraints?.billing_interval_count?.input || (allowedCounts.length > 0 ? 'select' : 'number')

                      return (
                        <>
                    <div className="col-span-12 md:col-span-2">
                      <Label>Code</Label>
                      <Input value={plan.code} onChange={(e) => updatePlan(index, { code: e.target.value })} placeholder="1m" />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <Label>Name</Label>
                      <Input value={plan.name} onChange={(e) => updatePlan(index, { name: e.target.value })} placeholder="1 Month" />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <Label>Price (cents)</Label>
                      <Input type="number" value={plan.price_cents} onChange={(e) => updatePlan(index, { price_cents: e.target.value })} placeholder="999" />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <Label>Period</Label>
                      <select
                        className="w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-70"
                        value={plan.billing_period}
                        onChange={(e) => updatePlan(index, { billing_period: e.target.value as 'day' | 'month' | 'year' })}
                        disabled={lockPeriod}
                      >
                        {allowedPeriods.map((period) => (
                          <option key={period} value={period}>{period.charAt(0).toUpperCase() + period.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-4 md:col-span-1">
                      <Label>Count</Label>
                      {countInputMode === 'select' ? (
                        <select
                          className="w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                          value={plan.billing_interval_count}
                          onChange={(e) => updatePlan(index, { billing_interval_count: e.target.value })}
                        >
                          {allowedCounts.map((count) => (
                            <option key={count} value={count}>{count}</option>
                          ))}
                        </select>
                      ) : (
                        <Input type="number" value={plan.billing_interval_count} onChange={(e) => updatePlan(index, { billing_interval_count: e.target.value })} />
                      )}
                    </div>
                    <div className="col-span-4 md:col-span-1">
                      <Label>Trial</Label>
                      <Input type="number" value={plan.trial_days} onChange={(e) => updatePlan(index, { trial_days: e.target.value })} />
                    </div>
                    <div className="col-span-4 md:col-span-1">
                      <Label>Conn.</Label>
                      <Input type="number" value={plan.max_connections} onChange={(e) => updatePlan(index, { max_connections: e.target.value })} />
                    </div>
                    {form.provisioning_mode === 'reseller_line' && selectedNetworkUsesPlanPackageField && (
                      <div className="col-span-12 md:col-span-6">
                        <Label>Reseller Package {loadingPackages && <span className="text-xs text-slate-500">(loading…)</span>}</Label>
                        {packages.length > 0 ? (
                          <select
                            className="w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                            value={plan.reseller_package_id}
                            onChange={(e) => updatePlan(index, { reseller_package_id: e.target.value })}
                          >
                            <option value="">— Select package (required for non-trial) —</option>
                            {packages.map((pkg) => (
                              <option key={pkg.id} value={pkg.id}>{pkg.name} (id={pkg.id})</option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            value={plan.reseller_package_id}
                            onChange={(e) => updatePlan(index, { reseller_package_id: e.target.value })}
                            placeholder={selectedNetworkSupportsPackages ? (form.provider_network_id ? 'Package id (e.g. 3)' : 'Select a network first') : 'Package id for this billing term'}
                          />
                        )}
                      </div>
                    )}
                    {form.provisioning_mode === 'reseller_line' && selectedNetwork?.adapter_type === 'gold_panel_api' && packages.length === 0 && (
                      <div className="col-span-12">
                        <p className="text-sm text-slate-400">
                          No Gold package catalog is configured for this network yet. Add package IDs in the network configuration to get a dropdown here.
                        </p>
                      </div>
                    )}
                    {form.provisioning_mode === 'reseller_line' && (
                      <div className="col-span-12">
                        <Label>Plan Bouquets</Label>
                        <div className="mt-2 rounded-xl border border-white/10 bg-slate-950/40 p-3">
                          {loadingBouquets ? (
                            <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
                          ) : bouquets.length === 0 ? (
                            <div className="py-2 text-sm text-slate-500">No bouquets found for this network</div>
                          ) : (
                            <div className="grid gap-2 md:grid-cols-2">
                              {bouquets.map((bouquet) => (
                                <label key={bouquet.id} className="flex items-center gap-3 rounded-md px-2 py-2 text-sm text-slate-300 hover:bg-white/5">
                                  <input
                                    type="checkbox"
                                    checked={plan.reseller_bouquet_ids.includes(bouquet.id)}
                                    onChange={(e) => {
                                      const next = e.target.checked
                                        ? [...plan.reseller_bouquet_ids, bouquet.id]
                                        : plan.reseller_bouquet_ids.filter((id) => id !== bouquet.id)
                                      updatePlan(index, { reseller_bouquet_ids: next })
                                    }}
                                    className="h-4 w-4"
                                  />
                                  <span>{bouquet.bouquet_name}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          Leave empty to use the offering-level default bouquets below.
                        </p>
                      </div>
                    )}
                    <div className="col-span-12 flex justify-end">
                      <Button type="button" variant="ghost" size="sm" onClick={() => removePlan(index)} disabled={form.plans.length === 1}>
                        Remove
                      </Button>
                    </div>
                        </>
                      )
                    })()}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <Label>VOD Count</Label>
                <Input type="number" value={form.provider_stats_vod} onChange={(e) => setForm({ ...form, provider_stats_vod: e.target.value })} placeholder="100000" />
              </div>
              <div className="space-y-1">
                <Label>Live Count</Label>
                <Input type="number" value={form.provider_stats_live} onChange={(e) => setForm({ ...form, provider_stats_live: e.target.value })} placeholder="24000" />
              </div>
              <div className="space-y-1">
                <Label>Series Count</Label>
                <Input type="number" value={form.provider_stats_series} onChange={(e) => setForm({ ...form, provider_stats_series: e.target.value })} placeholder="5000" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Countries</Label>
              <details className="rounded-xl border border-white/10 bg-slate-950/60">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm text-slate-300">
                  {form.country_codes.length > 0
                    ? form.country_codes.map((code) => getCountryOption(code)?.flag || code).join(' ')
                    : 'Select countries'}
                </summary>
                <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto border-t border-white/10 p-4 md:grid-cols-3">
                  {COUNTRY_OPTIONS.map((country) => (
                    <label key={country.code} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-slate-300 hover:bg-white/5">
                      <input
                        type="checkbox"
                        checked={form.country_codes.includes(country.code)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...form.country_codes, country.code]
                            : form.country_codes.filter((code) => code !== country.code)
                          setForm({ ...form, country_codes: next })
                        }}
                        className="h-4 w-4"
                      />
                      <span>{country.flag}</span>
                      <span>{country.name}</span>
                    </label>
                  ))}
                </div>
              </details>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Provisioning Mode</Label>
                <select
                  className="w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                  value={form.provisioning_mode}
                  onChange={async (e) => {
                    const nextMode = e.target.value
                    setForm({ ...form, provisioning_mode: nextMode })
                    if (nextMode === 'reseller_line' && form.provider_network_id) {
                      await Promise.all([
                        loadBouquets(form.provider_network_id, true),
                        loadPackages(form.provider_network_id, true),
                      ])
                    }
                  }}
                >
                  <option value="pooled_account">Pooled account</option>
                  <option value="reseller_line">Reseller line</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Provider Network</Label>
                <select
                  className="w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                  value={form.provider_network_id}
                  onChange={async (e) => {
                    const provider_network_id = e.target.value
                    setForm({ ...form, provider_network_id })
                    if (form.provisioning_mode === 'reseller_line' && provider_network_id) {
                      await Promise.all([
                        loadBouquets(provider_network_id, true),
                        loadPackages(provider_network_id, true),
                      ])
                    }
                  }}
                >
                  <option value="">Not linked</option>
                  {networks.map((network) => (
                    <option key={network.id} value={network.id}>{network.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Trial Request via Support</Label>
                <div className="flex h-10 items-center rounded-md border border-white/10 bg-slate-900 px-3">
                  <input
                    type="checkbox"
                    checked={form.trial_ticket_enabled}
                    onChange={(e) => setForm({ ...form, trial_ticket_enabled: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <span className="ml-3 text-sm text-slate-300">Show a “Request Trial” ticket button in the dashboard</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Trial Ticket Message</Label>
                <Input
                  value={form.trial_ticket_message}
                  onChange={(e) => setForm({ ...form, trial_ticket_message: e.target.value })}
                  placeholder="Request a trial for this provider"
                />
              </div>
            </div>

            {form.provisioning_mode === 'reseller_line' && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Default Bouquets</Label>
                  <div className="h-56 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/60 p-3">
                    {loadingBouquets ? (
                      <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
                    ) : bouquets.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-slate-500">No bouquets found for this network</div>
                    ) : bouquets.map((bouquet) => (
                      <label key={bouquet.id} className="flex items-center gap-3 rounded-md px-2 py-2 text-sm text-slate-300 hover:bg-white/5">
                        <input
                          type="checkbox"
                          checked={form.reseller_bouquet_ids.includes(bouquet.id)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...form.reseller_bouquet_ids, bouquet.id]
                              : form.reseller_bouquet_ids.filter((id) => id !== bouquet.id)
                            setForm({ ...form, reseller_bouquet_ids: next })
                          }}
                          className="h-4 w-4"
                        />
                        <span>{bouquet.bouquet_name}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">
                    Used when a plan does not define its own bouquet override.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>Provisioning Notes</Label>
                  <textarea
                    value={form.reseller_notes}
                    onChange={(e) => setForm({ ...form, reseller_notes: e.target.value })}
                    placeholder="Applied when reseller lines are created"
                    className="min-h-[224px] w-full rounded-xl border border-white/10 bg-slate-950/60 p-3 text-sm text-white outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? 'Save Changes' : 'Create Offering'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
