'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Flag } from 'lucide-react'
import { reportApplicationError } from '@/context/ErrorReportingContext'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  const [referrer, setReferrer] = useState<string>('')
  const [path, setPath] = useState<string>('')

  useEffect(() => {
    const r = document.referrer || ''
    const p = window.location.pathname
    // Using Promise to avoid synchronous setState inside useEffect warning
    Promise.resolve().then(() => {
      setReferrer(r)
      setPath(p)
    })
  }, [])

  const handleFeedback = () => {
    reportApplicationError(new Error(`404 — Page not found: ${path}`), {
      source: window.location.pathname.startsWith('/admin') ? 'admin' : 'frontend',
      errorType: '404NotFound',
      message: `Page not found: ${path}`,
      context: {
        notFoundPath: path,
        referrer: referrer || 'direct navigation (no referrer)',
      },
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-950 px-4 py-16">
      <div className="w-full max-w-xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-200/70">Error 404</p>

        <h1 className="mt-4 text-5xl font-bold text-white sm:text-6xl">
          Page not found.
        </h1>

        <p className="mt-5 text-base leading-7 text-slate-300/65">
          The page you&rsquo;re looking for doesn&rsquo;t exist or was moved. If you ended up here from another page,
          use the feedback button below so we can look into it.
        </p>

        {referrer && (
          <div className="mt-6 rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400/70">Redirected from</p>
            <p className="mt-2 break-all font-mono text-xs text-slate-300/80">{referrer}</p>
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild variant="default" className="rounded-2xl">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Go home
            </Link>
          </Button>

          <Button
            type="button"
            variant="outline"
            className="rounded-2xl"
            onClick={handleFeedback}
          >
            <Flag className="h-4 w-4" />
            Report this page
          </Button>
        </div>

        <p className="mt-10 text-xs text-slate-500/60">
          Path: <span className="font-mono">{path || '—'}</span>
        </p>
      </div>
    </div>
  )
}
