'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/auth'
import { authAPI, providerAPI } from '@/utils/api'
import { AuthComponent } from '@/components/ui/sign-up'

const PENDING_PROVIDER_KEY = 'sb_pending_provider'

export default function SignupPage() {
  const { login } = useAuthStore()
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '' })
  const [isChecked, setIsChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const logo = (
    <div className="relative flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.04] shadow-[0_18px_45px_rgba(8,16,31,0.38)]">
      <div className="absolute inset-[5px] rounded-[14px] bg-gradient-to-br from-brand-400/30 via-cyan-200/10 to-white/[0.02]" />
      <div className="relative h-5 w-5 rounded-full border border-white/35">
        <div className="absolute left-1/2 top-[-1px] h-[calc(100%+2px)] w-[2px] -translate-x-1/2 bg-white/70" />
        <div className="absolute left-[-1px] top-1/2 h-[2px] w-[calc(100%+2px)] -translate-y-1/2 bg-white/70" />
      </div>
    </div>
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.email || !form.password || !form.confirmPassword) {
      const msg = 'Email, password, and confirmation are required'
      setError(msg); return toast.error(msg)
    }
    if (form.password !== form.confirmPassword) {
      const msg = 'Passwords do not match'
      setError(msg); return toast.error(msg)
    }
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters')
    setError('')
    setLoading(true)
    try {
      const res = await authAPI.signup(form.email, form.password)
      login(res.data.user, res.data.token)

      let providerConnected = false
      try {
        const raw = sessionStorage.getItem(PENDING_PROVIDER_KEY)
        if (raw) {
          const pending = JSON.parse(raw)
          sessionStorage.removeItem(PENDING_PROVIDER_KEY)
          await providerAPI.create({ name: pending.name || 'My Provider', hosts: [pending.host], username: pending.username, password: pending.password })
          providerConnected = true
        }
      } catch { /* not fatal */ }

      toast.success(providerConnected ? 'Account created and provider connected!' : 'Account created! Welcome aboard')
      router.push('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Signup failed'
      setError(msg); toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthComponent
      logo={logo}
      brandName="StreamBridge"
      email={form.email}
      password={form.password}
      confirmPassword={form.confirmPassword}
      acceptTerms={isChecked}
      onEmailChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
      onPasswordChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
      onConfirmPasswordChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
      onAcceptTermsChange={(e) => setIsChecked(e.target.checked)}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
      title="Create account"
      showFullName={false}
      termsLabel="I agree to the terms."
      footer={
        <p className="text-center text-sm text-slate-300/65">
          <Link href="/login" className="font-semibold text-white transition-colors hover:text-brand-100">
            Sign in
          </Link>
        </p>
      }
    />
  )
}
