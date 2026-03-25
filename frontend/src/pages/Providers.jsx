import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { providerAPI } from '../utils/api';
import toast from 'react-hot-toast';

const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: '8px',
  background: '#0f172a', border: '1px solid #334155',
  color: '#f1f5f9', fontSize: '0.9rem', outline: 'none',
  boxSizing: 'border-box',
};

function AddProviderModal({ onClose, onAdded }) {
  const [form, setForm] = useState({ name: '', hostsInput: '', username: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const hosts = form.hostsInput.split('\n').map(h => h.trim()).filter(Boolean);
    if (!hosts.length) return toast.error('Enter at least one host URL');
    setLoading(true);
    try {
      const res = await providerAPI.create({ name: form.name, hosts, username: form.username, password: form.password });
      toast.success('Provider added!');
      onAdded(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add provider');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: '#1e293b', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '480px', border: '1px solid #334155' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '20px' }}>Add IPTV Provider</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: '#94a3b8' }}>Provider Name</label>
            <input style={inputStyle} required placeholder="My IPTV" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: '#94a3b8' }}>Host URLs (one per line)</label>
            <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} required
              placeholder="http://provider1.com&#10;http://provider2.com"
              value={form.hostsInput} onChange={e => setForm(f => ({ ...f, hostsInput: e.target.value }))} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: '#94a3b8' }}>Username</label>
            <input style={inputStyle} required placeholder="xtream_username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: '#94a3b8' }}>Password</label>
            <input style={inputStyle} type="password" required placeholder="xtream_password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 18px', borderRadius: '8px', background: '#334155', color: '#f1f5f9', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ padding: '10px 18px', borderRadius: '8px', background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Adding...' : 'Add Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProviderRow({ provider, onRefresh, onDelete }) {
  const [loading, setLoading] = useState('');
  const online = provider.status === 'online';
  const matchRate = provider.vod_count && provider.matched_count
    ? Math.round((parseInt(provider.matched_count) / parseInt(provider.vod_count)) * 100)
    : 0;

  const handleTest = async () => {
    setLoading('test');
    try {
      await providerAPI.test(provider.id);
      toast.success('Connection tested');
      onRefresh();
    } catch (_) { toast.error('Test failed'); }
    finally { setLoading(''); }
  };

  const handleRefresh = async () => {
    setLoading('refresh');
    try {
      const res = await providerAPI.refresh(provider.id);
      toast.success(`Refreshed: ${res.data.total} titles`);
      onRefresh();
    } catch (_) { toast.error('Refresh failed'); }
    finally { setLoading(''); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${provider.name}"? This cannot be undone.`)) return;
    try {
      await providerAPI.delete(provider.id);
      toast.success('Provider deleted');
      onDelete(provider.id);
    } catch (_) { toast.error('Delete failed'); }
  };

  return (
    <div style={{ background: '#1e293b', borderRadius: '10px', padding: '18px', border: '1px solid #334155', marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{provider.name}</span>
            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '20px', background: online ? '#14532d' : '#7f1d1d', color: online ? '#86efac' : '#fca5a5' }}>
              {online ? '● Online' : provider.status === 'offline' ? '● Offline' : '○ Unknown'}
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
            {provider.active_host || 'No active host'} · {parseInt(provider.vod_count || 0).toLocaleString()} titles · {matchRate}% matched
          </div>
          {provider.last_checked && (
            <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '2px' }}>
              Last checked: {new Date(provider.last_checked).toLocaleString()}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Link to={`/providers/${provider.id}`} style={{ padding: '7px 14px', borderRadius: '7px', background: '#334155', color: '#f1f5f9', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 500 }}>Detail</Link>
          <button onClick={handleTest} disabled={!!loading} style={{ padding: '7px 14px', borderRadius: '7px', background: '#1e3a5f', color: '#93c5fd', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500 }}>
            {loading === 'test' ? '...' : 'Test'}
          </button>
          <button onClick={handleRefresh} disabled={!!loading} style={{ padding: '7px 14px', borderRadius: '7px', background: '#1e4d2b', color: '#86efac', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500 }}>
            {loading === 'refresh' ? '...' : 'Refresh'}
          </button>
          <button onClick={handleDelete} style={{ padding: '7px 14px', borderRadius: '7px', background: '#450a0a', color: '#fca5a5', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500 }}>Delete</button>
        </div>
      </div>

      {/* Hosts */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {(provider.hosts || []).map(host => (
          <span key={host} style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '6px', background: host === provider.active_host ? '#1e4d2b' : '#1e293b', color: host === provider.active_host ? '#86efac' : '#64748b', border: '1px solid #334155' }}>
            {host === provider.active_host ? '✓ ' : ''}{host.replace(/^https?:\/\//, '')}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Providers() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = () => {
    providerAPI.list()
      .then(res => setProviders(res.data))
      .catch(() => toast.error('Failed to load providers'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div style={{ color: '#64748b', padding: '40px' }}>Loading providers...</div>;

  return (
    <div style={{ maxWidth: '800px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9' }}>My Providers</h1>
          <p style={{ color: '#64748b', marginTop: '4px' }}>Manage your IPTV provider credentials</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          style={{ padding: '10px 18px', borderRadius: '8px', background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
          + Add Provider
        </button>
      </div>

      {providers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔌</div>
          <div style={{ marginBottom: '16px' }}>No providers yet</div>
          <button onClick={() => setShowAdd(true)} style={{ padding: '10px 20px', borderRadius: '8px', background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            Add Your First Provider
          </button>
        </div>
      ) : (
        providers.map(p => (
          <ProviderRow key={p.id} provider={p} onRefresh={load} onDelete={id => setProviders(prev => prev.filter(x => x.id !== id))} />
        ))
      )}

      {showAdd && (
        <AddProviderModal
          onClose={() => setShowAdd(false)}
          onAdded={(provider) => { setProviders(prev => [provider, ...prev]); setShowAdd(false); }}
        />
      )}
    </div>
  );
}
