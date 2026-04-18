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

// ─── Types ────────────────────────────────────────────────────────────────────

interface StripeConfig {
  enabled: boolean
  visible: boolean
  secret_key: string
  webhook_secret: string
  publishable_key: string
  has_secret_key?: boolean
  has_webhook_secret?: boolean
}

interface PaygateConfig {
  enabled: boolean
  visible: boolean
  wallet_address: string
  api_key: string
  has_api_key?: boolean
}

interface HelcimConfig {
  enabled: boolean
  visible: boolean
  api_token: string
  webhook_secret: string
  company_name: string
  has_api_token?: boolean
  has_webhook_secret?: boolean
}

interface SquareConfig {
  enabled: boolean
  visible: boolean
  access_token: string
  location_id: string
  webhook_signature_key: string
  environment: 'production' | 'sandbox'
  has_access_token?: boolean
  has_webhook_signature_key?: boolean
}

interface ProvidersConfig {
  stripe: StripeConfig
  paygate: PaygateConfig
  helcim: HelcimConfig
  square: SquareConfig
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatusBadge({ enabled, visible }: { enabled: boolean; visible: boolean }) {
  if (enabled && visible) {
    return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1"><Check className="h-3 w-3" />Live</Badge>
  }
  if (enabled && !visible) {
    return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">Configured · Hidden</Badge>
  }
  return <Badge className="bg-white/5 text-slate-500 border-white/10">Not configured</Badge>
}

function KeyField({
  label,
  value,
  hasValue,
  placeholder,
  onChange,
  hint,
}: {
  label: string
  value: string
  hasValue?: boolean
  placeholder?: string
  onChange: (v: string) => void
  hint?: string
}) {
  const [show, setShow] = useState(false)

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-400">{label}</Label>
      <div className="relative">
        <Input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={hasValue ? '••••••••  (leave blank to keep existing)' : placeholder}
          className="pr-10 font-mono text-xs bg-black/30 border-white/10 text-white placeholder:text-slate-600"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
        >
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
      {hint && <p className="text-[10px] text-slate-600 italic">{hint}</p>}
    </div>
  )
}

// ─── Provider Cards ───────────────────────────────────────────────────────────

