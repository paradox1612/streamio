'use client'

import React from 'react'
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, Shield, User2 } from 'lucide-react'
import { cn } from '@/lib/utils'

function AuthBackdropOrb({ className }: { className?: string }) {
  return <div className={cn('absolute rounded-full blur-3xl', className)} aria-hidden="true" />
}

interface BaseInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  icon: React.ElementType
  trailing?: React.ReactNode
}

function BaseInput({ label, icon: Icon, trailing, ...props }: BaseInputProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-300/62">{label}</span>
      <div className="auth-field">
        <span className="auth-field-icon"><Icon className="h-[18px] w-[18px]" /></span>
        <input {...props} className="auth-input" />
        {trailing}
      </div>
    </label>
  )
}

interface AuthComponentProps {
  logo?: React.ReactNode
  brandName?: string
  fullName?: string
  email?: string
  password?: string
  confirmPassword?: string
  acceptTerms?: boolean
  onFullNameChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onEmailChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onPasswordChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onConfirmPasswordChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onAcceptTermsChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onSubmit: (e: React.FormEvent) => void
  loading?: boolean
  error?: string
  title?: string
  subtitle?: string
  footer?: React.ReactNode
  sideLabel?: string
  showFullName?: boolean
  termsLabel?: string
}

export function AuthComponent({
  logo, brandName = 'StreamBridge', fullName = '', email = '', password = '', confirmPassword = '',
  acceptTerms = false, onFullNameChange, onEmailChange, onPasswordChange, onConfirmPasswordChange,
  onAcceptTermsChange, onSubmit, loading = false, error = '', title = 'Create account', subtitle = '',
  footer, sideLabel = 'Sign up', showFullName = false, termsLabel = 'I agree to the terms.',
}: AuthComponentProps) {
  const [showPassword, setShowPassword] = React.useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false)

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[#050816] text-white">
      <AuthBackdropOrb className="left-[-6rem] top-[-4rem] h-56 w-56 bg-brand-500/12" />
      <AuthBackdropOrb className="right-[-7rem] top-16 h-64 w-64 bg-cyan-400/10" />
      <AuthBackdropOrb className="bottom-[-7rem] left-1/2 h-72 w-72 -translate-x-1/2 bg-sky-300/8" />
      <section className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-md rounded-[32px] border border-white/[0.1] bg-[linear-gradient(180deg,rgba(18,28,49,0.92),rgba(8,16,31,0.84))] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:p-8">
          <div className="flex items-center gap-3">
            {logo}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-200/72">{sideLabel}</p>
              <h2 className="text-base font-bold text-white">{brandName}</h2>
            </div>
          </div>
          <div className="mt-8">
            <h1 className="text-3xl font-bold tracking-[-0.04em] text-white sm:text-4xl">{title}</h1>
            {subtitle && <p className="mt-2 text-sm leading-6 text-slate-300/65">{subtitle}</p>}
          </div>
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            {showFullName && <BaseInput label="Full name" icon={User2} type="text" value={fullName} onChange={onFullNameChange} placeholder="Optional" autoComplete="name" />}
            <BaseInput label="Email" icon={Mail} type="email" value={email} onChange={onEmailChange} placeholder="name@example.com" autoComplete="email" />
            <BaseInput label="Password" icon={Lock} type={showPassword ? 'text' : 'password'} value={password} onChange={onPasswordChange} placeholder="Minimum 8 characters" autoComplete="new-password"
              trailing={<button type="button" onClick={() => setShowPassword((v) => !v)} className="auth-field-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}</button>} />
            <BaseInput label="Confirm password" icon={Shield} type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={onConfirmPasswordChange} placeholder="Repeat password" autoComplete="new-password"
              trailing={<button type="button" onClick={() => setShowConfirmPassword((v) => !v)} className="auth-field-toggle" aria-label={showConfirmPassword ? 'Hide' : 'Show'}>{showConfirmPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}</button>} />
            <label className="flex cursor-pointer items-start gap-3 rounded-[22px] border border-white/[0.08] bg-white/[0.03] px-4 py-3">
              <input type="checkbox" checked={acceptTerms} onChange={onAcceptTermsChange} className="mt-0.5 h-4 w-4 rounded border-white/20 bg-transparent text-brand-500 focus:ring-brand-500/40" />
              <span className="text-sm leading-6 text-slate-300/72">{termsLabel}</span>
            </label>
            {error && <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>}
            <button type="submit" disabled={loading || !acceptTerms} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-500 via-brand-400 to-cyan-300 px-5 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_20px_50px_rgba(20,145,255,0.35)] transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <ArrowRight className="h-[18px] w-[18px]" />}
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
          {footer && <div className="mt-6 border-t border-white/[0.08] pt-5">{footer}</div>}
        </div>
      </section>
    </div>
  )
}
