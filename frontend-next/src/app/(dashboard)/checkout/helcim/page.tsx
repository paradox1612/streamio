'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, AlertCircle } from 'lucide-react'

declare global {
  interface Window {
    appendHelcimIframe?: (token: string, env?: string) => void
  }
}

function HelcimCheckout() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const subscriptionId = searchParams.get('sub_id')

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const scriptLoaded = useRef(false)

  useEffect(() => {
    if (!token || !subscriptionId) {
      setErrorMsg('Invalid checkout link. Missing token or subscription ID.')
      setStatus('error')
      return
    }

    if (scriptLoaded.current) return
    scriptLoaded.current = true

    const script = document.createElement('script')
    script.src = 'https://secure.myhelcim.com/js/version/2/'
    script.async = true
    script.onload = () => {
      setStatus('ready')
      if (typeof window.appendHelcimIframe === 'function') {
        const env = process.env.NEXT_PUBLIC_HELCIM_ENV === 'test' ? 'test' : 'live'
        window.appendHelcimIframe(token, env)
      }
    }
    script.onerror = () => {
      setErrorMsg('Failed to load Helcim payment form. Please try again.')
      setStatus('error')
    }
    document.body.appendChild(script)

    const handleMessage = (event: MessageEvent) => {
      if (!event.data?.eventName) return
      if (event.data.eventName === 'HELCIM_PAY_JS_SUCCESS') {
        router.push(`/subscriptions/provisioning?subscription_id=${subscriptionId}`)
      } else if (event.data.eventName === 'HELCIM_PAY_JS_FAILED') {
        setErrorMsg('Payment was declined. Please try a different card or contact support.')
        setStatus('error')
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [token, subscriptionId, router])

  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-3xl border border-red-500/20 bg-red-500/10 p-8 text-center">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <h2 className="text-lg font-bold text-white">Payment Error</h2>
          <p className="text-sm text-slate-400">{errorMsg}</p>
          <button
            onClick={() => router.push('/dashboard/marketplace')}
            className="mt-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/10 transition-colors"
          >
            Back to Marketplace
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-start p-6 pt-12">
      {status === 'loading' && (
        <div className="flex flex-col items-center gap-3 py-12 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading secure payment form…</p>
        </div>
      )}
      {/* HelcimPay.js mounts the iframe here via appendHelcimIframe() */}
      <div id="helcimPayIframe" className="w-full max-w-lg" />
    </div>
  )
}

export default function HelcimCheckoutPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    }>
      <HelcimCheckout />
    </Suspense>
  )
}
