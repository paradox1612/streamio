import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import toast from 'react-hot-toast';
import ErrorReportDialog from '../components/ErrorReportDialog';

const ErrorReportingContext = createContext(null);
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
let globalCapture = () => {};

function clip(value, max = 4000) {
  if (value == null) return null;
  return String(value).slice(0, max);
}

function hashFingerprint(input) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }
  return `err_${Math.abs(hash)}`;
}

function normalizeError(error, extra = {}) {
  const reason = extra.reason || error;
  const message = clip(
    extra.message
      || reason?.message
      || (typeof reason === 'string' ? reason : null)
      || 'Unexpected application error'
  , 2000);
  const stack = clip(reason?.stack || extra.stack, 16000);
  const routePath = clip(extra.routePath || window.location.pathname, 1000);
  const pageUrl = clip(extra.pageUrl || window.location.href, 2000);
  const source = clip(extra.source || 'frontend', 50);
  const errorType = clip(extra.errorType || reason?.name || 'Error', 255);
  const componentStack = clip(extra.componentStack, 12000);
  const context = {
    ...extra.context,
    routePath,
    pageUrl,
  };

  return {
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
  };
}

function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('sb_token');
  const adminToken = localStorage.getItem('sb_admin_token');
  if (token) headers.Authorization = `Bearer ${token}`;
  if (adminToken) headers['x-admin-token'] = adminToken;
  return headers;
}

function ReportToast({ onOpen, onDismiss }) {
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
  );
}

export function reportApplicationError(error, extra = {}) {
  globalCapture(error, extra);
}

export function ErrorReportingProvider({ children }) {
  const recentFingerprintsRef = useRef(new Map());
  const [draftReport, setDraftReport] = useState(null);
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);

  const captureError = useCallback((error, extra = {}) => {
    const normalized = normalizeError(error, extra);
    const now = Date.now();
    const previous = recentFingerprintsRef.current.get(normalized.fingerprint);
    if (previous && now - previous < 8000) return;
    recentFingerprintsRef.current.set(normalized.fingerprint, now);

    toast.custom((toastInstance) => (
      <ReportToast
        onOpen={() => {
          toast.dismiss(toastInstance.id);
          setDraftReport(normalized);
        }}
        onDismiss={() => toast.dismiss(toastInstance.id)}
      />
    ), { duration: 12000, position: 'top-right' });
  }, []);

  useEffect(() => {
    globalCapture = captureError;
    return () => {
      globalCapture = () => {};
    };
  }, [captureError]);

  useEffect(() => {
    const handleWindowError = (event) => {
      const reason = event.error || new Error(event.message || 'Window error');
      captureError(reason, {
        source: window.location.pathname.startsWith('/admin') ? 'admin' : 'frontend',
        errorType: reason?.name || 'WindowError',
        context: {
          filename: event.filename || null,
          lineNumber: event.lineno || null,
          columnNumber: event.colno || null,
        },
      });
    };

    const handleUnhandledRejection = (event) => {
      captureError(event.reason, {
        source: window.location.pathname.startsWith('/admin') ? 'admin' : 'frontend',
        errorType: 'UnhandledRejection',
      });
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [captureError]);

  const closeDialog = useCallback(() => {
    setDraftReport(null);
    setDescription('');
  }, []);

  const submitReport = useCallback(async () => {
    if (!draftReport || sending) return;
    setSending(true);
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
      });

      if (!response.ok) {
        throw new Error('Failed to submit report');
      }

      toast.success('Error report sent');
      closeDialog();
    } catch (error) {
      toast.error(error.message || 'Failed to submit report');
    } finally {
      setSending(false);
    }
  }, [closeDialog, description, draftReport, email, sending]);

  const value = useMemo(() => ({
    captureError,
    openReportDialog: (report) => setDraftReport(report),
  }), [captureError]);

  return (
    <ErrorReportingContext.Provider value={value}>
      {children}
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
  );
}

export function useErrorReporting() {
  const context = useContext(ErrorReportingContext);
  if (!context) {
    throw new Error('useErrorReporting must be used within ErrorReportingProvider');
  }
  return context;
}
