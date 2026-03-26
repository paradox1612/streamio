import React from 'react';
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
  children,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/75 p-3 backdrop-blur-md sm:items-center sm:p-5">
      <div className="panel w-full max-w-lg overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-7">
          <div className="flex items-start gap-4">
            <div className={`mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl border ${danger ? 'border-red-400/20 bg-red-500/10 text-red-100' : 'border-brand-300/20 bg-brand-400/10 text-brand-100'}`}>
              <ExclamationTriangleIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white">{title}</p>
              {description && <p className="mt-2 text-sm leading-6 text-slate-300/70">{description}</p>}
            </div>
          </div>
          <button onClick={onCancel} className="btn-secondary !rounded-2xl !px-3 !py-3">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {children && <div className="px-5 py-5 sm:px-7">{children}</div>}

        <div className="flex flex-col-reverse gap-3 border-t border-white/10 px-5 py-5 sm:flex-row sm:justify-end sm:px-7">
          <button type="button" onClick={onCancel} disabled={loading} className="btn-secondary">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={loading} className={danger ? 'btn-danger' : 'btn-primary'}>
            {loading ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
