import React from 'react';
import { AlertTriangle, Mail, Send } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';

export default function ErrorReportDialog({
  open,
  report,
  email,
  description,
  loading,
  onEmailChange,
  onDescriptionChange,
  onClose,
  onSubmit,
}) {
  if (!open || !report) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/75 p-4 backdrop-blur-md sm:items-center">
      <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/10 bg-surface-950/96 shadow-[0_30px_100px_rgba(0,0,0,0.45)]">
        <div className="border-b border-white/[0.08] px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-amber-100">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/70">Report issue</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Send this error to the backend inbox</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300/70">
                The report includes the route, browser details, message, and any stack data we captured.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">Captured error</p>
            <p className="mt-3 break-words text-sm font-semibold text-white">{report.message}</p>
            <div className="mt-3 grid gap-3 text-xs text-slate-400 sm:grid-cols-2">
              <div>
                <span className="text-slate-500">Source:</span> {report.source}
              </div>
              <div>
                <span className="text-slate-500">Route:</span> {report.routePath || 'unknown'}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-white">
              <Mail className="h-4 w-4 text-slate-400" />
              Contact email
            </label>
            <Input
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-white">What were you doing?</label>
            <textarea
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder="Tell us what you clicked or what you expected to happen."
              rows={5}
              className="w-full rounded-[22px] border border-white/10 bg-surface-900/80 px-4 py-3 text-sm text-white placeholder:text-slate-400/55 transition-all duration-200 focus:border-brand-500/40 focus:outline-none focus:shadow-[0_0_0_3px_rgba(20,145,255,0.15)]"
            />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-white/[0.08] px-6 py-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={onSubmit} disabled={loading}>
            <Send className="h-4 w-4" />
            {loading ? 'Sending...' : 'Send report'}
          </Button>
        </div>
      </div>
    </div>
  );
}
