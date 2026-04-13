'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import toast from 'react-hot-toast'
import AppErrorBoundary from '@/components/AppErrorBoundary'
import ErrorReportDialog from '@/components/ErrorReportDialog'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

type ErrorExtra = {
  reason?: unknown
  message?: string
  stack?: string
  routePath?: string
  pageUrl?: string
  source?: string
  errorType?: string
  componentStack?: string
  context?: Record<string, unknown>
}

interface NormalizedErrorReport {
  reportKind?: 'error' | 'ticket'
  ticketCategory?: string | null
  source: string
  severity: 'error'
  message: string
  errorType: string
  stack: string | null
  componentStack: string | null
  pageUrl: string | null
  routePath: string | null
  fingerprint: string
  context: Record<string, unknown>
}

interface ErrorReportingValue {
  captureError: (error: unknown, extra?: ErrorExtra) => void
  openReportDialog: (report: NormalizedErrorReport) => void
  openTicketDialog: (ticket: {
    message: string
    ticketCategory: string
    routePath?: string | null
    source?: string
    context?: Record<string, unknown>
    defaultDescription?: string
  }) => void
}

const ErrorReportingContext = createContext<ErrorReportingValue | null>(null)
let globalCapture: (error: unknown, extra?: ErrorExtra) => void = () => {}

function clip(value: unknown, max = 4000) {
  if (value == null) return null
  return String(value).slice(0, max)
}

function hashFingerprint(input: string) {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0
  }
  return `err_${Math.abs(hash)}`
}

function normalizeError(error: unknown, extra: ErrorExtra = {}): NormalizedErrorReport {
  const reason = extra.reason || error
  const maybeError = reason instanceof Error ? reason : null
  const message = clip(
    extra.message ||
      maybeError?.message ||
      (typeof reason === 'string' ? reason : null) ||
      'Unexpected application error',
    2000
  )!
  const stack = clip(maybeError?.stack || extra.stack, 16000)
  const routePath = clip(extra.routePath || window.location.pathname, 1000)
  const pageUrl = clip(extra.pageUrl || window.location.href, 2000)
  const source = clip(extra.source || (window.location.pathname.startsWith('/admin') ? 'admin' : 'frontend'), 50) || 'frontend'
  const errorType = clip(extra.errorType || maybeError?.name || 'Error', 255) || 'Error'
  const componentStack = clip(extra.componentStack, 12000)
  const context = {
    ...extra.context,
    routePath,
    pageUrl,
  }

  return {
    reportKind: 'error',
    ticketCategory: null,
    source,
    severity: 'error',
    message,
    errorType,
    stack,
    componentStack,
    pageUrl,
    routePath,
    fingerprint: hashFingerprint(`${source}|${routePath}|${message}|${stack?.split('\n')[0] || ''}`),
    context,
  }
}

function getAuthHeaders() {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('sb_token')
  const adminToken = localStorage.getItem('sb_admin_token')
  if (token) headers.Authorization = `Bearer ${token}`
  if (adminToken) headers['x-admin-token'] = adminToken
  return headers
}