function ProviderCard({
  icon,
  title,
  description,
  accentColor,
  enabled,
  visible,
  onToggleEnabled,
  onToggleVisible,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  accentColor: string
  enabled: boolean
  visible: boolean
  onToggleEnabled: (v: boolean) => void
  onToggleVisible: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Card className={cn('border-white/[0.08] bg-surface-900/50 transition-all', enabled && 'border-white/[0.12]')}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', accentColor)}>
              {icon}
            </div>
            <div>
              <CardTitle className="text-base text-white">{title}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
            </div>
          </div>
          <StatusBadge enabled={enabled} visible={visible} />
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* API keys section */}
        <div className="space-y-3 rounded-xl border border-white/[0.06] bg-black/20 p-4">
          {children}
        </div>

        {/* Toggles */}
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Enabled</p>
              <p className="text-[10px] text-slate-500">Mark this provider as active (requires valid keys)</p>
            </div>
            <Switch checked={enabled} onCheckedChange={onToggleEnabled} />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Show to customers</p>
              <p className="text-[10px] text-slate-500">Display this payment option on the checkout modal</p>
            </div>
            <Switch checked={visible} onCheckedChange={onToggleVisible} disabled={!enabled} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const DEFAULTS: ProvidersConfig = {
  stripe:  { enabled: false, visible: false, secret_key: '', webhook_secret: '', publishable_key: '' },
  paygate: { enabled: false, visible: false, wallet_address: '', api_key: '' },
  helcim:  { enabled: false, visible: false, api_token: '', webhook_secret: '', company_name: '' },
  square:  { enabled: false, visible: false, access_token: '', location_id: '', webhook_signature_key: '', environment: 'production' },
}

export default function PaymentProvidersSettingsPage() {
  const [config, setConfig] = useState<ProvidersConfig>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadConfig() }, [])

  async function loadConfig() {
    try {
      const { data } = await adminAPI.getPaymentProviderSettings()
      setConfig({
        stripe:  { ...DEFAULTS.stripe,  ...(data.stripe  || {}) },
        paygate: { ...DEFAULTS.paygate, ...(data.paygate || {}) },
        helcim:  { ...DEFAULTS.helcim,  ...(data.helcim  || {}) },
        square:  { ...DEFAULTS.square,  ...(data.square  || {}) },
      })
    } catch {
      toast.error('Failed to load payment provider settings')
    } finally {
      setLoading(false)
    }
  }

  const patch = (provider: keyof ProvidersConfig) => (fields: Partial<any>) =>
    setConfig((prev) => ({ ...prev, [provider]: { ...prev[provider], ...fields } }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const { data } = await adminAPI.updatePaymentProviderSettings({
        stripe:  config.stripe,
        paygate: config.paygate,
        helcim:  config.helcim,
        square:  config.square,
      })
      // Re-sync with server's redacted response
      setConfig({
        stripe:  { ...DEFAULTS.stripe,  ...(data.stripe  || {}) },
        paygate: { ...DEFAULTS.paygate, ...(data.paygate || {}) },
        helcim:  { ...DEFAULTS.helcim,  ...(data.helcim  || {}) },
        square:  { ...DEFAULTS.square,  ...(data.square  || {}) },
      })
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

  const s = config.stripe
  const pg = config.paygate
  const h = config.helcim
  const sq = config.square

  const activeCount = [s, pg, h, sq].filter((p) => p.enabled && p.visible).length

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Payment Providers</h1>
          <p className="mt-1 text-sm text-slate-400">
            Configure API keys and control which payment methods customers see at checkout.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save All
        </Button>
      </div>

      {/* Summary bar */}
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

      {/* Provider cards */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">

        {/* ── Stripe ── */}
        <ProviderCard
          icon={<CreditCard className="h-5 w-5" />}
          title="Stripe"
          description="Recurring subscriptions with auto-renewal. Industry standard."
          accentColor="bg-indigo-500/10 text-indigo-400"
          enabled={s.enabled}
          visible={s.visible}
          onToggleEnabled={(v) => patch('stripe')({ enabled: v, visible: v ? s.visible : false })}
          onToggleVisible={(v) => patch('stripe')({ visible: v })}
        >
          <KeyField
            label="Secret Key"
            value={s.secret_key}
            hasValue={s.has_secret_key}
            placeholder="sk_live_..."
            onChange={(v) => patch('stripe')({ secret_key: v })}
            hint="Found in Stripe Dashboard → Developers → API keys"
          />
          <KeyField
            label="Webhook Secret"
            value={s.webhook_secret}
            hasValue={s.has_webhook_secret}
            placeholder="whsec_..."
            onChange={(v) => patch('stripe')({ webhook_secret: v })}
            hint="Webhook endpoint: /webhooks/stripe"
          />
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Publishable Key (optional)</Label>
            <Input
              value={s.publishable_key}
              onChange={(e) => patch('stripe')({ publishable_key: e.target.value })}
              placeholder="pk_live_..."
              className="font-mono text-xs bg-black/30 border-white/10 text-white placeholder:text-slate-600"
            />
          </div>
        </ProviderCard>

        {/* ── PayGate ── */}
        <ProviderCard
          icon={<Wallet className="h-5 w-5" />}
          title="PayGate (Crypto)"
          description="One-time crypto payments via BTC, ETH, LTC. No auto-renewal."
          accentColor="bg-emerald-500/10 text-emerald-400"
          enabled={pg.enabled}
          visible={pg.visible}
          onToggleEnabled={(v) => patch('paygate')({ enabled: v, visible: v ? pg.visible : false })}
          onToggleVisible={(v) => patch('paygate')({ visible: v })}
        >
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Wallet Address</Label>
            <Input
              value={pg.wallet_address}
              onChange={(e) => patch('paygate')({ wallet_address: e.target.value })}
              placeholder="0x..."
              className="font-mono text-xs bg-black/30 border-white/10 text-white placeholder:text-slate-600"
            />
            <p className="text-[10px] text-slate-600 italic">Your receiving wallet address on PayGate.to</p>
          </div>
          <KeyField
            label="API Key"
            value={pg.api_key}
            hasValue={pg.has_api_key}
            placeholder="pg_..."
            onChange={(v) => patch('paygate')({ api_key: v })}
            hint="Webhook endpoint: /webhooks/paygate"
          />
        </ProviderCard>

        {/* ── Helcim ── */}
        <ProviderCard
          icon={<CreditCard className="h-5 w-5" />}
          title="Helcim"
          description="One-time card payments via myhelcim.com. No auto-renewal."
          accentColor="bg-sky-500/10 text-sky-400"
          enabled={h.enabled}
          visible={h.visible}
          onToggleEnabled={(v) => patch('helcim')({ enabled: v, visible: v ? h.visible : false })}
          onToggleVisible={(v) => patch('helcim')({ visible: v })}
        >
          <KeyField
            label="API Token"
            value={h.api_token}
            hasValue={h.has_api_token}
            placeholder="helcim_api_..."
            onChange={(v) => patch('helcim')({ api_token: v })}
            hint="myHelcim Dashboard → Integrations → API"
          />
          <KeyField
            label="Webhook Secret"
            value={h.webhook_secret}
            hasValue={h.has_webhook_secret}
            placeholder="whsec_..."
            onChange={(v) => patch('helcim')({ webhook_secret: v })}
            hint="Webhook endpoint: /webhooks/helcim"
          />
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Company Name (optional)</Label>
            <Input
              value={h.company_name}
              onChange={(e) => patch('helcim')({ company_name: e.target.value })}
              placeholder="Your Company"
              className="text-xs bg-black/30 border-white/10 text-white placeholder:text-slate-600"
            />
          </div>
        </ProviderCard>

        {/* ── Square ── */}
        <ProviderCard
          icon={<ShoppingCart className="h-5 w-5" />}
          title="Square"
          description="One-time card payments via Square checkout. No auto-renewal."
          accentColor="bg-teal-500/10 text-teal-400"
          enabled={sq.enabled}
          visible={sq.visible}
          onToggleEnabled={(v) => patch('square')({ enabled: v, visible: v ? sq.visible : false })}
          onToggleVisible={(v) => patch('square')({ visible: v })}
        >
          <KeyField
            label="Access Token"
            value={sq.access_token}
            hasValue={sq.has_access_token}
            placeholder="EAAAl..."
            onChange={(v) => patch('square')({ access_token: v })}
            hint="Square Developer Dashboard → Credentials → Production Access Token"
          />
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Location ID</Label>
            <Input
              value={sq.location_id}
              onChange={(e) => patch('square')({ location_id: e.target.value })}
              placeholder="L1234567890..."
              className="font-mono text-xs bg-black/30 border-white/10 text-white placeholder:text-slate-600"
            />
            <p className="text-[10px] text-slate-600 italic">Square Dashboard → Locations</p>
          </div>
          <KeyField
            label="Webhook Signature Key"
            value={sq.webhook_signature_key}
            hasValue={sq.has_webhook_signature_key}
            placeholder="signature_key_..."
            onChange={(v) => patch('square')({ webhook_signature_key: v })}
            hint="Webhook endpoint: /webhooks/square  ·  Subscribe to: payment.updated"
          />
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Environment</Label>
            <div className="flex gap-2">
              {(['production', 'sandbox'] as const).map((env) => (
                <button
                  key={env}
                  type="button"
                  onClick={() => patch('square')({ environment: env })}
                  className={cn(
                    'flex-1 rounded-lg border py-2 text-xs font-semibold capitalize transition-all',
                    sq.environment === env
                      ? 'border-teal-500/40 bg-teal-500/10 text-teal-300'
                      : 'border-white/10 bg-white/[0.02] text-slate-500 hover:border-white/20 hover:text-slate-300'
                  )}
                >
                  {env}
                </button>
              ))}
            </div>
          </div>
        </ProviderCard>

      </div>

      {/* Customer preview */}
      <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6">
        <h3 className="text-sm font-semibold text-blue-400 mb-1">Customer Checkout Preview</h3>
        <p className="text-xs text-slate-500 mb-4">Payment methods visible to customers right now:</p>
        <div className="flex flex-wrap gap-3">
          {[
            { key: 'stripe',  label: 'Stripe',            sub: 'Credit card (recurring)', color: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20', cfg: s  },
            { key: 'paygate', label: 'PayGate (Crypto)',   sub: 'BTC / ETH / LTC',         color: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20', cfg: pg },
            { key: 'helcim',  label: 'Helcim',             sub: 'Credit / debit card',     color: 'bg-sky-500/10 text-sky-300 border-sky-500/20',             cfg: h  },
            { key: 'square',  label: 'Square',             sub: 'Credit / debit card',     color: 'bg-teal-500/10 text-teal-300 border-teal-500/20',           cfg: sq },
          ].map(({ label, sub, color, cfg }) =>
            cfg.enabled && cfg.visible ? (
              <div key={label} className={cn('flex items-center gap-2 rounded-xl border px-4 py-2.5', color)}>
                <Check className="h-3.5 w-3.5" />
                <div>
                  <p className="text-xs font-semibold">{label}</p>
                  <p className="text-[10px] opacity-70">{sub}</p>
                </div>
              </div>
            ) : null
          )}
          {/* Credits always shown */}
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-amber-300">
            <Zap className="h-3.5 w-3.5" />
            <div>
              <p className="text-xs font-semibold">Credits</p>
              <p className="text-[10px] opacity-70">Always available</p>
            </div>
          </div>
          {activeCount === 0 && (
            <p className="flex items-center gap-2 text-xs text-slate-500 italic">
              <AlertCircle className="h-3.5 w-3.5" /> No card/crypto providers enabled — only Credits will show.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
