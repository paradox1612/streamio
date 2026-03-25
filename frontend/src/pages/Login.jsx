import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: '8px',
  background: '#1e293b', border: '1px solid #334155',
  color: '#f1f5f9', fontSize: '0.95rem', outline: 'none',
  boxSizing: 'border-box',
};

const btnStyle = {
  width: '100%', padding: '11px', borderRadius: '8px',
  background: '#4f46e5', color: '#fff', border: 'none',
  fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer',
};

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.email, form.password);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🌉</div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#818cf8' }}>StreamBridge</h1>
          <p style={{ color: '#64748b', marginTop: '6px' }}>Sign in to your account</p>
        </div>

        <div style={{ background: '#1e293b', borderRadius: '12px', padding: '32px', border: '1px solid #334155' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: '#94a3b8' }}>Email</label>
              <input
                style={inputStyle} type="email" required
                placeholder="you@example.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: '#94a3b8' }}>Password</label>
              <input
                style={inputStyle} type="password" required
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              />
            </div>
            <button style={{ ...btnStyle, opacity: loading ? 0.7 : 1 }} disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.85rem', color: '#64748b' }}>
            <Link to="/forgot-password" style={{ color: '#818cf8', textDecoration: 'none' }}>Forgot password?</Link>
            {' · '}
            <Link to="/signup" style={{ color: '#818cf8', textDecoration: 'none' }}>Create account</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
