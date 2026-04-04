import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI } from '../utils/api';
import toast from 'react-hot-toast';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = () => {
    adminAPI.listUsers({ search, limit: 100 })
      .then(res => setUsers(res.data))
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search]);

  const handleSuspend = async (user) => {
    try {
      await adminAPI.suspendUser(user.id, user.is_active);
      toast.success(user.is_active ? 'User suspended' : 'User activated');
      load();
    } catch (_) { toast.error('Action failed'); }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Delete user ${user.email}? This is permanent.`)) return;
    try {
      await adminAPI.deleteUser(user.id);
      toast.success('User deleted');
      setUsers(prev => prev.filter(u => u.id !== user.id));
    } catch (_) { toast.error('Delete failed'); }
  };

  if (loading) return <div style={{ color: '#64748b' }}>Loading...</div>;

  return (
    <div style={{ maxWidth: '1000px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f1f5f9' }}>Users ({users.length})</h1>
        <input placeholder="Search by email..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', fontSize: '0.85rem', outline: 'none', width: '220px' }} />
      </div>

      <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: '#0f172a', color: '#64748b', borderBottom: '1px solid #334155' }}>
              <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 500 }}>Email</th>
              <th style={{ textAlign: 'center', padding: '12px 8px', fontWeight: 500 }}>Providers</th>
              <th style={{ textAlign: 'center', padding: '12px 8px', fontWeight: 500 }}>Free Access</th>
              <th style={{ textAlign: 'center', padding: '12px 8px', fontWeight: 500 }}>Status</th>
              <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 500 }}>Created</th>
              <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 500 }}>Last Seen</th>
              <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 500 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={{ borderBottom: '1px solid #334155' }}>
                <td style={{ padding: '12px 16px', color: '#f1f5f9' }}>{user.email}</td>
                <td style={{ textAlign: 'center', padding: '12px 8px', color: '#94a3b8' }}>{user.provider_count}</td>
                <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                  <span style={{
                    fontSize: '0.72rem',
                    padding: '2px 8px',
                    borderRadius: '20px',
                    background: user.free_access_status === 'active' ? '#14532d' : user.free_access_status === 'expired' ? '#78350f' : '#1e293b',
                    color: user.free_access_status === 'active' ? '#86efac' : user.free_access_status === 'expired' ? '#fde68a' : '#94a3b8',
                  }}>
                    {user.free_access_status || 'inactive'}
                  </span>
                </td>
                <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '20px', background: user.is_active ? '#14532d' : '#7f1d1d', color: user.is_active ? '#86efac' : '#fca5a5' }}>
                    {user.is_active ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td style={{ textAlign: 'right', padding: '12px 8px', color: '#64748b', fontSize: '0.78rem' }}>{new Date(user.created_at).toLocaleDateString()}</td>
                <td style={{ textAlign: 'right', padding: '12px 8px', color: '#64748b', fontSize: '0.78rem' }}>{user.last_seen ? new Date(user.last_seen).toLocaleDateString() : 'Never'}</td>
                <td style={{ textAlign: 'center', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                    <Link to={`/admin/users/${user.id}`} style={{ padding: '5px 10px', borderRadius: '6px', background: '#334155', color: '#f1f5f9', textDecoration: 'none', fontSize: '0.75rem' }}>View</Link>
                    <button onClick={() => handleSuspend(user)} style={{ padding: '5px 10px', borderRadius: '6px', background: user.is_active ? '#78350f' : '#14532d', color: user.is_active ? '#fde68a' : '#86efac', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}>
                      {user.is_active ? 'Suspend' : 'Activate'}
                    </button>
                    <button onClick={() => handleDelete(user)} style={{ padding: '5px 10px', borderRadius: '6px', background: '#450a0a', color: '#fca5a5', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
