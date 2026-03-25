import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { providerAPI } from '../utils/api';
import toast from 'react-hot-toast';

function StatusBadge({ status }) {
  const color = status === 'online' ? { bg: '#14532d', text: '#86efac' } : status === 'offline' ? { bg: '#7f1d1d', text: '#fca5a5' } : { bg: '#334155', text: '#94a3b8' };
  return <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '20px', background: color.bg, color: color.text }}>{status}</span>;
}

export default function ProviderDetail() {
  const { id } = useParams();
  const [provider, setProvider] = useState(null);
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ name: '', hostsInput: '', username: '', password: '' });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = async () => {
    try {
      const [provRes, statsRes, healthRes] = await Promise.all([
        providerAPI.get(id),
        providerAPI.getStats(id),
        providerAPI.getHealth(id),
      ]);
      setProvider(provRes.data);
      setForm({
        name: provRes.data.name || '',
        hostsInput: (provRes.data.hosts || []).join('\n'),
        username: provRes.data.username || '',
        password: '',
      });
      setStats(statsRes.data);
      setHealth(healthRes.data);
      setCategories(statsRes.data.categories || []);
    } catch (_) {
      toast.error('Failed to load provider details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleSave = async (e) => {
    e.preventDefault();
    const hosts = form.hostsInput.split('\n').map(host => host.trim().replace(/\/+$/, '')).filter(Boolean);
    if (!form.name.trim()) return toast.error('Provider name is required');
    if (!hosts.length) return toast.error('Enter at least one host URL');
    if (!form.username.trim()) return toast.error('Username is required');

    const payload = {
      name: form.name.trim(),
      hosts,
      username: form.username.trim(),
    };
    if (form.password.trim()) payload.password = form.password;

    setSaving(true);
    try {
      await providerAPI.update(id, payload);
      await load();
      setEditing(false);
      toast.success('Provider updated');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setForm({
      name: provider?.name || '',
      hostsInput: (provider?.hosts || []).join('\n'),
      username: provider?.username || '',
      password: '',
    });
    setEditing(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await providerAPI.refresh(id);
      toast.success(`Refreshed: ${res.data.total} titles`);
      await load();
    } catch (_) { toast.error('Refresh failed'); }
    finally { setRefreshing(false); }
  };

  const handleRecheck = async () => {
    setRechecking(true);
    try {
      const res = await providerAPI.recheckHealth(id);
      setHealth(res.data);
      toast.success('Health recheck complete');
    } catch (_) { toast.error('Recheck failed'); }
    finally { setRechecking(false); }
  };

  if (loading) return <div style={{ color: '#64748b', padding: '40px' }}>Loading...</div>;
  if (!provider) return <div style={{ color: '#64748b', padding: '40px' }}>Provider not found</div>;

  const vodStats = stats?.vodStats || {};
  const matchStats = stats?.matchStats || {};
  const matchRate = matchStats.total > 0 ? Math.round((matchStats.matched / matchStats.total) * 100) : 0;

  return (
    <div style={{ maxWidth: '900px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <Link to="/providers" style={{ color: '#64748b', textDecoration: 'none', fontSize: '0.85rem' }}>← Providers</Link>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f1f5f9' }}>{provider.name}</h1>
        <StatusBadge status={provider.status} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          {!editing ? (
            <button onClick={() => setEditing(true)} style={{ padding: '8px 14px', borderRadius: '8px', background: '#334155', color: '#f1f5f9', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>
              Edit
            </button>
          ) : null}
          <button onClick={handleRecheck} disabled={rechecking} style={{ padding: '8px 14px', borderRadius: '8px', background: '#1e3a5f', color: '#93c5fd', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>
            {rechecking ? 'Checking...' : '🔄 Recheck'}
          </button>
          <button onClick={handleRefresh} disabled={refreshing} style={{ padding: '8px 14px', borderRadius: '8px', background: '#1e4d2b', color: '#86efac', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>
            {refreshing ? 'Refreshing...' : '⟳ Refresh Catalog'}
          </button>
        </div>
      </div>

      {editing && (
        <form onSubmit={handleSave} style={{ background: '#1e293b', borderRadius: '12px', padding: '20px', border: '1px solid #334155', marginBottom: '20px', display: 'grid', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: '#94a3b8' }}>Provider Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: '#94a3b8' }}>Host URLs (one per line)</label>
            <textarea
              value={form.hostsInput}
              onChange={(e) => setForm(prev => ({ ...prev, hostsInput: e.target.value }))}
              style={{ width: '100%', minHeight: '90px', padding: '10px 14px', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: '#94a3b8' }}>Username</label>
            <input
              value={form.username}
              onChange={(e) => setForm(prev => ({ ...prev, username: e.target.value }))}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: '#94a3b8' }}>Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm(prev => ({ ...prev, password: e.target.value }))}
              placeholder="Leave blank to keep current password"
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={handleCancelEdit} disabled={saving} style={{ padding: '10px 18px', borderRadius: '8px', background: '#334155', color: '#f1f5f9', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={{ padding: '10px 18px', borderRadius: '8px', background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Movies', value: parseInt(vodStats.movie_count || 0).toLocaleString() },
          { label: 'Series', value: parseInt(vodStats.series_count || 0).toLocaleString() },
          { label: 'Categories', value: vodStats.category_count || 0 },
          { label: 'Match Rate', value: `${matchRate}%` },
          { label: 'Unmatched', value: parseInt(matchStats.unmatched || 0).toLocaleString() },
        ].map(s => (
          <div key={s.label} style={{ background: '#1e293b', borderRadius: '10px', padding: '14px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#818cf8' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Host Health Table */}
      <div style={{ background: '#1e293b', borderRadius: '12px', padding: '20px', border: '1px solid #334155', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '16px' }}>Host Health</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ color: '#64748b', borderBottom: '1px solid #334155' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500 }}>Host</th>
                <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 500 }}>Status</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 500 }}>Response</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 500 }}>Last Checked</th>
                <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 500 }}>Active</th>
              </tr>
            </thead>
            <tbody>
              {health.length === 0 ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>No health data yet — run a recheck</td></tr>
              ) : health.map(h => (
                <tr key={h.id} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '10px 12px', color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.8rem' }}>{h.host_url}</td>
                  <td style={{ textAlign: 'center', padding: '10px 12px' }}><StatusBadge status={h.status} /></td>
                  <td style={{ textAlign: 'right', padding: '10px 12px', color: '#94a3b8' }}>{h.response_time_ms ? `${h.response_time_ms}ms` : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '10px 12px', color: '#64748b', fontSize: '0.78rem' }}>
                    {h.last_checked ? new Date(h.last_checked).toLocaleString() : '—'}
                  </td>
                  <td style={{ textAlign: 'center', padding: '10px 12px' }}>
                    {h.host_url === provider.active_host ? '✓' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Category Breakdown */}
      {categories.length > 0 && (
        <div style={{ background: '#1e293b', borderRadius: '12px', padding: '20px', border: '1px solid #334155' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '16px' }}>Category Breakdown</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
            {categories.slice(0, 30).map(cat => (
              <div key={`${cat.category}-${cat.vod_type}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '7px', background: '#0f172a', border: '1px solid #334155' }}>
                <span style={{ color: '#94a3b8', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.category} <span style={{ color: '#475569', fontSize: '0.75rem' }}>({cat.vod_type})</span></span>
                <span style={{ color: '#818cf8', fontSize: '0.82rem', fontWeight: 600, marginLeft: '8px', flexShrink: 0 }}>{parseInt(cat.count).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