function ReportToast({ onOpen, onDismiss }: { onOpen: () => void; onDismiss: () => void }) {
  return (
    <div className="flex max-w-md items-center gap-4 rounded-[22px] border border-amber-400/20 bg-surface-950/95 px-4 py-4 text-sm text-slate-100 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-white">A problem was caught.</p>
        <p className="mt-1 text-slate-300/70">Open the report dialog to send the error details to the admin inbox.</p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="rounded-full border border-brand-400/20 bg-brand-500/12 px-3 py-2 text-xs font-semibold text-brand-100 transition hover:bg-brand-500/18"
        >
          Report
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

export function reportApplicationError(error: unknown, extra: ErrorExtra = {}) {
  globalCapture(error, extra)
}

export function ErrorReportingProvider({ children }: { children: React.ReactNode }) {
  const recentFingerprintsRef = useRef(new Map<string, number>())
  const [draftReport, setDraftReport] = useState<NormalizedErrorReport | null>(null)
  const [email, setEmail] = useState('')
  const [description, setDescription] = useState('')
  const [sending, setSending] = useState(false)

  const captureError = useCallback((error: unknown, extra: ErrorExtra = {}) => {
    const normalized = normalizeError(error, extra)
    const now = Date.now()
    const previous = recentFingerprintsRef.current.get(normalized.fingerprint)
    if (previous && now - previous < 8000) return
    recentFingerprintsRef.current.set(normalized.fingerprint, now)

    toast.custom(
      (toastInstance) => (
        <ReportToast
          onOpen={() => {
            toast.dismiss(toastInstance.id)
            setDraftReport(normalized)
          }}
          onDismiss={() => toast.dismiss(toastInstance.id)}
        />
      ),
      { duration: 12000, position: 'top-right' }
    )
  }, [])

  useEffect(() => {
    globalCapture = captureError
    return () => {
      globalCapture = () => {}
    }
  }, [captureError])

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      const reason = event.error || new Error(event.message || 'Window error')
      captureError(reason, {
        source: window.location.pathname.startsWith('/admin') ? 'admin' : 'frontend',
        errorType: reason instanceof Error ? reason.name : 'WindowError',
        context: {
          filename: event.filename || null,
          lineNumber: event.lineno || null,
          columnNumber: event.colno || null,
        },
      })
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      captureError(event.reason, {
        source: window.location.pathname.startsWith('/admin') ? 'admin' : 'frontend',
        errorType: 'UnhandledRejection',
      })
    }

    window.addEventListener('error', handleWindowError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    return () => {
      window.removeEventListener('error', handleWindowError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [captureError])

  const closeDialog = useCallback(() => {
    setDraftReport(null)
    setDescription('')
  }, [])

  const submitReport = useCallback(async () => {
    if (!draftReport || sending) return
    setSending(true)
    try {
      const response = await fetch(`${API_BASE}/api/error-reports`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...draftReport,
          reporterEmail: email || undefined,
          context: {
            ...draftReport.context,
            userDescription: description || undefined,
          },
        }),
      })

      if (!response.ok) throw new Error('Failed to submit report')

      toast.success('Error report sent')
      closeDialog()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit report'
      toast.error(message)
    } finally {
      setSending(false)
    }
  }, [closeDialog, description, draftReport, email, sending])

  const value = useMemo(
    () => ({
      captureError,
      openReportDialog: (report: NormalizedErrorReport) => setDraftReport(report),
      openTicketDialog: ({
        message,
        ticketCategory,
        routePath,
        source,
        context,
        defaultDescription,
      }: {
        message: string
        ticketCategory: string
        routePath?: string | null
        source?: string
        context?: Record<string, unknown>
        defaultDescription?: string
      }) =>
      {
        setDraftReport({
          reportKind: 'ticket',
          ticketCategory,
          source: source || 'dashboard',
          severity: 'error',
          message,
          errorType: 'CustomerTicket',
          stack: null,
          componentStack: null,
          pageUrl: typeof window !== 'undefined' ? window.location.href : null,
          routePath: routePath || (typeof window !== 'undefined' ? window.location.pathname : null),
          fingerprint: hashFingerprint(`ticket|${ticketCategory}|${message}`),
          context: context || {},
        })
        setDescription(defaultDescription || '')
      },
    }),
    [captureError]
  )

  return (
    <ErrorReportingContext.Provider value={value}>
      <AppErrorBoundary onError={(error, extra) => captureError(error, extra)}>
        {children}
      </AppErrorBoundary>
      <ErrorReportDialog
        open={Boolean(draftReport)}
        report={draftReport}
        email={email}
        description={description}
        loading={sending}
        onEmailChange={setEmail}
        onDescriptionChange={setDescription}
        onClose={closeDialog}
        onSubmit={submitReport}
      />
    </ErrorReportingContext.Provider>
  )
}

export function useErrorReporting() {
  const context = useContext(ErrorReportingContext)
  if (!context) {
    throw new Error('useErrorReporting must be used within ErrorReportingProvider')
  }
  return context
}
