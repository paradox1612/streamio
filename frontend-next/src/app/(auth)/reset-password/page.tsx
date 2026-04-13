'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, Lock, CheckCircle2, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { authAPI } from '@/utils/api'
import BrandMark from '@/components/BrandMark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setError('Missing or invalid reset token. Please request a new link.')
    }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters long')
      return
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setLoading(true)
    setError(null)
    try {
      await authAPI.resetPassword(token, password)
      setSuccess(true)
      toast.success('Password reset successfully')
      setTimeout(() => {
        router.push('/login')
      }, 3000)
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to reset password. The link may have expired.'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <div className="panel p-7 sm:p-10">
          <BrandMark />
          <div className="mt-8 mb-7">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-400/20 bg-brand-400/10">
              <Lock className="h-6 w-6 text-brand-300" />
            </div>
            <h1 className="text-center text-2xl font-bold text-white sm:text-3xl">Set new password</h1>
            <p className="mt-2.5 text-center text-sm leading-6 text-slate-300/65">
              Please enter your new password below.
            </p>
          </div>

          {error && !success && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {success ? (
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              </div>
              <p className="text-sm font-semibold text-white">Password updated</p>
              <p className="mt-2 text-sm leading-6 text-slate-300/65">Your password has been reset successfully. Redirecting you to login...</p>
              <Button asChild variant="outline" className="mt-8 w-full" size="lg">
                <Link href="/login">Go to Login</Link>
              </Button>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input 
                  id="new-password" 
                  type="password" 
                  required 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  placeholder="••••••••" 
                  autoComplete="new-password"
                  disabled={!!error || loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input 
                  id="confirm-password" 
                  type="password" 
                  required 
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)} 
                  placeholder="••••••••" 
                  autoComplete="new-password"
                  disabled={!!error || loading}
                />
              </div>
              <Button type="submit" disabled={loading || !!error} className="w-full" size="lg">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Updating…
                  </span>
                ) : 'Reset Password'}
              </Button>
              <div className="text-center pt-1">
                <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-300/60 hover:text-white transition-colors">
                  <ArrowLeft className="h-4 w-4" />Back to sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="auth-shell">
        <div className="panel p-7 sm:p-10 flex flex-col items-center justify-center min-h-[400px]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-400 border-t-transparent"></div>
        </div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}
