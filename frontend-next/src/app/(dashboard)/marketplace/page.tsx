'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Check,
  ChevronRight,
  CreditCard,
  ExternalLink,
  Globe2,
  History,
  LayoutGrid,
  Loader2,
  Plus,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Wallet,
  X,
  Zap,
  Info,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { creditsAPI, marketplaceAPI } from '@/utils/api'
import { getCountryOption } from '@/lib/countries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import SkeletonCard from '@/components/SkeletonCard'
import { cn } from '@/lib/utils'

interface Offering {
  id: string
  name: string
  description: string | null
  price_cents: number
  currency: string
  billing_period: 'day' | 'month' | 'year'
  billing_interval_count?: number
  trial_days: number
  features: string[] | null
  is_active: boolean
  stripe_price_id: string | null
  group_id?: string
  is_trial?: boolean
  countries?: string[]
  tags?: string[]
  live_count?: number
  vod_count?: number
  network_name?: string
}

interface Subscription {
  id: string
  offering_id: string
  status: string
  current_period_end: string
  cancel_at_period_end: boolean
  payment_provider?: string
  offering_name?: string
}

interface PaymentTransaction {
  id: string
  amount_cents: number
  currency: string
  status: string
  payment_provider?: string
  created_at: string
}

interface CreditTransaction {
  id: string
  amount_cents: number
  type: string
  description: string | null
  status: string
  created_at: string
}

interface PaymentProviders {
  stripe: boolean
  paygate: boolean
}

