'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import {
  DollarSign, Package, ShoppingCart, TrendingUp,
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, Check,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminAPI } from '@/utils/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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

const EMPTY_FORM = {
  name: '',
  description: '',
  price_cents: '',
  currency: 'usd',
  billing_period: 'month',
  trial_days: '0',
  max_connections: '1',
  features: '',
  is_featured: false,
  provider_network_id: '',
}

export default function AdminMarketplacePage() {
  const [offerings, setOfferings] = useState<any[]>([])
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const { data } = await adminAPI.getMarketplace()
      setOfferings(data.offerings || [])
      setAnalytics(data.analytics || null)
    } catch {
      toast.error('Failed to load marketplace data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setShowModal(true)
  }

  function openEdit(o: any) {
    setEditingId(o.id)
    setForm({
      name: o.name || '',
      description: o.description || '',
      price_cents: String(o.price_cents || ''),
      currency: o.currency || 'usd',
      billing_period: o.billing_period || 'month',
      trial_days: String(o.trial_days || 0),
      max_connections: String(o.max_connections || 1),
      features: Array.isArray(o.features) ? o.features.join(', ') : '',
      is_featured: o.is_featured || false,
      provider_network_id: o.provider_network_id || '',
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name || !form.price_cents) {
      toast.error('Name and price are required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        price_cents: parseInt(form.price_cents),
        currency: form.currency,
        billing_period: form.billing_period,
        trial_days: parseInt(form.trial_days) || 0,
        max_connections: parseInt(form.max_connections) || 1,
        features: form.features ? form.features.split(',').map((f) => f.trim()).filter(Boolean) : [],
        is_featured: form.is_featured,
        provider_network_id: form.provider_network_id || null,
      }
      if (editingId) {
        await adminAPI.updateOffering(editingId, payload)
        toast.success('Offering updated')
      } else {
        await adminAPI.createOffering(payload)
        toast.success('Offering created and synced to Stripe')
      }
      setShowModal(false)
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(o: any) {
    try {
      await adminAPI.updateOffering(o.id, { is_active: !o.is_active })
      toast.success(o.is_active ? 'Offering deactivated' : 'Offering activated')
      load()
    } catch {
      toast.error('Failed to update offering')
    }
  }

  async function handleDelete(o: any) {
    if (!confirm(`Deactivate "${o.name}"? It will no longer appear in the marketplace.`)) return
    try {
      await adminAPI.deleteOffering(o.id)
      toast.success('Offering deactivated')
      load()
    } catch {
      toast.error('Failed to deactivate offering')
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
          <p className="mt-1 text-sm text-slate-400">Manage provider offerings and subscription analytics</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Add Offering
        </Button>
      </div>

      {/* Analytics */}
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
          detail="in trial period"
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
          detail="monthly recurring revenue"
          icon={Package}
          tone="border-purple-500/30 bg-purple-500/10 text-purple-400"
        />
      </div>

      {/* Offerings table */}
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
                    <th className="px-5 py-3">Price</th>
                    <th className="px-5 py-3">Billing</th>
                    <th className="px-5 py-3">Trial</th>
                    <th className="px-5 py-3">Stripe</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Featured</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {offerings.map((o) => (
                    <tr key={o.id} className="hover:bg-white/[0.02]">
                      <td className="px-5 py-3">
                        <div className="font-medium text-white">{o.name}</div>
                        {o.network_name && (
                          <div className="text-xs text-slate-400">{o.network_name}</div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-white">
                        {formatCents(o.price_cents, o.currency)}
                      </td>
                      <td className="px-5 py-3 text-slate-300 capitalize">{o.billing_period}</td>
                      <td className="px-5 py-3 text-slate-300">
                        {o.trial_days > 0 ? `${o.trial_days}d` : '—'}
                      </td>
                      <td className="px-5 py-3">
                        {o.stripe_price_id ? (
                          <Check className="h-4 w-4 text-green-400" />
                        ) : (
                          <X className="h-4 w-4 text-slate-500" />
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge
                          className={o.is_active
                            ? 'border-green-500/20 bg-green-500/10 text-green-400'
                            : 'border-slate-500/20 bg-slate-500/10 text-slate-400'}
                        >
                          {o.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        {o.is_featured ? (
                          <Badge className="border-yellow-500/20 bg-yellow-500/10 text-yellow-400">Featured</Badge>
                        ) : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(o)}
                            className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-white"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(o)}
                            className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-white"
                            title={o.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {o.is_active
                              ? <ToggleRight className="h-4 w-4 text-green-400" />
                              : <ToggleLeft className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => handleDelete(o)}
                            className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-red-400"
                            title="Deactivate"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Offering' : 'Add Offering'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Provider Alpha — Premium"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Optional description"
                />
              </div>
              <div className="space-y-1">
                <Label>Price (cents) *</Label>
                <Input
                  type="number"
                  value={form.price_cents}
                  onChange={(e) => setForm({ ...form, price_cents: e.target.value })}
                  placeholder="999"
                />
                <p className="text-xs text-slate-400">e.g. 999 = $9.99</p>
              </div>
              <div className="space-y-1">
                <Label>Currency</Label>
                <Input
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  placeholder="usd"
                />
              </div>
              <div className="space-y-1">
                <Label>Billing Period</Label>
                <select
                  className="w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                  value={form.billing_period}
                  onChange={(e) => setForm({ ...form, billing_period: e.target.value })}
                >
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Trial Days</Label>
                <Input
                  type="number"
                  value={form.trial_days}
                  onChange={(e) => setForm({ ...form, trial_days: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label>Max Connections</Label>
                <Input
                  type="number"
                  value={form.max_connections}
                  onChange={(e) => setForm({ ...form, max_connections: e.target.value })}
                  placeholder="1"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Features (comma-separated)</Label>
                <Input
                  value={form.features}
                  onChange={(e) => setForm({ ...form, features: e.target.value })}
                  placeholder="4K, VOD, Live TV"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Provider Network ID</Label>
                <Input
                  value={form.provider_network_id}
                  onChange={(e) => setForm({ ...form, provider_network_id: e.target.value })}
                  placeholder="UUID (optional)"
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input
                  id="is_featured"
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(e) => setForm({ ...form, is_featured: e.target.checked })}
                  className="h-4 w-4 rounded"
                />
                <Label htmlFor="is_featured">Featured offering</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Offering'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
