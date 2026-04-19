'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  CreditCard,
  Eye,
  EyeOff,
  Loader2,
  Save,
  ShoppingCart,
  Wallet,
  Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminAPI } from '@/utils/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type ProviderField = {
  key: string
  kind: 'secret' | 'text' | 'number' | 'choice'
  label: string
  placeholder?: string
  hint?: string
  sensitive?: boolean
  options?: string[]
}

type ProviderDefinition = {
  id: string
  label: string
  admin_description: string
  customer_subtitle: string
  icon: string
  accent_color: string
  supports: {
    subscription: boolean
    topup: boolean
    recurring: boolean
  }
  fields: ProviderField[]
  config: Record<string, any>
}

function getProviderIcon(icon: string) {
  if (icon === 'wallet') return <Wallet className="h-5 w-5" />
  if (icon === 'shopping-cart') return <ShoppingCart className="h-5 w-5" />
  return <CreditCard className="h-5 w-5" />
}

function getAccentClass(color: string) {
  if (color === 'emerald') return 'bg-emerald-500/10 text-emerald-400'
  if (color === 'sky') return 'bg-sky-500/10 text-sky-400'
  if (color === 'teal') return 'bg-teal-500/10 text-teal-400'
  return 'bg-indigo-500/10 text-indigo-400'
}

function getPreviewClass(color: string) {
  if (color === 'emerald') return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
  if (color === 'sky') return 'bg-sky-500/10 text-sky-300 border-sky-500/20'
  if (color === 'teal') return 'bg-teal-500/10 text-teal-300 border-teal-500/20'
  return 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
}

function StatusBadge({ enabled, visible }: { enabled: boolean; visible: boolean }) {
  if (enabled && visible) {
    return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1"><Check className="h-3 w-3" />Live</Badge>
  }
  if (enabled && !visible) {
    return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">Configured · Hidden</Badge>
  }
  return <Badge className="bg-white/5 text-slate-500 border-white/10">Not configured</Badge>
}

function SecretField({
  field,
  value,
  onChange,
}: {
  field: ProviderField
  value: string
  onChange: (value: string) => void
}) {
  const [show, setShow] = useState(false)
  const hasMaskedValue = typeof value === 'string' && value.startsWith('****')

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-400">{field.label}</Label>
      <div className="relative">
        <Input
          type={show ? 'text' : 'password'}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={hasMaskedValue ? '••••••••  (leave blank to keep existing)' : field.placeholder}
          className="pr-10 font-mono text-xs bg-black/30 border-white/10 text-white placeholder:text-slate-600"
        />
        <button
          type="button"
          onClick={() => setShow((state) => !state)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
        >
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
      {field.hint && <p className="text-[10px] text-slate-600 italic">{field.hint}</p>}
    </div>
  )
}

function ProviderFieldInput({
  field,
  value,
  onChange,
}: {
  field: ProviderField
  value: any
  onChange: (value: any) => void
}) {
  if (field.kind === 'secret') {
    return <SecretField field={field} value={value ?? ''} onChange={onChange} />
  }

  if (field.kind === 'choice') {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs text-slate-400">{field.label}</Label>
        <div className="flex gap-2">
          {(field.options || []).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={cn(
                'flex-1 rounded-lg border py-2 text-xs font-semibold capitalize transition-all',
                value === option
                  ? 'border-brand-500/40 bg-brand-500/10 text-brand-200'
                  : 'border-white/10 bg-white/[0.02] text-slate-500 hover:border-white/20 hover:text-slate-300'
              )}
            >
              {option}
            </button>
          ))}
        </div>
        {field.hint && <p className="text-[10px] text-slate-600 italic">{field.hint}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-400">{field.label}</Label>
      <Input
        type={field.kind === 'number' ? 'number' : 'text'}
        min={field.kind === 'number' ? '0' : undefined}
        value={value ?? (field.kind === 'number' ? 0 : '')}
        onChange={(e) => onChange(field.kind === 'number' ? (parseInt(e.target.value, 10) || 0) : e.target.value)}
        placeholder={field.placeholder}
        className={cn(
          'text-xs bg-black/30 border-white/10 text-white placeholder:text-slate-600',
          field.kind === 'text' && 'font-mono'
        )}
      />
      {field.hint && <p className="text-[10px] text-slate-600 italic">{field.hint}</p>}
    </div>
  )
}

