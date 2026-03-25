import React, { useEffect, useState } from 'react';
import { adminAPI } from '../utils/api';
import toast from 'react-hot-toast';

export default function AdminProviders() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    adminAPI.listProviders({ limit: 200 })
      .then(res => setProviders(res.data))
      .catch(() => toast.error('Failed to load providers'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleRefresh = async (id) => {
    try {
      const res = await adminAPI.refreshProvider(id);
      toast.success(`Refreshed: ${res.data.total} titles`);
      load();
    } catch (_) { toast.error('Refresh failed'); }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete provider "${name}"?`)) return;
    try {
      await adminAPI.deleteProvider(id);
      toast.success('Provider deleted');
      setProviders(prev => prev.filter(p => p.id !== id));
    } catch (_) { toast.error('Delete failed'); }
  };

  if (loading) return <div style={{ color: '#64748b' }}>Loading...</div>;

  return (
    <div style={{ maxWidth: '1000px' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '20px' }}>All Providers ({providers.length})</h1>

      <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: '#0f172a', color: '#64748b', borderBottom: '1px solid #334155' }}>
              <th style={{ textAlign: 'left', padding: '12px 14px', fontWeight: 500 }}>Provider</th>
              <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 500 }}>User</th>
              <th style={{ textAlign: 'center', padding: '12px 8px', fontWeight: 500 }}>Status</th>
              <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 500 }}>Titles</th>
              <th style={{ textAlign: 'center', padding: '12px 14px', fontWeight: 500 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {providers.map(p => {
              const online = p.status === 'online';
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ color: '#f1f5f9', fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>{p.active_host || 'No host'}</div>
                  </td>
                  <td style={{ padding: '12px 8px', color: '#94a3b8', fontSize: '0.78rem' }}>{p.user_email}</td>
                  <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                    <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '20px', background: online ? '#14532d' : '#7f1d1d', color: online ? '#86efac' : '#fca5a5' }}>
                      {online ? 'Online' : p.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', padding: '12px 8px', color: '#94a3b8' }}>{parseInt(p.vod_count || 0).toLocaleString()}</td>
                  <td style={{ textAlign: 'center', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                      <button onClick={() => handleRefresh(p.id)} style={{ padding: '5px 10px', borderRadius: '6px', background: '#1e4d2b', color: '#86efac', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}>Refresh</button>
                      <button onClick={() => handleDelete(p.id, p.name)} style={{ padding: '5px 10px', borderRadius: '6px', background: '#450a0a', color: '#fca5a5', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {providers.length === 0 && (
              <tr><td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>No providers</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
