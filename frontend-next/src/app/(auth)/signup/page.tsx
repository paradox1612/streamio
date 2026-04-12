'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import axios from 'axios'
import { useGoogleLogin } from '@react-oauth/google'
import { useAuthStore } from '@/store/auth'
import { authAPI, providerAPI } from '@/utils/api'
import { AuthComponent } from '@/components/ui/sign-up'

const PENDING_PROVIDER_KEY = 'sb_pending_provider'

async function connectPendingProvider(): Promise<boolean> {
  try {
    const raw = sessionStorage.getItem(PENDING_PROVIDER_KEY)
    if (!raw) return false
    const pending = JSON.parse(raw)
    sessionStorage.removeItem(PENDING_PROVIDER_KEY)
    await providerAPI.create({ name: pending.name || 'My Provider', hosts: [pending.host], username: pending.username, password: pending.password })
    return true
  } catch {
    return false
  }
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  )
}

export default function SignupPage() {
  const { login } = useAuthStore()
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '' })
  const [isChecked, setIsChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
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
      const providerConnected = await connectPendingProvider()
      toast.success(providerConnected ? 'Account created and provider connected!' : 'Account created! Welcome aboard')
      router.push('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Signup failed'
      setError(msg); toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSuccess = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setGoogleLoading(true)
      setError('')
      try {
        const res = await authAPI.googleAuth(tokenResponse.access_token)
        login(res.data.user, res.data.token)
        const providerConnected = await connectPendingProvider()
        toast.success(providerConnected ? 'Account created and provider connected!' : 'Welcome aboard!')
        router.push('/dashboard')
      } catch (err: unknown) {
        const msg = axios.isAxiosError(err) ? (err.response?.data?.error ?? 'Google sign-up failed') : 'Google sign-up failed'
        setError(msg); toast.error(msg)
      } finally {
        setGoogleLoading(false)
      }
    },
    onError: () => {
      toast.error('Google sign-up was cancelled')
    },
  })

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
      socialButtons={
        <button
          type="button"
          onClick={() => handleGoogleSuccess()}
          disabled={googleLoading}
          className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-white/[0.12] bg-white/[0.04] px-5 py-3 text-sm font-medium text-white transition duration-200 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <GoogleIcon />
          {googleLoading ? 'Connecting...' : 'Continue with Google'}
        </button>
      }
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