function ProviderCard({
  provider,
  onFieldChange,
  onToggleEnabled,
  onToggleVisible,
}: {
  provider: ProviderDefinition
  onFieldChange: (providerId: string, key: string, value: any) => void
  onToggleEnabled: (providerId: string, value: boolean) => void
  onToggleVisible: (providerId: string, value: boolean) => void
}) {
  const enabled = !!provider.config.enabled
  const visible = !!provider.config.visible

  return (
    <Card className={cn('border-white/[0.08] bg-surface-900/50 transition-all', enabled && 'border-white/[0.12]')}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', getAccentClass(provider.accent_color))}>
              {getProviderIcon(provider.icon)}
            </div>
            <div>
              <CardTitle className="text-base text-white">{provider.label}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{provider.admin_description}</CardDescription>
            </div>
          </div>
          <StatusBadge enabled={enabled} visible={visible} />
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-3 rounded-xl border border-white/[0.06] bg-black/20 p-4">
          {provider.fields.map((field) => (
            <ProviderFieldInput
              key={`${provider.id}-${field.key}`}
              field={field}
              value={provider.config[field.key]}
              onChange={(value) => onFieldChange(provider.id, field.key, value)}
            />
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Enabled</p>
              <p className="text-[10px] text-slate-500">Mark this provider as active once credentials are configured</p>
            </div>
            <Switch checked={enabled} onCheckedChange={(value) => onToggleEnabled(provider.id, value)} />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Show to customers</p>
              <p className="text-[10px] text-slate-500">Display this payment option in checkout flows</p>
            </div>
            <Switch checked={visible} onCheckedChange={(value) => onToggleVisible(provider.id, value)} disabled={!enabled} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function PaymentProvidersSettingsPage() {
  const [providers, setProviders] = useState<ProviderDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  async function loadConfig() {
    try {
      const { data } = await adminAPI.getPaymentProviderSettings()
      setProviders(data.providers || [])
    } catch {
      toast.error('Failed to load payment provider settings')
    } finally {
      setLoading(false)
    }
  }

  const updateProvider = (providerId: string, updater: (provider: ProviderDefinition) => ProviderDefinition) => {
    setProviders((current) => current.map((provider) => (
      provider.id === providerId ? updater(provider) : provider
    )))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const { data } = await adminAPI.updatePaymentProviderSettings({
        providers: providers.map((provider) => ({
          id: provider.id,
          config: provider.config,
        })),
      })
      setProviders(data.providers || [])
      toast.success('Payment provider settings saved')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
      </div>
    )
  }

  const activeCount = providers.filter((provider) => provider.config.enabled && provider.config.visible).length

  return (
    <div className="space-y-8 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Payment Providers</h1>
          <p className="mt-1 text-sm text-slate-400">
            Providers now render from registry metadata, so new adapters only need one backend registry entry.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save All
        </Button>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4">
        <div className={cn('h-2 w-2 rounded-full', activeCount > 0 ? 'bg-emerald-400' : 'bg-slate-600')} />
        <p className="text-sm text-slate-300">
          {activeCount === 0
            ? 'No payment providers are currently shown to customers.'
            : `${activeCount} provider${activeCount > 1 ? 's' : ''} visible to customers at checkout.`}
        </p>
        {activeCount === 0 && (
          <div className="ml-auto flex items-center gap-1.5 text-amber-400">
            <AlertCircle className="h-4 w-4" />
            <span className="text-xs font-medium">Enable at least one provider</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            onFieldChange={(providerId, key, value) => updateProvider(providerId, (item) => ({
              ...item,
              config: { ...item.config, [key]: value },
            }))}
            onToggleEnabled={(providerId, value) => updateProvider(providerId, (item) => ({
              ...item,
              config: { ...item.config, enabled: value, visible: value ? item.config.visible : false },
            }))}
            onToggleVisible={(providerId, value) => updateProvider(providerId, (item) => ({
              ...item,
              config: { ...item.config, visible: value },
            }))}
          />
        ))}
      </div>

      <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6">
        <h3 className="text-sm font-semibold text-blue-400 mb-1">Customer Checkout Preview</h3>
        <p className="text-xs text-slate-500 mb-4">Payment methods visible to customers right now:</p>
        <div className="flex flex-wrap gap-3">
          {providers.map((provider) => (
            provider.config.enabled && provider.config.visible ? (
              <div key={provider.id} className={cn('flex items-center gap-2 rounded-xl border px-4 py-2.5', getPreviewClass(provider.accent_color))}>
                <Check className="h-3.5 w-3.5" />
                <div>
                  <p className="text-xs font-semibold">{provider.label}</p>
                  <p className="text-[10px] opacity-70">{provider.customer_subtitle}</p>
                </div>
              </div>
            ) : null
          ))}
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-amber-300">
            <Zap className="h-3.5 w-3.5" />
            <div>
              <p className="text-xs font-semibold">Credits</p>
              <p className="text-[10px] opacity-70">Always available</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
