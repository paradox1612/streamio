'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { authAPI, userAPI } from '@/utils/api'
import toast from 'react-hot-toast'
import ConfirmDialog from '@/components/ConfirmDialog'

export default function AccountPage() {
  const { user, logout } = useAuthStore()
  const router = useRouter()
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' })
  const [changingPw, setChangingPw] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmStep, setConfirmStep] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwords.new !== passwords.confirm) return toast.error('Passwords do not match')
    if (passwords.new.length < 8) return toast.error('Password must be at least 8 characters')
    setChangingPw(true)
    try {
      await authAPI.changePassword(passwords.current, passwords.new)
      toast.success('Password changed successfully')
      setPasswords({ current: '', new: '', confirm: '' })
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed to change password')
    } finally {
      setChangingPw(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteInput !== 'delete') {
      toast.error('Type "delete" to confirm')
      return
    }
    setDeleting(true)
    try {
      await userAPI.deleteAccount()
      if (logout) logout()
      router.push('/login')
      toast.success('Account deleted')
    } catch {
      toast.error('Failed to delete account')
      setDeleting(false)
    } finally {
      setConfirmStep(false)
    }
  }

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="panel overflow-hidden p-5 sm:p-7 lg:p-8">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <div>
              <div className="kicker mb-4">Account</div>
              <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">Secure your workspace and keep access predictable.</h1>
              <p className="hero-copy mt-3">
                Your account controls provider access, addon identity, and route-level security. Keep your password current and treat destructive actions carefully.
              </p>
            </div>
            <div className="panel-soft p-4 sm:p-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-100">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                {user?.is_active ? 'Account active' : 'Account suspended'}
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-300/[0.68]">
                Email, addon token, and provider records are bound to this account identity.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="panel-soft p-5 sm:p-8">
            <p className="eyebrow mb-2">Profile</p>
            <h2 className="section-title">Account information</h2>
            <div className="mt-6 space-y-4">
              {[
                ['Email', user?.email || '—'],
                ['Member Since', user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'],
                ['Last Seen', user?.last_seen ? new Date(user.last_seen).toLocaleDateString() : '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-1 border-b border-white/[0.08] pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <span className="text-sm text-slate-300/60">{label}</span>
                  <span className="break-all text-sm font-medium text-white">{value}</span>
                </div>
              ))}
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span className="text-sm text-slate-300/60">Status</span>
                <span className={`inline-flex items-center gap-2 text-sm font-medium ${user?.is_active ? 'text-emerald-100' : 'text-red-100'}`}>
                  {user?.is_active && (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {user?.is_active ? 'Active' : 'Suspended'}
                </span>
              </div>
            </div>
          </div>

          <div className="panel-soft p-5 sm:p-8">
            <p className="eyebrow mb-2">Security</p>
            <h2 className="section-title">Change password</h2>
            <form onSubmit={handleChangePassword} className="mt-6 space-y-5">
              <div>
                <label className="field-label">Current Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={passwords.current}
                  onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">New Password</label>
                <input
                  type="password"
                  required
                  placeholder="Minimum 8 characters"
                  value={passwords.new}
                  onChange={e => setPasswords(p => ({ ...p, new: e.target.value }))}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Confirm New Password</label>
                <input
                  type="password"
                  required
                  placeholder="Repeat new password"
                  value={passwords.confirm}
                  onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))}
                  className="field-input"
                />
              </div>
              <button type="submit" disabled={changingPw} className="btn-primary w-full">
                {changingPw ? 'Updating password...' : 'Update Password'}
              </button>
            </form>
          </div>
        </section>

        <section className="panel-soft border-red-400/[0.15] bg-red-500/5 p-5 sm:p-8">
          <p className="eyebrow mb-2 text-red-100/60">Danger Zone</p>
          <h2 className="section-title">Delete account</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300/[0.72]">
            This removes your account, providers, and addon access permanently. There is no recovery path after confirmation.
          </p>
          <button onClick={() => setConfirmStep(true)} disabled={deleting} className="btn-danger mt-6 w-full sm:w-auto">
            {deleting ? 'Deleting account...' : 'Delete Account'}
          </button>
        </section>
      </div>

      <ConfirmDialog
        open={confirmStep}
        title="Delete account permanently?"
        description="This removes your account, providers, addon access, and related data. There is no recovery path."
        confirmLabel="Delete Account"
        danger
        loading={deleting}
        onConfirm={handleDeleteAccount}
        onCancel={() => {
          if (!deleting) {
            setConfirmStep(false)
            setDeleteInput('')
          }
        }}
      >
        <div>
          <label className="field-label">Type delete to confirm</label>
          <input
            value={deleteInput}
            onChange={(e) => setDeleteInput(e.target.value)}
            placeholder="delete"
            className="field-input"
          />
        </div>
      </ConfirmDialog>
    </>
  )
}
