import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../utils/api';
import toast from 'react-hot-toast';

export default function AdminLogin() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await adminAPI.login(form.username, form.password);
      localStorage.setItem('sb_admin_token', res.data.adminToken);
      toast.success('Admin logged in');
      navigate('/admin/dashboard');
    } catch (_) {
      toast.error('Invalid admin credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🛡️</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#818cf8' }}>Admin Panel</h1>
          <p style={{ color: '#64748b', marginTop: '4px' }}>StreamBridge Administration</p>
        </div>
        <div style={{ background: '#1e293b', borderRadius: '12px', padding: '28px', border: '1px solid #334155' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: '#94a3b8' }}>Username</label>
              <input style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
                required value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: '#94a3b8' }}>Password</label>
              <input style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
                type="password" required value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <button type="submit" disabled={loading}
              style={{ padding: '11px', borderRadius: '8px', background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Signing in...' : 'Sign In as Admin'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
