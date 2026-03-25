import React, { useEffect, useState } from 'react';
import { adminAPI } from '../utils/api';
import toast from 'react-hot-toast';

export default function AdminHealth() {
  const [hosts, setHosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    adminAPI.getHealthStats()
      .then(res => setHosts(res.data))
      .catch(() => toast.error('Failed to load health data'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const online = hosts.filter(h => h.status === 'online').length;
  const offline = hosts.filter(h => h.status === 'offline').length;

  if (loading) return <div style={{ color: '#64748b' }}>Loading...</div>;

  return (
    <div style={{ maxWidth: '1000px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f1f5f9' }}>Host Health</h1>
        <div style={{ display: 'flex', gap: '12px', fontSize: '0.85rem' }}>
          <span style={{ color: '#86efac' }}>✓ {online} online</span>
          <span style={{ color: '#fca5a5' }}>✗ {offline} offline</span>
          <button onClick={load} style={{ padding: '6px 12px', borderRadius: '7px', background: '#334155', color: '#f1f5f9', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>Refresh</button>
        </div>
      </div>

      <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: '#0f172a', color: '#64748b', borderBottom: '1px solid #334155' }}>
              <th style={{ textAlign: 'left', padding: '12px 14px', fontWeight: 500 }}>Host URL</th>
              <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 500 }}>Provider</th>
              <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 500 }}>User</th>
              <th style={{ textAlign: 'center', padding: '12px 8px', fontWeight: 500 }}>Status</th>
              <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 500 }}>Response</th>
              <th style={{ textAlign: 'right', padding: '12px 14px', fontWeight: 500 }}>Last Checked</th>
            </tr>
          </thead>
          <tbody>
            {hosts.map(h => (
              <tr key={h.id} style={{ borderBottom: '1px solid #334155' }}>
                <td style={{ padding: '10px 14px', color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.78rem', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {h.host_url}
                </td>
                <td style={{ padding: '10px 8px', color: '#94a3b8', fontSize: '0.82rem' }}>{h.provider_name}</td>
                <td style={{ padding: '10px 8px', color: '#64748b', fontSize: '0.78rem' }}>{h.user_email}</td>
                <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '20px', background: h.status === 'online' ? '#14532d' : '#7f1d1d', color: h.status === 'online' ? '#86efac' : '#fca5a5' }}>
                    {h.status}
                  </span>
                </td>
                <td style={{ textAlign: 'right', padding: '10px 8px', color: '#94a3b8' }}>{h.response_time_ms ? `${h.response_time_ms}ms` : '—'}</td>
                <td style={{ textAlign: 'right', padding: '10px 14px', color: '#64748b', fontSize: '0.75rem' }}>{h.last_checked ? new Date(h.last_checked).toLocaleString() : '—'}</td>
              </tr>
            ))}
            {hosts.length === 0 && (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>No host data yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
