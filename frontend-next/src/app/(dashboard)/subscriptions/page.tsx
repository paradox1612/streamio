'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { marketplaceAPI } from '@/utils/api'
import { 
  CreditCard, Calendar, CheckCircle2, AlertCircle, 
  ExternalLink, XCircle, ArrowRight, History
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import ConfirmDialog from '@/components/ConfirmDialog'

function formatCents(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

function formatDate(dateString?: string | null) {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)

  const load = async () => {
    try {
      const [subsRes, paymentsRes] = await Promise.all([
        marketplaceAPI.getSubscriptions(),
        marketplaceAPI.getPaymentHistory({ limit: 10 }),
      ])
      setSubscriptions(subsRes.data)
      setPayments(paymentsRes.data)
    } catch {
      toast.error('Failed to load subscription data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleCancel = async () => {
    if (!cancellingId) return
    setIsCancelling(true)
    try {
      const res = await marketplaceAPI.cancelSubscription(cancellingId)
      toast.success(res.data.message || 'Subscription cancelled')
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to cancel subscription')
    } finally {
      setIsCancelling(false)
      setCancellingId(null)
    }
  }

  const openPortal = async () => {
    try {
      const { data } = await marketplaceAPI.getPortalUrl()
      if (data.portal_url) {
        window.location.href = data.portal_url
      }
    } catch {
      toast.error('Failed to open billing portal')
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-8">
        <Card className="p-8 text-center text-slate-400">Loading your subscriptions...</Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <Card className="overflow-hidden p-5 sm:p-7 lg:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Badge variant="default" className="mb-4">Billing</Badge>
              <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
                Your Subscriptions
              </h1>
              <p className="hero-copy mt-3">
                Manage your active plans, view billing history, and update payment methods.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={openPortal} variant="outline" className="gap-2">
                <CreditCard className="h-4 w-4" />
                Stripe Billing Portal
              </Button>
              <Button asChild>
                <Link href="/marketplace" className="gap-2">
                  Browse Marketplace
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </Card>
      </motion.section>

      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-brand-400" />
            Active Plans
          </h2>

          {subscriptions.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-slate-400">You don&apos;t have any active subscriptions.</p>
              <Button asChild variant="link" className="mt-2 text-brand-400">
                <Link href="/marketplace">Explore the marketplace</Link>
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {subscriptions.map((sub) => (
                <Card key={sub.id} className="overflow-hidden">
                  <div className="border-l-4 border-brand-500 bg-brand-500/5 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-bold text-white">{sub.offering_name || 'Marketplace Subscription'}</h3>
                        <p className="text-sm text-slate-400">
                          {sub.payment_provider === 'stripe' ? 'Automated Stripe Billing' : 'Manual / Credit Billing'}
                        </p>
                      </div>
                      <Badge 
                        variant={sub.status === 'active' ? 'success' : sub.status === 'trialing' ? 'brand' : 'warning'}
                        className="capitalize"
                      >
                        {sub.status}
                      </Badge>
                    </div>

                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5">
                          <Calendar className="h-4 w-4 text-slate-400" />
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Period Ends</p>
                          <p className="text-sm font-medium text-slate-200">{formatDate(sub.current_period_end)}</p>
                        </div>
                      </div>
                      {sub.cancel_at_period_end && (
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10">
                            <AlertCircle className="h-4 w-4 text-red-400" />
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-red-400/80">Status</p>
                            <p className="text-sm font-medium text-red-200">Cancels at period end</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-3">
                      {sub.user_provider_id && (
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/providers/${sub.user_provider_id}`}>
                            View Credentials
                          </Link>
                        </Button>
                      )}
                      {sub.status !== 'cancelled' && !sub.cancel_at_period_end && (
                        <Button 
                          onClick={() => setCancellingId(sub.id)} 
                          variant="ghost" 
                          size="sm" 
                          className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        >
                          Cancel Subscription
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <History className="h-5 w-5 text-slate-400" />
            Recent Payments
          </h2>

          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {payments.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No payment history found.
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-4">
                      <div>
                        <p className="text-sm font-medium text-white">{formatCents(p.amount_cents, p.currency)}</p>
                        <p className="text-[11px] text-slate-500">{formatDate(p.created_at)}</p>
                      </div>
                      <Badge variant={p.status === 'succeeded' ? 'success' : 'danger'} className="text-[10px] uppercase">
                        {p.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-surface-900/40 border-white/[0.05]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-slate-400" />
                Advanced Billing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs leading-5 text-slate-400">
                For detailed invoices, receipt downloads, and updating your card on file, please visit the Stripe secure billing portal.
              </p>
              <Button onClick={openPortal} variant="link" className="mt-2 h-auto p-0 text-brand-400 text-xs">
                Open Billing Portal
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(cancellingId)}
        title="Cancel subscription?"
        description="Your access will continue until the end of the current billing period. This action cannot be undone."
        confirmLabel="Cancel Subscription"
        danger
        loading={isCancelling}
        onConfirm={handleCancel}
        onCancel={() => setCancellingId(null)}
      />
    </div>
  )
}
