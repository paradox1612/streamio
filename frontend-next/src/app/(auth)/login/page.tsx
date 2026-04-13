'use client'

import React, { useMemo, useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import axios from 'axios'
import { useGoogleLogin } from '@react-oauth/google'
import { useAuthStore } from '@/store/auth'
import { authAPI, userAPI } from '@/utils/api'
import { ModernStunningSignIn } from '@/components/ui/modern-stunning-sign-in'

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

function LoginForm() {
  const { login } = useAuthStore()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')

  // ── Auto-login via Token ────────────────────────────────────────────────────
  useEffect(() => {
    const token = searchParams.get('token')
    if (token) {
      const doAutoLogin = async () => {
        setLoading(true)
        try {
          // Persist token immediately so userAPI.getProfile works
          localStorage.setItem('sb_token', token)
          const { data: user } = await userAPI.getProfile()
          login(user, token)
          toast.success('Signed in automatically')
          
          const redirect = searchParams.get('redirect') || '/dashboard'
          router.push(redirect)
        } catch (err) {
          console.error('Auto-login failed:', err)
          localStorage.removeItem('sb_token')
          toast.error('Session link expired or invalid')
        } finally {
          setLoading(false)
        }
      }
      doAutoLogin()
    }
  }, [searchParams, login, router])
  // ────────────────────────────────────────────────────────────────────────────

  const logo = useMemo(() => (
    <div className="relative flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.04] shadow-[0_18px_45px_rgba(8,16,31,0.38)]">
      <div className="absolute inset-[5px] rounded-[14px] bg-gradient-to-br from-brand-400/30 via-cyan-200/10 to-white/[0.02]" />
      <div className="relative h-5 w-5 rounded-full border border-white/35">
        <div className="absolute left-1/2 top-[-1px] h-[calc(100%+2px)] w-[2px] -translate-x-1/2 bg-white/70" />
        <div className="absolute left-[-1px] top-1/2 h-[2px] w-[calc(100%+2px)] -translate-y-1/2 bg-white/70" />
      </div>
    </div>
  ), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authAPI.login(form.email, form.password)
      login(res.data.user, res.data.token)
      toast.success('Welcome back!')
      router.push('/dashboard')
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? (err.response?.data?.error ?? 'Login failed') : 'Login failed'
      setError(msg)
      toast.error(msg)
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
        toast.success('Welcome back!')
        router.push('/dashboard')
      } catch (err: unknown) {
        const msg = axios.isAxiosError(err) ? (err.response?.data?.error ?? 'Google sign-in failed') : 'Google sign-in failed'
        setError(msg)
        toast.error(msg)
      } finally {
        setGoogleLoading(false)
      }
    },
    onError: () => {
      toast.error('Google sign-in was cancelled')
    },
  })

  return (
    <ModernStunningSignIn
      brandName="StreamBridge"
      logo={logo}
      title="Sign in"
      identifierMode="email"
      identifierValue={form.email}
      passwordValue={form.password}
      onIdentifierChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
      onPasswordChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
      onSubmit={handleSubmit}
      loading={loading}
      loadingLabel="Signing in..."
      error={error}
      socialButtons={
        <button
          type="button"
          onClick={() => handleGoogleSuccess()}
          disabled={googleLoading}
          className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-white/[0.12] bg-white/[0.04] px-5 py-3 text-sm font-medium text-white transition duration-200 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <GoogleIcon />
          {googleLoading ? 'Signing in...' : 'Continue with Google'}
        </button>
      }
      footer={
        <div className="space-y-3 text-sm text-slate-300/65">
          <div className="flex items-center justify-between gap-3">
            <Link href="/forgot-password" className="transition-colors hover:text-white">
              Forgot password?
            </Link>
            <Link href="/signup" className="font-semibold text-white transition-colors hover:text-brand-100">
              Create account
            </Link>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3">
            <Link href="/" className="transition-colors hover:text-white">
              Back to main page
            </Link>
            <Link href="/how-it-works" className="transition-colors hover:text-white">
              Setup guide
            </Link>
          </div>
        </div>
      }
    />
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
