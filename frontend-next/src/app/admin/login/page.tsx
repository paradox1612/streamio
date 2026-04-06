'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminAPI } from '@/utils/api'
import toast from 'react-hot-toast'
import axios from 'axios'
import { Shield } from 'lucide-react'
import { ModernStunningSignIn } from '@/components/ui/modern-stunning-sign-in'
import { persistAdminToken } from '@/lib/auth-cookies'

export default function AdminLoginPage() {
  const [form, setForm] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await adminAPI.login(form.username, form.password)
      localStorage.setItem('sb_admin_token', res.data.adminToken)
      persistAdminToken(res.data.adminToken)
      toast.success('Admin logged in')
      router.push('/admin/dashboard')
    } catch (err: unknown) {
      const nextError = axios.isAxiosError(err)
        ? (err.response?.data?.error ?? 'Invalid admin credentials')
        : 'Invalid admin credentials'
      setError(nextError)
      toast.error(nextError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModernStunningSignIn
      brandName="StreamBridge Admin"
      logo={
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-400/20 bg-brand-500/12 text-brand-100">
          <Shield className="h-5 w-5" />
        </div>
      }
      title="Admin control plane"
      subtitle="Use your admin username and password. SSO is not enabled for admin access yet."
      identifierMode="username"
      identifierValue={form.username}
      passwordValue={form.password}
      onIdentifierChange={(e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((current) => ({ ...current, username: e.target.value }))
      }
      onPasswordChange={(e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((current) => ({ ...current, password: e.target.value }))
      }
      onSubmit={handleSubmit}
      submitLabel="Sign In as Admin"
      loadingLabel="Signing in..."
      loading={loading}
      error={error}
      badge="Restricted access"
    />
  )
}
