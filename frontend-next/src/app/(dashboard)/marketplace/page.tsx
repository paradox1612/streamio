'use client'

import { useEffect, useState } from 'react'
import {
  Check,
  CreditCard,
  ExternalLink,
  History,
  LayoutGrid,
  Loader2,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { marketplaceAPI } from '@/utils/api'
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
  offering_name?: string
}

interface PaymentTransaction {
  id: string
  amount_cents: number
  currency: string
  status: string
  created_at: string
  offering_name?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ─── Components ───────────────────────────────────────────────────────────────

function MarketplaceCard({
  offering,
  isSubscribed,
  onCheckout,
}: {
  offering: Offering
  isSubscribed: boolean
  onCheckout: (id: string) => void
}) {
  const [loading, setLoading] = useState(false)

  const handleAction = async () => {
    if (isSubscribed) return
    setLoading(true)
    try {
      await onCheckout(offering.id)
    } finally {
      setLoading(false)
    }
  }

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
          disabled={loading || isSubscribed}
          onClick={handleAction}
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isSubscribed ? (
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

export default function MarketplacePage() {
  const [offerings, setOfferings] = useState<Offering[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [payments, setPayments] = useState<PaymentTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'browse' | 'subscriptions' | 'history'>('browse')

  useEffect(() => {
    async function loadData() {
      try {
        const [offeringRes, subRes, historyRes] = await Promise.all([
          marketplaceAPI.listOfferings(),
          marketplaceAPI.getSubscriptions(),
          marketplaceAPI.getPaymentHistory({ limit: 10 }),
        ])
        setOfferings(offeringRes.data)
        setSubscriptions(subRes.data)
        setPayments(historyRes.data)
      } catch (err) {
        toast.error('Failed to load marketplace data')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const handleCheckout = async (offeringId: string) => {
    try {
      const { data } = await marketplaceAPI.createCheckout(offeringId)
      if (data.checkout_url) {
        window.location.href = data.checkout_url
      } else {
        toast.error('Could not initiate checkout')
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Checkout failed')
    }
  }

  const handlePortal = async () => {
    try {
      const { data } = await marketplaceAPI.getPortalUrl()
      window.location.href = data.portal_url
    } catch (err) {
      toast.error('Could not open billing portal')
    }
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Hero / Header */}
      <div className="relative overflow-hidden rounded-[32px] border border-white/[0.08] bg-surface-900/40 p-8 md:p-12">
        <div className="relative z-10 max-w-2xl">
          <Badge variant="brand" className="mb-4">StreamBridge Marketplace</Badge>
          <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Premium IPTV Access, Simplified.
          </h1>
          <p className="mt-4 text-lg text-slate-400">
            Subscribe to managed IPTV networks with one-click checkout. No manual setup, automated credentials, 
            and unified billing through Stripe.
          </p>
        </div>
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-500/10 blur-[100px]" />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/5 pb-1">
        <button
          onClick={() => setActiveTab('browse')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'browse' ? 'border-b-2 border-brand-500 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutGrid className="h-4 w-4" />
          Browse Offerings
        </button>
        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'subscriptions' ? 'border-b-2 border-brand-500 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Receipt className="h-4 w-4" />
          My Subscriptions
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'history' ? 'border-b-2 border-brand-500 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="h-4 w-4" />
          Payment History
        </button>
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
                      Ends on {formatDate(sub.current_period_end)}
                      {sub.cancel_at_period_end && <span className="ml-2 text-orange-400">(Cancelling)</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={sub.status === 'active' ? 'success' : 'outline'}>
                    {sub.status.toUpperCase()}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={handlePortal} className="gap-2 rounded-lg">
                    <ExternalLink className="h-4 w-4" />
                    Manage Billing
                  </Button>
                </div>
              </div>
            ))}
            {subscriptions.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 py-20 text-center">
                <Receipt className="h-12 w-12 text-slate-600" />
                <h3 className="mt-4 text-lg font-medium text-white">No active subscriptions</h3>
                <p className="mt-2 text-slate-400">Subscribe to a plan to see it here.</p>
                <Button variant="outline" className="mt-6 rounded-xl" onClick={() => setActiveTab('browse')}>
                  Browse Marketplace
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-surface-900/40">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="px-6 py-4 font-semibold text-slate-300">Transaction</th>
                  <th className="px-6 py-4 font-semibold text-slate-300">Date</th>
                  <th className="px-6 py-4 font-semibold text-slate-300">Amount</th>
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
                    <td className="px-6 py-4">
                      <Badge variant={tx.status === 'succeeded' ? 'success' : 'outline'}>
                        {tx.status}
                      </Badge>
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
        )}
      </div>
    </div>
  )
}