function formatPrice(cents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatPeriod(period: string, count: number = 1) {
  if (count === 1) return period === 'day' ? 'daily' : period === 'month' ? 'monthly' : 'yearly'
  return `every ${count} ${period}s`
}

function getDurationLabel(offering: Offering) {
  const count = offering.billing_interval_count || 1
  if (offering.is_trial) return `${offering.trial_days || count} Day Trial`
  if (count === 1) {
    if (offering.billing_period === 'day') return '1 Day'
    if (offering.billing_period === 'month') return '1 Month'
    if (offering.billing_period === 'year') return '1 Year'
  }
  return `${count} ${offering.billing_period}${count > 1 ? 's' : ''}`
}

function PaymentMethodModal({
  offerings, // Grouped offerings
  providers,
  creditBalance,
  onClose,
  onSuccess,
  onTopup,
}: {
  offerings: Offering[]
  providers: PaymentProviders
  creditBalance: number
  onClose: () => void
  onSuccess: () => void
  onTopup: () => void
}) {
  const [selectedId, setSelectedId] = useState(offerings[0]?.id)
  const [loading, setLoading] = useState<string | null>(null)
  const [autoRenew, setAutoRenew] = useState(true)
  
  const selectedOffering = offerings.find((o) => o.id === selectedId) || offerings[0]
  const hasEnoughCredits = creditBalance >= selectedOffering.price_cents

  const handlePay = async (method: 'stripe' | 'paygate' | 'credits', confirmDuplicate = false) => {
    setLoading(method)
    try {
      const { data } = await marketplaceAPI.createCheckout(selectedOffering.id, method, confirmDuplicate, {
        plan_code: selectedOffering.id, // we don't have explicit plan_code field on offering, we use id if grouping
        auto_renew: autoRenew,
      })

      if (method === 'stripe' && data.checkout_url) {
        window.location.href = data.checkout_url
        return
      }

      if (method === 'paygate' && data.checkout_url) {
        sessionStorage.setItem('pg_pending_address', data.address_in)
        sessionStorage.setItem('pg_pending_sub_id', data.subscription_id)
        window.location.href = data.checkout_url
        return
      }

      if (method === 'credits') {
        // Credits are instant — go to provisioning page to show live status
        if (data.subscription_id) {
          window.location.href = `/subscriptions/provisioning/${data.subscription_id}`
        } else {
          toast.success('Subscription activated with credits!')
          onSuccess()
          onClose()
        }
      }
    } catch (err: any) {
      if (err.response?.status === 409 && err.response?.data?.warning === 'already_subscribed') {
        if (window.confirm(err.response.data.message)) {
          handlePay(method, true)
          return
        }
      } else if (err.response?.status === 402) {
        toast.error('Insufficient credits. Top up your balance to continue.')
      } else {
        toast.error(err.response?.data?.error || 'Checkout failed')
      }
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-xl rounded-3xl border border-white/[0.08] bg-surface-900 p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <button onClick={onClose} className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white transition-colors">
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-xl font-bold text-white">Activate Subscription</h2>
        <p className="mt-1 text-sm text-slate-400">{selectedOffering.name}</p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 block">Select Plan Duration</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {offerings.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setSelectedId(o.id)}
                  className={cn(
                    "rounded-xl border p-3 text-center transition-all",
                    selectedId === o.id
                      ? "border-brand-500 bg-brand-500/10 text-white"
                      : "border-white/[0.08] bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-white"
                  )}
                >
                  <p className="text-xs font-bold">{getDurationLabel(o)}</p>
                  <p className="mt-0.5 text-[10px] opacity-70">{formatPrice(o.price_cents)}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-slate-400" />
              <div>
                <p className="text-sm font-semibold text-white">Auto-renewal</p>
                <p className="text-[10px] text-slate-400">Card only. Manual renewal for credits/crypto.</p>
              </div>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} className="peer sr-only" />
              <div className="h-5 w-9 rounded-full bg-white/10 peer-checked:bg-brand-500 transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
            </label>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 block">Payment Method</label>
            
            {providers.stripe && (
              <button
                onClick={() => handlePay('stripe')}
                disabled={!!loading}
                className="flex w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 transition-all hover:border-brand-500/40 hover:bg-white/[0.06] disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-white">Stripe Checkout</p>
                    <p className="text-[10px] text-slate-400">Secure credit card processing</p>
                  </div>
                </div>
                {loading === 'stripe' ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
              </button>
            )}

            {providers.paygate && (
              <button
                onClick={() => handlePay('paygate')}
                disabled={!!loading}
                className="flex w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 transition-all hover:border-emerald-500/40 hover:bg-white/[0.06] disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-white">PayGate (Crypto)</p>
                    <p className="text-[10px] text-slate-400">Instant activation via BTC/ETH/LTC</p>
                  </div>
                </div>
                {loading === 'paygate' ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
              </button>
            )}

            <button
              onClick={() => handlePay('credits')}
              disabled={!!loading || !hasEnoughCredits}
              className="flex w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 transition-all hover:border-amber-500/40 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                  <Zap className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-white">Use Credits</p>
                  <p className="text-[10px] text-slate-400">Current balance: {formatPrice(creditBalance)}</p>
                </div>
              </div>
              {loading === 'credits' ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
            </button>
          </div>

          {!hasEnoughCredits && (
            <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/10 p-4">
              <p className="text-xs font-medium text-red-300">
                Insufficient credits for this plan. You need {formatPrice(selectedOffering.price_cents - creditBalance)} more.
              </p>
              <Button onClick={onTopup} variant="outline" className="mt-3 w-full h-9 gap-2 rounded-xl border-red-500/30 bg-transparent text-xs text-red-200 hover:bg-red-500/10">
                <Plus className="h-3 w-3" />
                Buy Credits First
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MarketplaceCard({
  offeringGroup,
  isSubscribed,
  onCheckout,
}: {
  offeringGroup: Offering[]
  isSubscribed: boolean
  onCheckout: (group: Offering[]) => void
}) {
  const base = offeringGroup[0]
  const cheapest = [...offeringGroup].sort((a, b) => a.price_cents - b.price_cents)[0]
  const features = base.features || ['Premium global streams', 'Multiple connections', 'VOD & Live TV catalog']
  const countries = base.countries || []
  const tags = base.tags || []

  return (
    <Card className="flex h-full flex-col border-white/[0.08] bg-surface-900/50 transition-all hover:border-brand-500/30 hover:bg-surface-900/80 group">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-xl font-bold text-white truncate">{base.name}</CardTitle>
            <CardDescription className="mt-1.5 line-clamp-2 text-slate-400">
              {base.description || 'High-quality IPTV access with global coverage.'}
            </CardDescription>
          </div>
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400 group-hover:bg-brand-500/20 transition-colors">
            <Zap className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 space-y-5">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-white">{formatPrice(cheapest.price_cents)}</span>
            <span className="text-xs text-slate-400">from / {getDurationLabel(cheapest)}</span>
          </div>
          {offeringGroup.length > 1 && (
            <p className="mt-1 text-[10px] font-semibold text-brand-400 uppercase tracking-widest">{offeringGroup.length} durations available</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Live Channels</p>
            <p className="mt-1 text-lg font-bold text-white">{Number(base.live_count || 0).toLocaleString()}</p>
          </div>
          <div className="text-center border-l border-white/5 pl-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">VOD Content</p>
            <p className="mt-1 text-lg font-bold text-white">{Number(base.vod_count || 0).toLocaleString()}</p>
          </div>
        </div>

        {(countries.length > 0 || tags.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {countries.slice(0, 4).map((code) => {
              const opt = getCountryOption(code)
              return (
                <Badge key={code} variant="outline" className="border-white/10 bg-white/[0.02] gap-1.5 py-1 px-2.5">
                  <span className="text-base leading-none">{opt?.flag || '🌐'}</span>
                  <span className="text-[10px] font-bold text-slate-300">{opt?.name || code}</span>
                </Badge>
              )
            })}
            {tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="bg-slate-800 text-slate-400 text-[10px] font-bold tracking-wider py-1">{tag.toUpperCase()}</Badge>
            ))}
          </div>
        )}

        <ul className="space-y-3">
          {features.slice(0, 4).map((feature, index) => (
            <li key={index} className="flex items-start gap-3 text-sm text-slate-300">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
              <span className="text-xs leading-relaxed">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="pt-2">
        {isSubscribed ? (
          <Button asChild className="w-full gap-2 rounded-xl py-6 text-base font-semibold" variant="outline">
            <Link href="/subscriptions">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              Manage Subscription
            </Link>
          </Button>
        ) : (
          <Button className="w-full gap-2 rounded-xl py-6 text-base font-semibold shadow-lg shadow-brand-500/10" onClick={() => onCheckout(offeringGroup)}>
            <ShoppingCart className="h-5 w-5" />
            Get Started
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

function TopupModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: (newBalance: number) => void
}) {
  const [config, setConfig] = useState<{
    min_topup_cents: number
    max_topup_cents: number
    presets: { label: string; cents: number }[]
    allow_custom_amount: boolean
  } | null>(null)
  const [selected, setSelected] = useState<number | 'custom'>(2500)
  const [customAmount, setCustomAmount] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [pendingTxId, setPendingTxId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    creditsAPI.getCreditsConfig().then(({ data }) => {
      setConfig(data)
      if (data.presets?.length > 0) setSelected(data.presets[0].cents)
    }).catch(() => {
      toast.error('Failed to load credit configuration')
    })
  }, [])

  const startPolling = useCallback((txId: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await creditsAPI.getTopupStatus(txId)
        if (data.status === 'completed') {
          clearInterval(pollRef.current!)
          toast.success(`${formatPrice(data.amount_cents)} credits added!`)
          const { data: bal } = await creditsAPI.getBalance()
          onSuccess(bal.balance_cents)
          onClose()
        }
      } catch {}
    }, 5000)
  }, [onClose, onSuccess])

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const handleTopup = async () => {
    let amountCents = 0
    if (selected === 'custom') {
      amountCents = Math.round(parseFloat(customAmount) * 100)
      if (isNaN(amountCents) || amountCents <= 0) return toast.error('Enter a valid amount')
    } else {
      amountCents = selected
    }

    if (config) {
      if (amountCents < config.min_topup_cents) return toast.error(`Minimum top-up is ${formatPrice(config.min_topup_cents)}`)
      if (amountCents > config.max_topup_cents) return toast.error(`Maximum top-up is ${formatPrice(config.max_topup_cents)}`)
    }

    setLoading(true)
    try {
      const { data } = await creditsAPI.topup(amountCents)
      setPendingTxId(data.credit_transaction_id)
      sessionStorage.setItem('pg_topup_tx', data.credit_transaction_id)
      startPolling(data.credit_transaction_id)
      window.open(data.checkout_url, '_blank')
      toast('Complete payment in the new tab, then return here.', { icon: '🔗' })
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to initiate top-up')
      setLoading(false)
    }
  }

  if (!config) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <div className="flex h-32 w-32 items-center justify-center rounded-3xl border border-white/10 bg-surface-900">
          <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-3xl border border-white/[0.08] bg-surface-900 p-6 shadow-2xl">
        <button onClick={onClose} className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-lg font-bold text-white">Top Up Credits</h2>
        <p className="mt-1 text-sm text-slate-400">Pay via PayGate.to — credits are added on confirmation.</p>

        {pendingTxId ? (
          <div className="mt-8 flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-brand-400" />
            <p className="text-sm text-slate-300">Waiting for payment confirmation…</p>
            <p className="text-xs text-slate-500">This page will update automatically.</p>
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {config.presets.map((preset) => (
                <button
                  key={preset.cents}
                  onClick={() => setSelected(preset.cents)}
                  className={`rounded-2xl border p-4 text-center transition-all ${
                    selected === preset.cents
                      ? 'border-brand-500 bg-brand-500/10 text-white'
                      : 'border-white/[0.08] text-slate-400 hover:border-white/20 hover:text-white'
                  }`}
                >
                  <p className="text-xl font-bold">{preset.label}</p>
                  <p className="text-xs opacity-70">{preset.cents} credits</p>
                </button>
              ))}

              {config.allow_custom_amount && (
                <button
                  onClick={() => setSelected('custom')}
                  className={`rounded-2xl border p-4 text-center transition-all ${
                    selected === 'custom'
                      ? 'border-brand-500 bg-brand-500/10 text-white'
                      : 'border-white/[0.08] text-slate-400 hover:border-white/20 hover:text-white'
                  }`}
                >
                  <p className="text-xl font-bold">Custom</p>
                  <p className="text-xs opacity-70">Any amount</p>
                </button>
              )}
            </div>

            {selected === 'custom' && (
              <div className="mt-4 animate-in fade-in slide-in-from-top-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Amount (USD)</label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">$</div>
                  <input
                    type="number"
                    step="0.01"
                    autoFocus
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    placeholder="20.00"
                    className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] py-4 pl-8 pr-4 text-white focus:border-brand-500/50 focus:outline-none"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">Min: {formatPrice(config.min_topup_cents)} · Max: {formatPrice(config.max_topup_cents)}</p>
              </div>
            )}

            <Button onClick={handleTopup} disabled={loading} className="mt-6 w-full gap-2 rounded-2xl py-6 text-base font-semibold">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wallet className="h-5 w-5" />}
              Pay {selected === 'custom' ? (customAmount ? `$${customAmount}` : '...') : formatPrice(selected)} via PayGate
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

export default function MarketplacePage() {
  const [offerings, setOfferings] = useState<Offering[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [payments, setPayments] = useState<PaymentTransaction[]>([])
  const [creditBalance, setCreditBalance] = useState(0)
  const [creditTxs, setCreditTxs] = useState<CreditTransaction[]>([])
  const [providers, setProviders] = useState<PaymentProviders>({ stripe: true, paygate: false })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'browse' | 'subscriptions' | 'history' | 'credits'>('browse')
  const [checkoutGroup, setCheckoutGroup] = useState<Offering[] | null>(null)
  const [showTopup, setShowTopup] = useState(false)

  const paygateAddressIn = typeof window !== 'undefined' ? sessionStorage.getItem('pg_pending_address') : null
  const [paygateStatus, setPaygateStatus] = useState<'polling' | 'confirmed' | null>(paygateAddressIn ? 'polling' : null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        const [offeringRes, subRes, historyRes, balRes, creditTxRes, provRes] = await Promise.all([
          marketplaceAPI.listOfferings(),
          marketplaceAPI.getSubscriptions(),
          marketplaceAPI.getPaymentHistory({ limit: 15 }),
          creditsAPI.getBalance(),
          creditsAPI.getTransactions({ limit: 15 }),
          marketplaceAPI.getPaymentProviders(),
        ])
        setOfferings(offeringRes.data)
        setSubscriptions(subRes.data)
        setPayments(historyRes.data)
        setCreditBalance(balRes.data.balance_cents)
        setCreditTxs(creditTxRes.data)
        setProviders(provRes.data)
      } catch {
        toast.error('Failed to load marketplace data')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  useEffect(() => {
    if (!paygateAddressIn) return

    pollRef.current = setInterval(async () => {
      try {
        const { data } = await marketplaceAPI.getPaygateStatus(paygateAddressIn)
        if (data.status === 'active') {
          clearInterval(pollRef.current!)
          sessionStorage.removeItem('pg_pending_address')
          sessionStorage.removeItem('pg_pending_sub_id')
          setPaygateStatus('confirmed')
          toast.success('Payment confirmed! Your subscription is now active.')
          const { data: subs } = await marketplaceAPI.getSubscriptions()
          setSubscriptions(subs)
        }
      } catch {}
    }, 6000)

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [paygateAddressIn])

  const handleCheckoutSuccess = async () => {
    const [subRes] = await Promise.all([marketplaceAPI.getSubscriptions()])
    setSubscriptions(subRes.data)
    const { data: bal } = await creditsAPI.getBalance()
    setCreditBalance(bal.balance_cents)
  }

  const handlePortal = async () => {
    try {
      const { data } = await marketplaceAPI.getPortalUrl()
      window.location.href = data.portal_url
    } catch {
      toast.error('Could not open billing portal')
    }
  }

  const groupedOfferings = useMemo(() => {
    const groups: Record<string, Offering[]> = {}
    offerings.filter(o => o.is_active).forEach((o) => {
      const gId = o.group_id || o.id
      if (!groups[gId]) groups[gId] = []
      groups[gId].push(o)
    })
    return Object.values(groups)
  }, [offerings])

  const providerLabel = (provider?: string) => {
    if (provider === 'paygate') return 'PayGate'
    if (provider === 'credits') return 'Credits'
    return 'Stripe'
  }

  return (
    <div className="space-y-8 pb-12">
      {paygateStatus === 'polling' && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4">
          <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
          <p className="text-sm text-amber-300">Waiting for PayGate payment confirmation… This will update automatically.</p>
          <button
            onClick={() => {
              clearInterval(pollRef.current!)
              sessionStorage.removeItem('pg_pending_address')
              setPaygateStatus(null)
            }}
            className="ml-auto text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="relative overflow-hidden rounded-[40px] border border-white/[0.08] bg-surface-900/40 p-8 md:p-14">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-10">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-6">
              <span className="h-px w-8 bg-brand-500/50" />
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-400">Premium Marketplace</p>
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white md:text-6xl lg:text-7xl">IPTV Simplified.</h1>
            <p className="mt-6 text-lg text-slate-400 leading-relaxed max-w-xl">
              High-performance global streaming networks. 
              Activate instantly using card, crypto, or account credits.
            </p>
          </div>
          
          <div className="group cursor-pointer rounded-3xl border border-amber-500/20 bg-amber-500/5 p-6 backdrop-blur-md transition-all hover:border-amber-500/40 hover:bg-amber-500/10" onClick={() => setActiveTab('credits')}>
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400">
                <Zap className="h-8 w-8" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500/70">Wallet Balance</p>
                <p className="text-3xl font-bold text-amber-300">{formatPrice(creditBalance)}</p>
              </div>
            </div>
            <Button onClick={(e) => { e.stopPropagation(); setShowTopup(true) }} className="mt-5 w-full gap-2 rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30">
              <Plus className="h-4 w-4" />
              Top Up
            </Button>
          </div>
        </div>
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-500/5 blur-[120px]" />
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-white/5 pb-1">
        {([
          { key: 'browse', icon: LayoutGrid, label: 'Store' },
          { key: 'subscriptions', icon: Receipt, label: 'My Plans' },
          { key: 'history', icon: History, label: 'Transactions' },
          { key: 'credits', icon: Zap, label: 'Wallet' },
        ] as const).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex items-center gap-2 px-6 py-4 text-xs font-bold uppercase tracking-widest transition-all",
              activeTab === key ? "border-b-2 border-brand-500 text-white" : "text-slate-500 hover:text-slate-200"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-[500px]">
        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : activeTab === 'browse' ? (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {groupedOfferings.map((group) => (
              <MarketplaceCard
                key={group[0].group_id || group[0].id}
                offeringGroup={group}
                isSubscribed={subscriptions.some((sub) => group.some(o => o.id === sub.offering_id) && sub.status === 'active')}
                onCheckout={setCheckoutGroup}
              />
            ))}
          </div>
        ) : activeTab === 'subscriptions' ? (
          <div className="grid gap-4">
            {subscriptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 p-20 text-center">
                <Receipt className="h-12 w-12 text-slate-700 mb-4" />
                <h3 className="text-xl font-bold text-slate-300">No active plans found</h3>
                <p className="mt-2 text-slate-500">Subscribe to an offering in the store to get started.</p>
                <Button onClick={() => setActiveTab('browse')} className="mt-6 gap-2 rounded-xl">
                  Browse Store
                </Button>
              </div>
            ) : subscriptions.map((sub) => (
              <div key={sub.id} className="flex flex-wrap items-center justify-between gap-6 rounded-3xl border border-white/[0.08] bg-surface-900/40 p-8 transition-colors hover:bg-surface-900/60">
                <div className="flex items-center gap-6">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-400">
                    <Zap className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{sub.offering_name || 'Active Subscription'}</h3>
                    <div className="flex items-center gap-3 mt-1 text-sm text-slate-400">
                      <span>Ends {formatDate(sub.current_period_end)}</span>
                      <span className="h-1 w-1 rounded-full bg-slate-700" />
                      <span className="capitalize">via {providerLabel(sub.payment_provider)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant={sub.status === 'active' ? 'success' : 'outline'} className="rounded-lg py-1 px-3">{sub.status.toUpperCase()}</Badge>
                  {sub.payment_provider === 'stripe' ? (
                    <Button variant="outline" size="sm" onClick={handlePortal} className="gap-2 rounded-xl h-10 px-4">
                      <ExternalLink className="h-4 w-4" />
                      Manage
                    </Button>
                  ) : sub.status !== 'cancelled' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 rounded-xl h-10 px-4 text-red-400 border-red-500/20 hover:bg-red-500/10 hover:border-red-500/40"
                      onClick={async () => {
                        if (confirm('Cancel this subscription?')) {
                          try {
                            await marketplaceAPI.cancelSubscription(sub.id)
                            const { data } = await marketplaceAPI.getSubscriptions()
                            setSubscriptions(data)
                            toast.success('Cancelled')
                          } catch { toast.error('Failed to cancel') }
                        }
                      }}
                    >
                      Cancel Plan
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : activeTab === 'history' ? (
          <div className="overflow-hidden rounded-3xl border border-white/[0.08] bg-surface-900/40">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="px-8 py-5 font-bold uppercase tracking-widest text-[10px] text-slate-500">Transaction</th>
                  <th className="px-8 py-5 font-bold uppercase tracking-widest text-[10px] text-slate-500">Date</th>
                  <th className="px-8 py-5 font-bold uppercase tracking-widest text-[10px] text-slate-500">Amount</th>
                  <th className="px-8 py-5 font-bold uppercase tracking-widest text-[10px] text-slate-500">Provider</th>
                  <th className="px-8 py-5 font-bold uppercase tracking-widest text-[10px] text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {payments.map((tx) => (
                  <tr key={tx.id} className="transition-colors hover:bg-white/[0.01]">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4 text-slate-200">
                        <Receipt className="h-4 w-4 text-slate-600" />
                        <span className="font-semibold">{tx.payment_provider === 'stripe' ? 'Subscription' : 'Purchase'}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-slate-400 font-mono text-xs">{formatDate(tx.created_at)}</td>
                    <td className="px-8 py-5 font-bold text-white">{formatPrice(tx.amount_cents)}</td>
                    <td className="px-8 py-5">
                      <Badge variant="outline" className="text-[10px] border-white/10 uppercase tracking-tighter">{providerLabel(tx.payment_provider)}</Badge>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2">
                        <div className={cn("h-1.5 w-1.5 rounded-full", tx.status === 'succeeded' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-500")} />
                        <span className="text-xs font-bold text-slate-300 capitalize">{tx.status}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {creditTxs.map((tx) => (
                <div key={tx.id} className="rounded-3xl border border-white/[0.08] bg-surface-900/40 p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className={cn("h-10 w-10 flex items-center justify-center rounded-xl", tx.amount_cents > 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-brand-500/10 text-brand-400")}>
                        {tx.amount_cents > 0 ? <Plus className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
                      </div>
                      <Badge variant={tx.status === 'completed' ? 'success' : 'outline'} className="text-[10px]">{tx.status.toUpperCase()}</Badge>
                    </div>
                    <p className="text-sm font-bold text-white leading-relaxed">{tx.description || tx.type.replace(/_/g, ' ')}</p>
                    <p className="mt-1 text-xs text-slate-500 font-mono">{formatDate(tx.created_at)}</p>
                  </div>
                  <div className="mt-6 flex items-baseline gap-2">
                    <span className={cn("text-2xl font-bold", tx.amount_cents > 0 ? "text-emerald-400" : "text-slate-200")}>
                      {tx.amount_cents > 0 ? '+' : '-'}{formatPrice(Math.abs(tx.amount_cents))}
                    </span>
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Credits</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {checkoutGroup && (
        <PaymentMethodModal
          offerings={checkoutGroup}
          providers={providers}
          creditBalance={creditBalance}
          onClose={() => setCheckoutGroup(null)}
          onSuccess={handleCheckoutSuccess}
          onTopup={() => {
            setCheckoutGroup(null)
            setShowTopup(true)
            setActiveTab('credits')
          }}
        />
      )}

      {showTopup && (
        <TopupModal
          onClose={() => setShowTopup(false)}
          onSuccess={(newBalance) => {
            setCreditBalance(newBalance)
            creditsAPI.getTransactions({ limit: 15 }).then(({ data }) => setCreditTxs(data))
          }}
        />
      )}
    </div>
  )
}
