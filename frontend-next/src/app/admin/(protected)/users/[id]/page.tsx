'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Gift, LogIn, Shield, UserRoundX } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminAPI } from '@/utils/api'
import { persistUserToken } from '@/lib/auth-cookies'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function formatDate(value: string | null | undefined) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleString()
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] py-3 last:border-b-0">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400/70">{label}</span>
      <span className="text-right text-sm text-slate-100">{value}</span>
    </div>
  )
}

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState('')

  const load = () =>
    adminAPI
      .getUser(id)
      .then((res) => setData(res.data))
      .catch(() => {
        toast.error('Failed to load user')
        router.push('/admin/users')
      })
      .finally(() => setLoading(false))

  useEffect(() => { load() }, [id]) // eslint-disable-line

  const user = data?.user ?? data
  const providers: any[] = data?.providers ?? []

  const handleSuspend = async () => {
    if (!user) return
    setActing('suspend')
    try {
      await adminAPI.suspendUser(user.id, user.is_active)
      await load()
      toast.success(user.is_active ? 'User suspended' : 'User activated')
    } catch {
      toast.error('Action failed')
    } finally {
      setActing('')
    }
  }

  const handleDelete = async () => {
    if (!user) return
    if (!window.confirm(`Delete user ${user.email}? This is permanent.`)) return
    setActing('delete')
    try {
      await adminAPI.deleteUser(user.id)
      toast.success('User deleted')
      router.push('/admin/users')
    } catch {
      toast.error('Delete failed')
    } finally {
      setActing('')
    }
  }

  const handleImpersonate = async () => {
    if (!user) return
    if (!window.confirm(`Sign in as ${user.email}? This opens a user session in this tab.`)) return
    setActing('impersonate')
    try {
      const res = await adminAPI.impersonateUser(user.id)
      const token: string = res.data.token
      localStorage.setItem('sb_token', token)
      persistUserToken(token)
      toast.success(`Signed in as ${user.email}`)
      window.location.href = '/dashboard'
    } catch {
      toast.error('Impersonation failed')
    } finally {
      setActing('')
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-slate-400">Loading user…</p>
      </div>
    )
  }

  if (!user) return null

  const freeAccessVariant =
    user.free_access_status === 'active'
      ? 'success'
      : user.free_access_status === 'expired'
        ? 'warning'
        : 'outline'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => router.push('/admin/users')}>
            <ArrowLeft className="h-4 w-4" />
            All users
          </Button>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-200/70">User detail</p>
            <h1 className="text-2xl font-bold text-white">{user.email}</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            disabled={acting === 'impersonate' || !user.is_active}
            title={!user.is_active ? 'Cannot impersonate a suspended user' : undefined}
            onClick={handleImpersonate}
          >
            <LogIn className="h-3.5 w-3.5" />
            {acting === 'impersonate' ? 'Signing in…' : 'Sign in as user'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            disabled={acting === 'suspend'}
            onClick={handleSuspend}
          >
            {acting === 'suspend' ? 'Working…' : user.is_active ? 'Suspend' : 'Activate'}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="rounded-xl"
            disabled={acting === 'delete'}
            onClick={handleDelete}
          >
            {acting === 'delete' ? 'Deleting…' : 'Delete user'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-white/[0.08] pb-4">
            <CardTitle>Account info</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <DetailRow label="User ID" value={<span className="font-mono text-xs">{user.id}</span>} />
            <DetailRow label="Email" value={user.email} />
            <DetailRow label="Created" value={formatDate(user.created_at)} />
            <DetailRow label="Last seen" value={formatDate(user.last_seen)} />
            <DetailRow
              label="Account status"
              value={
                <Badge variant={user.is_active ? 'success' : 'danger'}>
                  {user.is_active ? 'Active' : 'Suspended'}
                </Badge>
              }
            />
            <DetailRow
              label="Free access"
              value={
                <Badge variant={freeAccessVariant as any} className="capitalize">
                  {user.free_access_status || 'inactive'}
                </Badge>
              }
            />
            {user.free_access_expires_at && (
              <DetailRow label="Free access expires" value={formatDate(user.free_access_expires_at)} />
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-white/[0.08] pb-4">
            <CardTitle>Providers ({providers.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div className="grid grid-cols-2 gap-4 mb-5">
              {[
                { label: 'Providers linked', value: providers.length, icon: Shield, tone: 'border-brand-400/20 bg-brand-500/10 text-brand-200' },
                { label: 'Free access', value: user.free_access_status || 'inactive', icon: Gift, tone: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-[18px] border border-white/[0.07] bg-white/[0.02] p-4">
                  <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl border ${stat.tone}`}>
                    <stat.icon className="h-4 w-4" />
                  </div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400/70">{stat.label}</p>
                  <p className="mt-1 text-xl font-bold capitalize text-white">{stat.value}</p>
                </div>
              ))}
            </div>

            {providers.length > 0 ? (
              <div className="space-y-2">
                {providers.map((provider: any) => (
                  <div
                    key={provider.id}
                    className="rounded-[16px] border border-white/[0.07] bg-surface-950/60 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{provider.name}</div>
                        <div className="mt-0.5 font-mono text-xs text-slate-400/70">{provider.active_host || 'No active host'}</div>
                      </div>
                      <Badge variant={provider.status === 'online' ? 'success' : 'danger'} className="capitalize shrink-0">
                        {provider.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[16px] border border-white/[0.07] bg-white/[0.02] px-4 py-6 text-center">
                <UserRoundX className="mx-auto mb-2 h-6 w-6 text-slate-400/50" />
                <p className="text-sm text-slate-400/60">No providers linked</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
