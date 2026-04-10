'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronRight,
  CreditCard,
  ExternalLink,
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
} from 'lucide-react'
import toast from 'react-hot-toast'
import { creditsAPI, marketplaceAPI } from '@/utils/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { SkeletonCard } from '@/components/SkeletonCard'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Offering {
  id: string
  name: string
  description: string | null
  price_cents: number
  billing_period: 'MONTH' | 'YEAR'
  trial_days: number
  features: string[] | null
  is_active: boolean
  stripe_price_id: string | null
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
  offering_name?: string
}

interface CreditTransaction {
  id: string
  amount_cents: number
  type: string
  description: string | null
  status: string
  created_at: string
  offering_name?: string
}

interface PaymentProviders {
  stripe: boolean
  paygate: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const TOPUP_PRESETS = [
  { label: '$10', cents: 1000 },
  { label: '$25', cents: 2500 },
  { label: '$50', cents: 5000 },
  { label: '$100', cents: 10000 },
]

// ─── Payment Method Modal ─────────────────────────────────────────────────────

function PaymentMethodModal({
  offering,
  providers,
  creditBalance,
  onClose,
  onSuccess,
}: {
  offering: Offering
  providers: PaymentProviders
  creditBalance: number
  onClose: () => void
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState<string | null>(null)
  const hasEnoughCredits = creditBalance >= offering.price_cents

  const handlePay = async (method: 'stripe' | 'paygate' | 'credits') => {
    setLoading(method)
    try {
      const { data } = await marketplaceAPI.createCheckout(offering.id, method)

      if (method === 'stripe' && data.checkout_url) {
        window.location.href = data.checkout_url
        return
      }

      if (method === 'paygate' && data.checkout_url) {
        // Store address_in for status polling when user returns
        sessionStorage.setItem('pg_pending_address', data.address_in)
        sessionStorage.setItem('pg_pending_sub_id', data.subscription_id)
        window.location.href = data.checkout_url
        return
      }

      if (method === 'credits') {
        toast.success('Subscription activated with credits!')
        onSuccess()
        onClose()
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Checkout failed')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-3xl border border-white/[0.08] bg-surface-900 p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-lg font-bold text-white">Choose Payment Method</h2>
        <p className="mt-1 text-sm text-slate-400">
          {offering.name} — {formatPrice(offering.price_cents)}/{offering.billing_period.toLowerCase()}
        </p>

        <div className="mt-6 space-y-3">
          {/* Stripe */}
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
                  <p className="font-semibold text-white">Credit / Debit Card</p>
                  <p className="text-xs text-slate-400">Powered by Stripe · Recurring billing</p>
                </div>
              </div>
              {loading === 'stripe' ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              )}
            </button>
          )}

          {/* PayGate */}
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
                  <p className="font-semibold text-white">PayGate.to</p>
                  <p className="text-xs text-slate-400">Card → Crypto · No account required</p>
                </div>
              </div>
              {loading === 'paygate' ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              )}
            </button>
          )}

          {/* Credits */}
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
                <p className="font-semibold text-white">
                  Credits
                  {!hasEnoughCredits && (
                    <span className="ml-2 text-xs font-normal text-red-400">
                      (need {formatPrice(offering.price_cents - creditBalance)} more)
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-400">
                  Balance: {formatPrice(creditBalance)} · Instant activation
                </p>
              </div>
            </div>
            {loading === 'credits' ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-400" />
            )}
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          PayGate payments are one-time — renewal required each period.
        </p>
      </div>
    </div>
  )
}

// ─── Credit Top-Up Modal ──────────────────────────────────────────────────────

function TopupModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: (newBalance: number) => void
}) {
  const [selected, setSelected] = useState(2500)
  const [loading, setLoading] = useState(false)
  const [pendingTxId, setPendingTxId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
    setLoading(true)
    try {
      const { data } = await creditsAPI.topup(selected)
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-3xl border border-white/[0.08] bg-surface-900 p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-lg font-bold text-white">Top Up Credits</h2>
        <p className="mt-1 text-sm text-slate-400">Pay via PayGate.to — credits are added instantly on confirmation.</p>

        {pendingTxId ? (
          <div className="mt-8 flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-brand-400" />
            <p className="text-sm text-slate-300">Waiting for payment confirmation…</p>
            <p className="text-xs text-slate-500">This page will update automatically.</p>
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {TOPUP_PRESETS.map((p) => (
                <button
                  key={p.cents}
                  onClick={() => setSelected(p.cents)}
                  className={`rounded-2xl border p-4 text-center transition-all ${
                    selected === p.cents
                      ? 'border-brand-500 bg-brand-500/10 text-white'
                      : 'border-white/[0.08] text-slate-400 hover:border-white/20 hover:text-white'
                  }`}
                >
                  <p className="text-xl font-bold">{p.label}</p>
                  <p className="text-xs opacity-70">{p.cents / 100 * 100} credits</p>
                </button>
              ))}
            </div>

            <Button
              onClick={handleTopup}
              disabled={loading}
              className="mt-6 w-full gap-2 rounded-2xl py-6 text-base font-semibold"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wallet className="h-5 w-5" />}
              Pay {formatPrice(selected)} via PayGate
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Marketplace Card ─────────────────────────────────────────────────────────

function MarketplaceCard({
  offering,
  isSubscribed,
  onCheckout,
}: {
  offering: Offering
  isSubscribed: boolean
  onCheckout: (offering: Offering) => void
}) {
  const features = offering.features || [
    'Premium IPTV streams',
    'Multiple device support',
    'Electronic Program Guide (EPG)',
    'Fast channel switching',
  ]

  return (
    <Card className="flex h-full flex-col border-white/[0.08] bg-surface-900/50 transition-all hover:border-brand-500/30 hover:bg-surface-900/80">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl font-bold text-white">{offering.name}</CardTitle>
            <CardDescription className="mt-1.5 line-clamp-2 text-slate-400">
              {offering.description || 'High-quality IPTV access with global coverage.'}
            </CardDescription>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
            <Zap className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="mb-6 flex items-baseline gap-1">
          <span className="text-3xl font-bold text-white">{formatPrice(offering.price_cents)}</span>
          <span className="text-sm text-slate-400">/{offering.billing_period.toLowerCase()}</span>
        </div>
        <ul className="space-y-3">
          {features.map((feature, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="pt-2">
        <Button
          className="w-full gap-2 rounded-xl py-6 text-base font-semibold"
          variant={isSubscribed ? 'outline' : 'default'}
          disabled={isSubscribed}
          onClick={() => !isSubscribed && onCheckout(offering)}
        >
          {isSubscribed ? (
            <>
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              Active Subscription
            </>
          ) : (
            <>
              <ShoppingCart className="h-5 w-5" />
              Subscribe Now
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const [offerings, setOfferings] = useState<Offering[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [payments, setPayments] = useState<PaymentTransaction[]>([])
  const [creditBalance, setCreditBalance] = useState(0)
  const [creditTxs, setCreditTxs] = useState<CreditTransaction[]>([])
  const [providers, setProviders] = useState<PaymentProviders>({ stripe: true, paygate: false })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'browse' | 'subscriptions' | 'history' | 'credits'>('browse')
  const [checkoutOffering, setCheckoutOffering] = useState<Offering | null>(null)
  const [showTopup, setShowTopup] = useState(false)

  // Check if returning from a PayGate subscription payment
  const paygateAddressIn = typeof window !== 'undefined' ? sessionStorage.getItem('pg_pending_address') : null
  const [paygateStatus, setPaygateStatus] = useState<'polling' | 'confirmed' | null>(
    paygateAddressIn ? 'polling' : null
  )
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        const [offeringRes, subRes, historyRes, balRes, creditTxRes, provRes] = await Promise.all([
          marketplaceAPI.listOfferings(),
          marketplaceAPI.getSubscriptions(),
          marketplaceAPI.getPaymentHistory({ limit: 10 }),
          creditsAPI.getBalance(),
          creditsAPI.getTransactions({ limit: 10 }),
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

  // Poll for PayGate subscription confirmation if returning from checkout
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

  const handleCheckout = (offering: Offering) => {
    setCheckoutOffering(offering)
  }

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

  const providerLabel = (p?: string) => {
    if (p === 'paygate') return 'PayGate'
    if (p === 'credits') return 'Credits'
    return 'Stripe'
  }

  return (
    <div className="space-y-8 pb-12">
      {/* PayGate pending banner */}
      {paygateStatus === 'polling' && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4">
          <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
          <p className="text-sm text-amber-300">
            Waiting for PayGate payment confirmation… This will update automatically.
          </p>
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

      {/* Hero */}
      <div className="relative overflow-hidden rounded-[32px] border border-white/[0.08] bg-surface-900/40 p-8 md:p-12">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <Badge variant="brand" className="mb-4">StreamBridge Marketplace</Badge>
            <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
              Premium IPTV Access, Simplified.
            </h1>
            <p className="mt-4 text-lg text-slate-400">
              Subscribe with Stripe, PayGate.to, or your credit balance. No manual setup.
            </p>
          </div>
          {/* Credit balance pill */}
          <div
            className="flex cursor-pointer items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-3 transition-all hover:border-amber-500/40"
            onClick={() => setActiveTab('credits')}
          >
            <Zap className="h-5 w-5 text-amber-400" />
            <div>
              <p className="text-xs text-amber-400/70">Credits</p>
              <p className="font-bold text-amber-300">{formatPrice(creditBalance)}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setShowTopup(true) }}
              className="ml-2 flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-500/10 blur-[100px]" />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/5 pb-1">
        {([
          { key: 'browse', icon: LayoutGrid, label: 'Browse Offerings' },
          { key: 'subscriptions', icon: Receipt, label: 'My Subscriptions' },
          { key: 'history', icon: History, label: 'Payment History' },
          { key: 'credits', icon: Zap, label: 'Credits' },
        ] as const).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === key ? 'border-b-2 border-brand-500 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>

        ) : activeTab === 'browse' ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {offerings.filter(o => o.is_active).map((offering) => (
              <MarketplaceCard
                key={offering.id}
                offering={offering}
                isSubscribed={subscriptions.some(s => s.offering_id === offering.id && s.status === 'active')}
                onCheckout={handleCheckout}
              />
            ))}
            {offerings.filter(o => o.is_active).length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 py-20 text-center">
                <LayoutGrid className="h-12 w-12 text-slate-600" />
                <h3 className="mt-4 text-lg font-medium text-white">No offerings available</h3>
                <p className="mt-2 text-slate-400">Check back soon for new premium networks.</p>
              </div>
            )}
          </div>

        ) : activeTab === 'subscriptions' ? (
          <div className="space-y-4">
            {subscriptions.map((sub) => (
              <div
                key={sub.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-surface-900/40 p-6"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
                    <Zap className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{sub.offering_name || 'Premium IPTV Plan'}</h3>
                    <p className="text-sm text-slate-400">
                      {sub.status === 'pending_payment' ? (
                        <span className="text-amber-400">Awaiting payment…</span>
                      ) : (
                        <>
                          Ends {formatDate(sub.current_period_end)}
                          {sub.cancel_at_period_end && <span className="ml-2 text-orange-400">(Cancelling)</span>}
                        </>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">via {providerLabel(sub.payment_provider)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={sub.status === 'active' ? 'success' : 'outline'}>
                    {sub.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                  {sub.payment_provider === 'stripe' ? (
                    <Button variant="outline" size="sm" onClick={handlePortal} className="gap-2 rounded-lg">
                      <ExternalLink className="h-4 w-4" />
                      Manage Billing
                    </Button>
                  ) : sub.status !== 'cancelled' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 rounded-lg text-red-400 hover:text-red-300"
                      onClick={async () => {
                        try {
                          await marketplaceAPI.cancelSubscription(sub.id)
                          const { data } = await marketplaceAPI.getSubscriptions()
                          setSubscriptions(data)
                          toast.success('Subscription cancelled')
                        } catch {
                          toast.error('Failed to cancel')
                        }
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {subscriptions.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 py-20 text-center">
                <Receipt className="h-12 w-12 text-slate-600" />
                <h3 className="mt-4 text-lg font-medium text-white">No active subscriptions</h3>
                <Button variant="outline" className="mt-6 rounded-xl" onClick={() => setActiveTab('browse')}>
                  Browse Marketplace
                </Button>
              </div>
            )}
          </div>

        ) : activeTab === 'history' ? (
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-surface-900/40">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="px-6 py-4 font-semibold text-slate-300">Transaction</th>
                  <th className="px-6 py-4 font-semibold text-slate-300">Date</th>
                  <th className="px-6 py-4 font-semibold text-slate-300">Amount</th>
                  <th className="px-6 py-4 font-semibold text-slate-300">Provider</th>
                  <th className="px-6 py-4 font-semibold text-slate-300">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {payments.map((tx) => (
                  <tr key={tx.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <CreditCard className="h-4 w-4 text-slate-400" />
                        <span className="font-medium text-white">{tx.offering_name || 'Subscription Payment'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-400">{formatDate(tx.created_at)}</td>
                    <td className="px-6 py-4 font-mono text-white">{formatPrice(tx.amount_cents)}</td>
                    <td className="px-6 py-4 text-slate-400">{providerLabel(tx.payment_provider)}</td>
                    <td className="px-6 py-4">
                      <Badge variant={tx.status === 'succeeded' ? 'success' : 'outline'}>{tx.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {payments.length === 0 && (
              <div className="py-20 text-center">
                <History className="mx-auto h-12 w-12 text-slate-600" />
                <p className="mt-4 text-slate-400">No payment history found.</p>
              </div>
            )}
          </div>

        ) : (
          /* Credits Tab */
          <div className="space-y-6">
            {/* Balance card */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-amber-500/20 bg-amber-500/5 p-8">
              <div>
                <p className="text-sm text-amber-400/70">Available Credits</p>
                <p className="mt-1 text-5xl font-bold text-amber-300">{formatPrice(creditBalance)}</p>
                <p className="mt-2 text-sm text-slate-400">
                  Use credits to subscribe to any plan instantly — no card required.
                </p>
              </div>
              <Button
                onClick={() => setShowTopup(true)}
                className="gap-2 rounded-2xl px-6 py-5 text-base font-semibold"
              >
                <Plus className="h-5 w-5" />
                Top Up Credits
              </Button>
            </div>

            {/* Credit transaction history */}
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-surface-900/40">
              <div className="border-b border-white/5 px-6 py-4">
                <h3 className="font-semibold text-white">Credit History</h3>
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.02]">
                    <th className="px-6 py-4 font-semibold text-slate-300">Description</th>
                    <th className="px-6 py-4 font-semibold text-slate-300">Date</th>
                    <th className="px-6 py-4 font-semibold text-slate-300">Amount</th>
                    <th className="px-6 py-4 font-semibold text-slate-300">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {creditTxs.map((tx) => (
                    <tr key={tx.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {tx.amount_cents > 0 ? (
                            <Plus className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <Zap className="h-4 w-4 text-amber-400" />
                          )}
                          <span className="font-medium text-white">
                            {tx.description || tx.type.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-400">{formatDate(tx.created_at)}</td>
                      <td className={`px-6 py-4 font-mono font-semibold ${tx.amount_cents > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {tx.amount_cents > 0 ? '+' : ''}{formatPrice(Math.abs(tx.amount_cents))}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={tx.status === 'completed' ? 'success' : tx.status === 'pending' ? 'outline' : 'outline'}>
                          {tx.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {creditTxs.length === 0 && (
                <div className="py-20 text-center">
                  <Wallet className="mx-auto h-12 w-12 text-slate-600" />
                  <p className="mt-4 text-slate-400">No credit transactions yet.</p>
                  <Button variant="outline" className="mt-6 rounded-xl" onClick={() => setShowTopup(true)}>
                    Top Up Now
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Payment method modal */}
      {checkoutOffering && (
        <PaymentMethodModal
          offering={checkoutOffering}
          providers={providers}
          creditBalance={creditBalance}
          onClose={() => setCheckoutOffering(null)}
          onSuccess={handleCheckoutSuccess}
        />
      )}

      {/* Top-up modal */}
      {showTopup && (
        <TopupModal
          onClose={() => setShowTopup(false)}
          onSuccess={(newBalance) => {
            setCreditBalance(newBalance)
            creditsAPI.getTransactions({ limit: 10 }).then(({ data }) => setCreditTxs(data))
          }}
        />
      )}
    </div>
  )
}
