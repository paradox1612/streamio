'use client'

import React, { useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { marketplaceAPI } from '@/utils/api'
import { CheckCircle2, XCircle, Tv2 } from 'lucide-react'

const MESSAGES = [
  'Securing your stream credentials…',
  'Solving the security challenge…',
  'Knocking on the provider panel…',
  'Tuning your channels…',
  'Loading up the VOD library…',
  'Warming up the streams…',
  'Almost there — finishing up…',
  'Putting the remote in your hand…',
]

const POLL_INTERVAL_MS = 3000
const MAX_WAIT_MS = 3 * 60 * 1000 // 3 minutes

type ProvisionStatus = 'pending' | 'provisioning' | 'active' | 'failed' | 'not_required'

function ProvisioningContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Can arrive here two ways:
  //   /subscriptions/provisioning?stripe_session_id=cs_xxx  (from Stripe redirect)
  //   /subscriptions/provisioning/<id>                      (from credits checkout)
  const stripeSessionId = searchParams.get('stripe_session_id')
  const directSubId = searchParams.get('subscription_id')

  const [subscriptionId, setSubscriptionId] = useState<string | null>(directSubId)
  const [status, setStatus] = useState<ProvisionStatus>('pending')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [messageIdx, setMessageIdx] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [timedOut, setTimedOut] = useState(false)

  const startedAt = useRef(Date.now())
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const msgTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Rotate messages every ~7s
  useEffect(() => {
    msgTimer.current = setInterval(() => {
      setMessageIdx((i) => (i + 1) % MESSAGES.length)
    }, 7000)
    elapsedTimer.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000))
    }, 1000)
    return () => {
      if (msgTimer.current) clearInterval(msgTimer.current)
      if (elapsedTimer.current) clearInterval(elapsedTimer.current)
    }
  }, [])

  // Step 1: If we came from Stripe, resolve the stripe session → subscription ID
  useEffect(() => {
    if (subscriptionId || !stripeSessionId) return

    const resolve = async () => {
      try {
        const { data } = await marketplaceAPI.resolveStripeSession(stripeSessionId)
        if (data.pending) {
          // Webhook hasn't fired yet — retry after a short delay
          pollTimer.current = setTimeout(resolve, 2000)
          return
        }
        if (data.subscription_id) {
          setSubscriptionId(data.subscription_id)
        }
      } catch {
        // Retry silently
        pollTimer.current = setTimeout(resolve, 2000)
      }
    }
    resolve()
    return () => { if (pollTimer.current) clearTimeout(pollTimer.current) }
  }, [stripeSessionId, subscriptionId])

  // Step 2: Once we have a subscription ID, poll provision-status
  useEffect(() => {
    if (!subscriptionId) return

    const poll = async () => {
      if (Date.now() - startedAt.current > MAX_WAIT_MS) {
        setTimedOut(true)
        return
      }
      try {
        const { data } = await marketplaceAPI.getProvisionStatus(subscriptionId)
        const s: ProvisionStatus = data.provisioning_status
        setStatus(s)

        if (s === 'active' || s === 'not_required') {
          const providerId = data.user_provider_id
          router.replace(providerId ? `/providers?new=${providerId}` : '/providers')
          return
        }

        if (s === 'failed') {
          setErrorMsg(data.provisioning_error || 'Provisioning failed. Our team has been notified.')
          return
        }

        // pending or provisioning — keep polling
        pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS)
      } catch {
        pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS)
      }
    }

    poll()
    return () => { if (pollTimer.current) clearTimeout(pollTimer.current) }
  }, [subscriptionId, router])

  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  const timerStr = `${minutes}:${String(seconds).padStart(2, '0')}`

  if (status === 'failed' || timedOut) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-950 p-6">
        <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-surface-900 p-8 text-center">
          <XCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
          <h1 className="mb-2 text-xl font-semibold text-white">
            {timedOut ? 'This is taking longer than expected' : 'Provisioning failed'}
          </h1>
          <p className="mb-6 text-sm text-slate-400">
            {timedOut
              ? 'Your subscription is saved. Your credentials will appear in your providers once setup completes — usually within a few minutes.'
              : (errorMsg || 'Something went wrong setting up your subscription.')}
          </p>
          <button
            onClick={() => router.replace('/providers')}
            className="rounded-xl bg-white/10 px-6 py-2 text-sm font-medium text-white hover:bg-white/20 transition-colors"
          >
            Go to My Providers
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-950 p-6">
      <div className="w-full max-w-md text-center">
        {/* Animated logo / spinner */}
        <div className="relative mx-auto mb-8 flex h-24 w-24 items-center justify-center">
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-blue-500" />
          <div className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-t-blue-400 [animation-duration:1.5s]" />
          <Tv2 className="h-10 w-10 text-blue-400" />
        </div>

        <h1 className="mb-2 text-2xl font-semibold text-white">Setting up your subscription</h1>

        {/* Rotating message */}
        <p className="mb-6 min-h-[1.5rem] text-sm text-slate-400 transition-all duration-500">
          {MESSAGES[messageIdx]}
        </p>

        {/* Timer */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-slate-500">
          <span className="font-mono">{timerStr}</span>
          <span>elapsed</span>
        </div>

        {/* Progress indicator dots */}
        <div className="flex items-center justify-center gap-1.5">
          {(['pending', 'provisioning', 'active'] as ProvisionStatus[]).map((s) => (
            <div
              key={s}
              className={[
                'h-1.5 rounded-full transition-all duration-300',
                status === s ? 'w-6 bg-blue-400' : s === 'active' ? 'w-1.5 bg-white/20' : 'w-1.5 bg-white/30',
              ].join(' ')}
            />
          ))}
        </div>

        <p className="mt-8 text-xs text-slate-600">
          You can safely leave this page. Your subscription will appear in your providers when ready.
        </p>
      </div>
    </div>
  )
}

export default function ProvisioningPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-surface-950 p-6">
        <div className="w-full max-w-md text-center">
          <div className="relative mx-auto mb-8 flex h-24 w-24 items-center justify-center">
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-blue-500" />
            <Tv2 className="h-10 w-10 text-blue-400" />
          </div>
          <h1 className="text-xl font-semibold text-white">Loading…</h1>
        </div>
      </div>
    }>
      <ProvisioningContent />
    </Suspense>
  )
}

