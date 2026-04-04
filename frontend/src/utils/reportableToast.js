import React from 'react';
import toast from 'react-hot-toast';
import { reportApplicationError } from '../context/ErrorReportingContext';

function ReportableErrorToast({ message, onReport, onDismiss }) {
  return (
    <div className="flex max-w-md items-center gap-4 rounded-[22px] border border-red-400/20 bg-surface-950/95 px-4 py-4 text-sm text-slate-100 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-white">Error</p>
        <p className="mt-1 break-words text-slate-300/70">{message}</p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onReport}
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

export function reportableError(message, options = {}) {
  const text = String(message || 'Unexpected error');
  const {
    duration = 6000,
    position = 'top-right',
    context = {},
    source = window.location.pathname.startsWith('/admin') ? 'admin' : 'frontend',
    errorType = 'ToastError',
  } = options;

  return toast.custom((toastInstance) => (
    <ReportableErrorToast
      message={text}
      onReport={() => {
        toast.dismiss(toastInstance.id);
        reportApplicationError(new Error(text), {
          source,
          errorType,
          message: text,
          context,
        });
      }}
      onDismiss={() => toast.dismiss(toastInstance.id)}
    />
  ), {
    duration,
    position,
  });
}
