'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminAPI } from '@/utils/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

function statusVariant(status: string) {
  if (status === 'active') return 'success'
  if (status === 'expired') return 'warning'
  return 'danger'
}

function accountStatusVariant(status: string) {
  if (status === 'assigned') return 'brand'
  if (status === 'available') return 'success'
  return 'danger'
}

export default function AdminFreeAccessPage() {
  const [groups, setGroups] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [groupDetail, setGroupDetail] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [groupForm, setGroupForm] = useState({ name: '', trialDays: 7, notes: '' })
  const [hostForm, setHostForm] = useState({ host: '', priority: 100 })
  const [accountForm, setAccountForm] = useState({ username: '', password: '' })

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) || null,
    [groups, selectedGroupId]
  )

  const load = async ({ preserveSelection = true } = {}) => {
    try {
      const [groupsRes, assignmentsRes] = await Promise.all([
        adminAPI.listFreeAccessGroups(),
        adminAPI.listFreeAccessAssignments({ limit: 200 }),
      ])
      const nextGroups = groupsRes.data || []
      setGroups(nextGroups)
      setAssignments(assignmentsRes.data || [])
      const nextSelected = preserveSelection && selectedGroupId
        ? nextGroups.find((g: any) => g.id === selectedGroupId)?.id
        : nextGroups[0]?.id || ''
      setSelectedGroupId(nextSelected || '')
    } catch {
      toast.error('Failed to load free access data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load({ preserveSelection: false }) }, []) // eslint-disable-line

  useEffect(() => {
    if (!selectedGroupId) { setGroupDetail(null); return }
    adminAPI
      .getFreeAccessGroup(selectedGroupId)
      .then((res) => setGroupDetail(res.data))
      .catch(() => toast.error('Failed to load group details'))
  }, [selectedGroupId])

  const reloadGroupDetail = async (groupId = selectedGroupId) => {
    if (!groupId) return
    const res = await adminAPI.getFreeAccessGroup(groupId)
    setGroupDetail(res.data)
  }

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving('group')
    try {
      const res = await adminAPI.createFreeAccessGroup({
        name: groupForm.name,
        trialDays: parseInt(String(groupForm.trialDays), 10) || 7,
        notes: groupForm.notes.trim() || null,
      })
      toast.success('Free access group created')
      setGroupForm({ name: '', trialDays: 7, notes: '' })
      await load({ preserveSelection: false })
      setSelectedGroupId(res.data.id)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create group')
    } finally {
      setSaving('')
    }
  }

  const handleAddHost = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedGroupId) return
    setSaving('host')
    try {
      await adminAPI.addFreeAccessHost(selectedGroupId, {
        host: hostForm.host,
        priority: parseInt(String(hostForm.priority), 10) || 100,
      })
      toast.success('Host added')
      setHostForm({ host: '', priority: 100 })
      await Promise.all([load(), reloadGroupDetail()])
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to add host')
    } finally {
      setSaving('')
    }
  }

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedGroupId) return
    setSaving('account')
    try {
      await adminAPI.addFreeAccessAccount(selectedGroupId, accountForm)
      toast.success('Account added')
      setAccountForm({ username: '', password: '' })
      await Promise.all([load(), reloadGroupDetail()])
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to add account')
    } finally {
      setSaving('')
    }
  }

  const handleRefreshGroup = async () => {
    if (!selectedGroupId) return
    setSaving('refresh')
    try {
      await adminAPI.refreshFreeAccessGroup(selectedGroupId)
      toast.success('Managed catalog refresh started')
      await Promise.all([load(), reloadGroupDetail()])
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to refresh managed catalog')
    } finally {
      setSaving('')
    }
  }

  const handleDeleteGroup = async () => {
    if (!selectedGroupId || !selectedGroup) return
    if (!window.confirm(`Delete free access group "${selectedGroup.name}"? This removes its hosts, accounts, catalog, and assignments.`)) return
    setSaving('delete-group')
    try {
      await adminAPI.deleteFreeAccessGroup(selectedGroupId)
      toast.success('Free access group deleted')
      setGroupDetail(null)
      setSelectedGroupId('')
      await load({ preserveSelection: false })
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete group')
    } finally {
      setSaving('')
    }
  }

  const handleDeleteHost = async (host: any) => {
    if (!selectedGroupId) return
    if (!window.confirm(`Delete host "${host.host}"?`)) return
    setSaving(`delete-host:${host.id}`)
    try {
      await adminAPI.deleteFreeAccessHost(selectedGroupId, host.id)
      toast.success('Host deleted')
      await Promise.all([load(), reloadGroupDetail()])
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete host')
    } finally {
      setSaving('')
    }
  }

  const handleDeleteAccount = async (account: any) => {
    if (!selectedGroupId) return
    if (!window.confirm(`Delete account "${account.username}"?`)) return
    setSaving(`delete-account:${account.id}`)
    try {
      await adminAPI.deleteFreeAccessAccount(selectedGroupId, account.id)
      toast.success('Account deleted')
      await Promise.all([load(), reloadGroupDetail()])
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete account')
    } finally {
      setSaving('')
    }
  }

  if (loading) return <div className="text-sm text-slate-400">Loading...</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Free Access</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300/65">
            Manage the hidden managed fallback inventory. These groups power free movie and series fallback only, never
            web catalogs or Live TV.
          </p>
        </div>
        <Button type="button" variant="outline" className="rounded-2xl" onClick={() => load()}>
          <RefreshCw className="h-4 w-4" />
          Refresh Data
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        {/* Left column: create form + group list */}
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-white/[0.08] pb-4">
              <CardTitle>Create Group</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <form onSubmit={handleCreateGroup} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400/80">Name</label>
                  <input
                    value={groupForm.name}
                    onChange={(e) => setGroupForm((p) => ({ ...p, name: e.target.value }))}
                    required
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-brand-400/40"
                    placeholder="Provider A Free Pool"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400/80">Trial Days</label>
                  <input
                    value={groupForm.trialDays}
                    onChange={(e) => setGroupForm((p) => ({ ...p, trialDays: Number(e.target.value) }))}
                    type="number"
                    min={1}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-brand-400/40"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400/80">Notes</label>
                  <textarea
                    value={groupForm.notes}
                    onChange={(e) => setGroupForm((p) => ({ ...p, notes: e.target.value }))}
                    rows={3}
                    className="w-full resize-y rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-brand-400/40"
                    placeholder="Internal notes about this managed inventory source"
                  />
                </div>
                <Button type="submit" disabled={saving === 'group'} className="w-full rounded-2xl">
                  {saving === 'group' ? 'Creating…' : 'Create Group'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between border-b border-white/[0.08] pb-4">
              <CardTitle>Groups</CardTitle>
              <span className="text-xs text-slate-400/60">{groups.length} total</span>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {groups.length === 0 && (
                <p className="text-sm text-slate-400/60">No groups yet</p>
              )}
              {groups.map((group) => {
                const active = group.id === selectedGroupId
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSelectedGroupId(group.id)}
                    className={cn(
                      'w-full rounded-[20px] border p-4 text-left transition-colors',
                      active
                        ? 'border-brand-400/30 bg-brand-500/12'
                        : 'border-white/[0.07] bg-white/[0.025] hover:border-white/[0.12]'
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{group.name}</div>
                        <div className="mt-1 text-xs text-slate-400/70">
                          {group.account_count} accounts · {group.host_count} hosts · {parseInt(group.catalog_count || 0, 10).toLocaleString()} catalog rows
                        </div>
                      </div>
                      <Badge variant={group.is_active ? 'success' : 'danger'} className="shrink-0">
                        {group.is_active ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                  </button>
                )
              })}
            </CardContent>
          </Card>
        </div>

        {/* Right column: group detail + assignments */}
        <div className="space-y-5">
          <Card className="overflow-hidden">
            {selectedGroup ? (
              <>
                <CardHeader className="border-b border-white/[0.08] pb-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-xl">{selectedGroup.name}</CardTitle>
                      <p className="mt-1 text-xs text-slate-400/70">
                        Trial days: {selectedGroup.trial_days} · Catalog refreshed: {formatDate(selectedGroup.catalog_last_refreshed_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        disabled={saving === 'refresh'}
                        onClick={handleRefreshGroup}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        {saving === 'refresh' ? 'Refreshing…' : 'Refresh Catalog'}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="rounded-xl"
                        disabled={saving === 'delete-group'}
                        onClick={handleDeleteGroup}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {saving === 'delete-group' ? 'Deleting…' : 'Delete Group'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5 p-5">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { label: 'Hosts', value: groupDetail?.hosts?.length || 0 },
                      { label: 'Accounts', value: groupDetail?.accounts?.length || 0 },
                      { label: 'Catalog Rows', value: parseInt(selectedGroup.catalog_count || 0, 10).toLocaleString() },
                      { label: 'Active Assignments', value: assignments.filter((a) => a.provider_group_id === selectedGroupId && a.status === 'active').length },
                    ].map((s) => (
                      <div key={s.label} className="rounded-[18px] border border-white/[0.07] bg-white/[0.025] p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400/70">{s.label}</p>
                        <p className="mt-2 text-2xl font-bold text-white">{s.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-5 lg:grid-cols-2">
                    {/* Hosts */}
                    <div className="rounded-[20px] border border-white/[0.08] bg-white/[0.02] p-4">
                      <h3 className="mb-4 text-sm font-semibold text-white">Hosts</h3>
                      <form onSubmit={handleAddHost} className="mb-4 space-y-3">
                        <input
                          value={hostForm.host}
                          onChange={(e) => setHostForm((p) => ({ ...p, host: e.target.value }))}
                          required
                          className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-brand-400/40"
                          placeholder="https://provider-domain.example"
                        />
                        <input
                          value={hostForm.priority}
                          onChange={(e) => setHostForm((p) => ({ ...p, priority: Number(e.target.value) }))}
                          type="number"
                          className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-400/40"
                          placeholder="Priority"
                        />
                        <Button type="submit" size="sm" disabled={saving === 'host'} className="w-full rounded-xl">
                          {saving === 'host' ? 'Adding…' : 'Add Host'}
                        </Button>
                      </form>
                      <div className="space-y-2">
                        {(groupDetail?.hosts || []).length === 0 && (
                          <p className="text-xs text-slate-400/60">No hosts added yet</p>
                        )}
                        {(groupDetail?.hosts || []).map((host: any) => (
                          <div key={host.id} className="rounded-[16px] border border-white/[0.07] bg-surface-950/60 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="break-all font-mono text-xs text-slate-300/80">{host.host}</div>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                className="shrink-0 rounded-lg px-2 py-1 text-xs"
                                disabled={saving === `delete-host:${host.id}`}
                                onClick={() => handleDeleteHost(host)}
                              >
                                {saving === `delete-host:${host.id}` ? '...' : 'Delete'}
                              </Button>
                            </div>
                            <p className="mt-1.5 text-[11px] text-slate-400/60">
                              Priority {host.priority} · Last status {host.last_status || 'unknown'} · Checked {formatDate(host.last_checked_at)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Accounts */}
                    <div className="rounded-[20px] border border-white/[0.08] bg-white/[0.02] p-4">
                      <h3 className="mb-4 text-sm font-semibold text-white">Accounts</h3>
                      <form onSubmit={handleAddAccount} className="mb-4 space-y-3">
                        <input
                          value={accountForm.username}
                          onChange={(e) => setAccountForm((p) => ({ ...p, username: e.target.value }))}
                          required
                          className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-brand-400/40"
                          placeholder="xtream_username"
                        />
                        <input
                          value={accountForm.password}
                          onChange={(e) => setAccountForm((p) => ({ ...p, password: e.target.value }))}
                          type="password"
                          required
                          className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-brand-400/40"
                          placeholder="xtream_password"
                        />
                        <Button type="submit" size="sm" disabled={saving === 'account'} className="w-full rounded-xl">
                          {saving === 'account' ? 'Adding…' : 'Add Account'}
                        </Button>
                      </form>
                      <div className="max-h-[380px] space-y-2 overflow-y-auto">
                        {(groupDetail?.accounts || []).length === 0 && (
                          <p className="text-xs text-slate-400/60">No accounts added yet</p>
                        )}
                        {(groupDetail?.accounts || []).map((account: any) => (
                          <div key={account.id} className="rounded-[16px] border border-white/[0.07] bg-surface-950/60 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-white">{account.username}</div>
                                <div className="mt-0.5 text-[11px] text-slate-400/60">
                                  Active cons: {account.last_active_connections ?? '—'} / {account.max_connections ?? '—'} · Checked {formatDate(account.last_checked_at)}
                                </div>
                              </div>
                              <Badge variant={accountStatusVariant(account.status) as any} className="shrink-0 capitalize">
                                {account.status}
                              </Badge>
                            </div>
                            <div className="mt-2 flex justify-end">
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                className="rounded-lg px-2 py-1 text-xs"
                                disabled={saving === `delete-account:${account.id}`}
                                onClick={() => handleDeleteAccount(account)}
                              >
                                {saving === `delete-account:${account.id}` ? '...' : 'Delete'}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </>
            ) : (
              <CardContent className="p-6">
                <p className="text-sm text-slate-400/60">Select a group to manage hosts, accounts, and catalog refresh.</p>
              </CardContent>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between border-b border-white/[0.08] pb-4">
              <CardTitle>Assignments</CardTitle>
              <span className="text-xs text-slate-400/60">{assignments.length} recent rows</span>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400/70">User</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400/70">Group</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400/70">Account</th>
                      <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400/70">Status</th>
                      <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400/70">Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((assignment) => (
                      <tr key={assignment.id} className="border-b border-white/[0.06] last:border-b-0">
                        <td className="px-6 py-3 text-slate-100">{assignment.email}</td>
                        <td className="px-4 py-3 text-slate-300/80">{assignment.provider_group_name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-300/80">{assignment.username}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={statusVariant(assignment.status) as any} className="capitalize">
                            {assignment.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-3 text-right text-xs text-slate-400/70">{formatDate(assignment.expires_at)}</td>
                      </tr>
                    ))}
                    {assignments.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-400/60">
                          No assignments yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
