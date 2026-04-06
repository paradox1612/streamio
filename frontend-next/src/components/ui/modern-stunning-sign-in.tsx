'use client'

import * as React from 'react'
import { Eye, EyeOff, Loader2, Lock, Mail, User2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

function AuthOrb({ className }: { className?: string }) {
  return <div className={cn('absolute rounded-full blur-3xl', className)} aria-hidden="true" />
}

interface FieldProps {
  label: string
  type?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  autoComplete?: string
  icon: LucideIcon
  error?: string
}

function Field({ label, type = 'text', value, onChange, placeholder, autoComplete, icon: Icon, error }: FieldProps) {
  const [revealed, setRevealed] = React.useState(false)
  const isPassword = type === 'password'

  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-300/62">{label}</span>
      <div className={cn('auth-field', error && 'auth-field-error')}>
        <span className="auth-field-icon"><Icon className="h-[18px] w-[18px]" /></span>
        <input
          type={isPassword && revealed ? 'text' : type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="auth-input"
        />
        {isPassword && (
          <button type="button" onClick={() => setRevealed((v) => !v)} className="auth-field-toggle" aria-label={revealed ? 'Hide password' : 'Show password'}>
            {revealed ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
          </button>
        )}
      </div>
    </label>
  )
}

interface ModernStunningSignInProps {
  brandName?: string
  logo?: React.ReactNode
  title?: string
  subtitle?: string
  identifierMode?: 'email' | 'username'
  identifierValue: string
  passwordValue: string
  onIdentifierChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onPasswordChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onSubmit: (e: React.FormEvent) => void
  submitLabel?: string
  loadingLabel?: string
  loading?: boolean
  error?: string
  footer?: React.ReactNode
  badge?: string
}

const IDENTIFIER_MODES = {
  email: { label: 'Email', placeholder: 'name@example.com', autoComplete: 'email', type: 'email', icon: Mail },
  username: { label: 'Username', placeholder: 'admin username', autoComplete: 'username', type: 'text', icon: User2 },
}

export function ModernStunningSignIn({
  brandName = 'StreamBridge', logo, title = 'Welcome back', subtitle = '',
  identifierMode = 'email', identifierValue, passwordValue,
  onIdentifierChange, onPasswordChange, onSubmit,
  submitLabel = 'Sign In', loadingLabel = 'Signing in...', loading = false, error = '', footer, badge = 'Sign in',
}: ModernStunningSignInProps) {
  const identifierConfig = IDENTIFIER_MODES[identifierMode]

  return (
    <div className="relative isolate flex min-h-screen w-full overflow-hidden bg-[#050816] text-white">
      <AuthOrb className="left-[-6rem] top-[-4rem] h-56 w-56 bg-brand-500/12" />
      <AuthOrb className="right-[-7rem] top-16 h-64 w-64 bg-cyan-400/10" />
      <AuthOrb className="bottom-[-7rem] left-1/2 h-72 w-72 -translate-x-1/2 bg-sky-300/8" />
      <section className="relative z-10 flex min-h-screen w-full items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-md rounded-[34px] border border-white/[0.1] bg-[linear-gradient(180deg,rgba(18,28,49,0.9),rgba(8,16,31,0.82))] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:p-8">
          <div className="flex items-center gap-3">
            {logo}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-200/72">{badge}</p>
              <h2 className="text-base font-bold text-white">{brandName}</h2>
            </div>
          </div>
          <div className="mt-8 mb-6">
            <h1 className="text-3xl font-bold tracking-[-0.04em] text-white">{title}</h1>
            {subtitle && <p className="mt-2 text-sm leading-6 text-slate-300/65">{subtitle}</p>}
          </div>
          <form onSubmit={onSubmit} className="space-y-5">
            <Field label={identifierConfig.label} type={identifierConfig.type} value={identifierValue} onChange={onIdentifierChange} placeholder={identifierConfig.placeholder} autoComplete={identifierConfig.autoComplete} icon={identifierConfig.icon} error={error} />
            <Field label="Password" type="password" value={passwordValue} onChange={onPasswordChange} placeholder="Enter your password" autoComplete="current-password" icon={Lock} error={error} />
            {error && <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>}
            <button type="submit" disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-500 via-brand-400 to-cyan-300 px-5 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_20px_50px_rgba(20,145,255,0.35)] transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60">
              {loading && <Loader2 className="h-[18px] w-[18px] animate-spin" />}
              {loading ? loadingLabel : submitLabel}
            </button>
          </form>
          {footer && <div className="mt-6 border-t border-white/[0.08] pt-5">{footer}</div>}
        </div>
      </section>
    </div>
  )
}
