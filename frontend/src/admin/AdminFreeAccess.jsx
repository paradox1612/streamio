import React, { useEffect, useMemo, useState } from 'react';
import { adminAPI } from '../utils/api';
import toast from 'react-hot-toast';

const panelStyle = {
  background: '#1e293b',
  borderRadius: '12px',
  border: '1px solid #334155',
};

const inputStyle = {
  padding: '8px 12px',
  borderRadius: '8px',
  background: '#0f172a',
  border: '1px solid #334155',
  color: '#f1f5f9',
  fontSize: '0.85rem',
  outline: 'none',
  width: '100%',
};

const buttonBase = {
  padding: '8px 12px',
  borderRadius: '8px',
  border: 'none',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: 600,
};

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function StatusPill({ color, label }) {
  return (
    <span style={{
      fontSize: '0.72rem',
      padding: '2px 8px',
      borderRadius: '20px',
      background: `${color}22`,
      color,
      border: `1px solid ${color}33`,
    }}>
      {label}
    </span>
  );
}

export default function AdminFreeAccess() {
  const [groups, setGroups] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupDetail, setGroupDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [groupForm, setGroupForm] = useState({
    name: '',
    trialDays: 7,
    notes: '',
  });
  const [hostForm, setHostForm] = useState({
    host: '',
    priority: 100,
  });
  const [accountForm, setAccountForm] = useState({
    username: '',
    password: '',
  });

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) || null,
    [groups, selectedGroupId]
  );

  const load = async ({ preserveSelection = true } = {}) => {
    try {
      const [groupsRes, assignmentsRes] = await Promise.all([
        adminAPI.listFreeAccessGroups(),
        adminAPI.listFreeAccessAssignments({ limit: 200 }),
      ]);

      const nextGroups = groupsRes.data || [];
      setGroups(nextGroups);
      setAssignments(assignmentsRes.data || []);

      const nextSelected = preserveSelection && selectedGroupId
        ? nextGroups.find((group) => group.id === selectedGroupId)?.id
        : nextGroups[0]?.id || '';
      setSelectedGroupId(nextSelected || '');
    } catch (_) {
      toast.error('Failed to load free access data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load({ preserveSelection: false });
  }, []);

  useEffect(() => {
    if (!selectedGroupId) {
      setGroupDetail(null);
      return;
    }

    adminAPI.getFreeAccessGroup(selectedGroupId)
      .then((res) => setGroupDetail(res.data))
      .catch(() => toast.error('Failed to load free access group details'));
  }, [selectedGroupId]);

  const reloadGroupDetail = async (groupId = selectedGroupId) => {
    if (!groupId) return;
    const res = await adminAPI.getFreeAccessGroup(groupId);
    setGroupDetail(res.data);
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setSaving('group');
    try {
      const res = await adminAPI.createFreeAccessGroup({
        name: groupForm.name,
        trialDays: parseInt(groupForm.trialDays, 10) || 7,
        notes: groupForm.notes.trim() || null,
      });
      toast.success('Free access group created');
      setGroupForm({ name: '', trialDays: 7, notes: '' });
      await load({ preserveSelection: false });
      setSelectedGroupId(res.data.id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create group');
    } finally {
      setSaving('');
    }
  };

  const handleAddHost = async (e) => {
    e.preventDefault();
    if (!selectedGroupId) return;
    setSaving('host');
    try {
      await adminAPI.addFreeAccessHost(selectedGroupId, {
        host: hostForm.host,
        priority: parseInt(hostForm.priority, 10) || 100,
      });
      toast.success('Host added');
      setHostForm({ host: '', priority: 100 });
      await Promise.all([load(), reloadGroupDetail()]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add host');
    } finally {
      setSaving('');
    }
  };

  const handleAddAccount = async (e) => {
    e.preventDefault();
    if (!selectedGroupId) return;
    setSaving('account');
    try {
      await adminAPI.addFreeAccessAccount(selectedGroupId, accountForm);
      toast.success('Account added');
      setAccountForm({ username: '', password: '' });
      await Promise.all([load(), reloadGroupDetail()]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add account');
    } finally {
      setSaving('');
    }
  };

  const handleRefreshGroup = async () => {
    if (!selectedGroupId) return;
    setSaving('refresh');
    try {
      await adminAPI.refreshFreeAccessGroup(selectedGroupId);
      toast.success('Managed catalog refresh started');
      await Promise.all([load(), reloadGroupDetail()]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to refresh managed catalog');
    } finally {
      setSaving('');
    }
  };

  const handleDeleteGroup = async () => {
    if (!selectedGroupId || !selectedGroup) return;
    if (!window.confirm(`Delete free access group "${selectedGroup.name}"? This removes its hosts, accounts, catalog, and assignments.`)) return;

    setSaving('delete-group');
    try {
      await adminAPI.deleteFreeAccessGroup(selectedGroupId);
      toast.success('Free access group deleted');
      setGroupDetail(null);
      setSelectedGroupId('');
      await load({ preserveSelection: false });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete group');
    } finally {
      setSaving('');
    }
  };

  const handleDeleteHost = async (host) => {
    if (!selectedGroupId) return;
    if (!window.confirm(`Delete host "${host.host}"?`)) return;

    setSaving(`delete-host:${host.id}`);
    try {
      await adminAPI.deleteFreeAccessHost(selectedGroupId, host.id);
      toast.success('Host deleted');
      await Promise.all([load(), reloadGroupDetail()]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete host');
    } finally {
      setSaving('');
    }
  };

  const handleDeleteAccount = async (account) => {
    if (!selectedGroupId) return;
    if (!window.confirm(`Delete account "${account.username}"?`)) return;

    setSaving(`delete-account:${account.id}`);
    try {
      await adminAPI.deleteFreeAccessAccount(selectedGroupId, account.id);
      toast.success('Account deleted');
      await Promise.all([load(), reloadGroupDetail()]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete account');
    } finally {
      setSaving('');
    }
  };

  if (loading) return <div style={{ color: '#64748b' }}>Loading...</div>;

  return (
    <div style={{ display: 'grid', gap: '20px', maxWidth: '1280px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '6px' }}>Free Access</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.92rem', maxWidth: '760px', lineHeight: 1.5 }}>
            Manage the hidden managed fallback inventory. These groups power free movie and series fallback only, never web catalogs or Live TV.
          </p>
        </div>
        <button
          onClick={() => load()}
          style={{ ...buttonBase, background: '#334155', color: '#f1f5f9' }}
        >
          Refresh Data
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) minmax(0, 1fr)', gap: '20px', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: '20px' }}>
          <div style={{ ...panelStyle, padding: '20px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '16px' }}>Create Group</h2>
            <form onSubmit={handleCreateGroup} style={{ display: 'grid', gap: '12px' }}>
              <div>
                <div style={{ color: '#94a3b8', fontSize: '0.76rem', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</div>
                <input value={groupForm.name} onChange={(e) => setGroupForm((prev) => ({ ...prev, name: e.target.value }))} required style={inputStyle} placeholder="Provider A Free Pool" />
              </div>
              <div>
                <div style={{ color: '#94a3b8', fontSize: '0.76rem', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trial Days</div>
                <input value={groupForm.trialDays} onChange={(e) => setGroupForm((prev) => ({ ...prev, trialDays: e.target.value }))} type="number" min="1" style={inputStyle} />
              </div>
              <div>
                <div style={{ color: '#94a3b8', fontSize: '0.76rem', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</div>
                <textarea value={groupForm.notes} onChange={(e) => setGroupForm((prev) => ({ ...prev, notes: e.target.value }))} rows={4} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Internal notes about this managed inventory source" />
              </div>
              <button type="submit" disabled={saving === 'group'} style={{ ...buttonBase, background: '#1d4ed8', color: '#dbeafe' }}>
                {saving === 'group' ? 'Creating…' : 'Create Group'}
              </button>
            </form>
          </div>

          <div style={{ ...panelStyle, padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }}>Groups</h2>
              <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{groups.length} total</span>
            </div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {groups.length === 0 && (
                <div style={{ color: '#64748b', fontSize: '0.85rem' }}>No groups yet</div>
              )}
              {groups.map((group) => {
                const active = group.id === selectedGroupId;
                return (
                  <button
                    key={group.id}
                    onClick={() => setSelectedGroupId(group.id)}
                    style={{
                      textAlign: 'left',
                      padding: '14px',
                      borderRadius: '10px',
                      background: active ? '#312e81' : '#0f172a',
                      border: `1px solid ${active ? '#6366f1' : '#334155'}`,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                      <div>
                        <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '0.88rem' }}>{group.name}</div>
                        <div style={{ color: '#94a3b8', fontSize: '0.76rem', marginTop: '3px' }}>
                          {group.account_count} accounts · {group.host_count} hosts · {parseInt(group.catalog_count || 0, 10).toLocaleString()} catalog rows
                        </div>
                      </div>
                      <StatusPill color={group.is_active ? '#86efac' : '#fca5a5'} label={group.is_active ? 'Active' : 'Disabled'} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '20px' }}>
          <div style={{ ...panelStyle, padding: '20px' }}>
            {selectedGroup ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '18px' }}>
                  <div>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '4px' }}>{selectedGroup.name}</h2>
                    <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>
                      Trial days: {selectedGroup.trial_days} · Catalog refreshed: {formatDate(selectedGroup.catalog_last_refreshed_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      onClick={handleRefreshGroup}
                      disabled={saving === 'refresh'}
                      style={{ ...buttonBase, background: '#14532d', color: '#86efac' }}
                    >
                      {saving === 'refresh' ? 'Refreshing…' : 'Refresh Catalog'}
                    </button>
                    <button
                      onClick={handleDeleteGroup}
                      disabled={saving === 'delete-group'}
                      style={{ ...buttonBase, background: '#450a0a', color: '#fca5a5' }}
                    >
                      {saving === 'delete-group' ? 'Deleting…' : 'Delete Group'}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                  {[
                    { label: 'Hosts', value: groupDetail?.hosts?.length || 0, color: '#22d3ee' },
                    { label: 'Accounts', value: groupDetail?.accounts?.length || 0, color: '#a3e635' },
                    { label: 'Catalog Rows', value: parseInt(selectedGroup.catalog_count || 0, 10).toLocaleString(), color: '#fb923c' },
                    { label: 'Assignments', value: assignments.filter((assignment) => assignment.provider_group_id === selectedGroupId && assignment.status === 'active').length, color: '#c084fc' },
                  ].map((stat) => (
                    <div key={stat.label} style={{ background: '#0f172a', borderRadius: '10px', padding: '14px', border: '1px solid #334155' }}>
                      <div style={{ color: '#64748b', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>{stat.label}</div>
                      <div style={{ color: stat.color, fontSize: '1.45rem', fontWeight: 700 }}>{stat.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div style={{ background: '#0f172a', borderRadius: '10px', border: '1px solid #334155', padding: '16px' }}>
                    <h3 style={{ margin: 0, color: '#f1f5f9', fontSize: '0.95rem', fontWeight: 600 }}>Hosts</h3>
                    <form onSubmit={handleAddHost} style={{ display: 'grid', gap: '10px', marginTop: '14px', marginBottom: '16px' }}>
                      <input value={hostForm.host} onChange={(e) => setHostForm((prev) => ({ ...prev, host: e.target.value }))} required style={inputStyle} placeholder="https://provider-domain.example" />
                      <input value={hostForm.priority} onChange={(e) => setHostForm((prev) => ({ ...prev, priority: e.target.value }))} type="number" style={inputStyle} placeholder="Priority" />
                      <button type="submit" disabled={saving === 'host'} style={{ ...buttonBase, background: '#0f766e', color: '#99f6e4' }}>
                        {saving === 'host' ? 'Adding…' : 'Add Host'}
                      </button>
                    </form>
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {(groupDetail?.hosts || []).length === 0 && <div style={{ color: '#64748b', fontSize: '0.82rem' }}>No hosts added yet</div>}
                      {(groupDetail?.hosts || []).map((host) => (
                        <div key={host.id} style={{ padding: '12px', borderRadius: '8px', background: '#111827', border: '1px solid #334155' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
                            <div style={{ color: '#e2e8f0', fontSize: '0.82rem', fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 }}>{host.host}</div>
                            <button
                              onClick={() => handleDeleteHost(host)}
                              disabled={saving === `delete-host:${host.id}`}
                              style={{ ...buttonBase, padding: '5px 8px', background: '#450a0a', color: '#fca5a5', fontSize: '0.72rem' }}
                            >
                              {saving === `delete-host:${host.id}` ? 'Deleting…' : 'Delete'}
                            </button>
                          </div>
                          <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '5px' }}>
                            Priority {host.priority} · Last status {host.last_status || 'unknown'} · Checked {formatDate(host.last_checked_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ background: '#0f172a', borderRadius: '10px', border: '1px solid #334155', padding: '16px' }}>
                    <h3 style={{ margin: 0, color: '#f1f5f9', fontSize: '0.95rem', fontWeight: 600 }}>Accounts</h3>
                    <form onSubmit={handleAddAccount} style={{ display: 'grid', gap: '10px', marginTop: '14px', marginBottom: '16px' }}>
                      <input value={accountForm.username} onChange={(e) => setAccountForm((prev) => ({ ...prev, username: e.target.value }))} required style={inputStyle} placeholder="xtream_username" />
                      <input value={accountForm.password} onChange={(e) => setAccountForm((prev) => ({ ...prev, password: e.target.value }))} type="password" required style={inputStyle} placeholder="xtream_password" />
                      <button type="submit" disabled={saving === 'account'} style={{ ...buttonBase, background: '#92400e', color: '#fde68a' }}>
                        {saving === 'account' ? 'Adding…' : 'Add Account'}
                      </button>
                    </form>
                    <div style={{ display: 'grid', gap: '8px', maxHeight: '380px', overflowY: 'auto' }}>
                      {(groupDetail?.accounts || []).length === 0 && <div style={{ color: '#64748b', fontSize: '0.82rem' }}>No accounts added yet</div>}
                      {(groupDetail?.accounts || []).map((account) => (
                        <div key={account.id} style={{ padding: '12px', borderRadius: '8px', background: '#111827', border: '1px solid #334155' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                            <div>
                              <div style={{ color: '#e2e8f0', fontSize: '0.84rem', fontWeight: 600 }}>{account.username}</div>
                              <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px' }}>
                                Active cons: {account.last_active_connections ?? '—'} / {account.max_connections ?? '—'} · Last checked {formatDate(account.last_checked_at)}
                              </div>
                            </div>
                            <StatusPill
                              color={account.status === 'assigned' ? '#93c5fd' : account.status === 'available' ? '#86efac' : '#fca5a5'}
                              label={account.status}
                            />
                          </div>
                          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => handleDeleteAccount(account)}
                              disabled={saving === `delete-account:${account.id}`}
                              style={{ ...buttonBase, padding: '5px 8px', background: '#450a0a', color: '#fca5a5', fontSize: '0.72rem' }}
                            >
                              {saving === `delete-account:${account.id}` ? 'Deleting…' : 'Delete'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ color: '#64748b', fontSize: '0.9rem' }}>Select a group to manage hosts, accounts, and catalog refresh.</div>
            )}
          </div>

          <div style={{ ...panelStyle, padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '12px', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, color: '#f1f5f9', fontSize: '1rem', fontWeight: 600 }}>Assignments</h2>
              <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{assignments.length} recent rows</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#0f172a', color: '#64748b', borderBottom: '1px solid #334155' }}>
                    <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 500 }}>User</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 500 }}>Group</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 500 }}>Account</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px', fontWeight: 500 }}>Status</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 500 }}>Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((assignment) => (
                    <tr key={assignment.id} style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '10px 12px', color: '#f1f5f9' }}>{assignment.email}</td>
                      <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{assignment.provider_group_name}</td>
                      <td style={{ padding: '10px 12px', color: '#94a3b8', fontFamily: 'monospace' }}>{assignment.username}</td>
                      <td style={{ textAlign: 'center', padding: '10px 12px' }}>
                        <StatusPill
                          color={assignment.status === 'active' ? '#86efac' : assignment.status === 'expired' ? '#fbbf24' : '#fca5a5'}
                          label={assignment.status}
                        />
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 12px', color: '#64748b' }}>{formatDate(assignment.expires_at)}</td>
                    </tr>
                  ))}
                  {assignments.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>No assignments yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
