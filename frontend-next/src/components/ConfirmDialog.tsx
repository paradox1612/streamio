'use client'

import React from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: React.ReactNode
}

export default function ConfirmDialog({
  open, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  danger = false, loading = false, onConfirm, onCancel, children,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/75 p-3 backdrop-blur-md sm:items-center sm:p-5">
      <div className="panel w-full max-w-lg overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-7">
          <div className="flex items-start gap-4">
            <div className={`mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl border ${danger ? 'border-red-400/20 bg-red-500/10 text-red-100' : 'border-brand-300/20 bg-brand-400/10 text-brand-100'}`}>
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <div>
              <p className="text-lg font-semibold text-white">{title}</p>
              {description && <p className="mt-2 text-sm leading-6 text-slate-300/70">{description}</p>}
            </div>
          </div>
          <button onClick={onCancel} className="btn-secondary !rounded-2xl !px-3 !py-3">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {children && <div className="px-5 py-5 sm:px-7">{children}</div>}
        <div className="flex flex-col-reverse gap-3 border-t border-white/10 px-5 py-5 sm:flex-row sm:justify-end sm:px-7">
          <button type="button" onClick={onCancel} disabled={loading} className="btn-secondary">{cancelLabel}</button>
          <button type="button" onClick={onConfirm} disabled={loading} className={danger ? 'btn-danger' : 'btn-primary'}>{loading ? 'Working...' : confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
