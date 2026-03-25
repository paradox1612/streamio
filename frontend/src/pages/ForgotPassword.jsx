import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../utils/api';
import toast from 'react-hot-toast';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authAPI.forgotPassword(email);
      setSent(true);
    } catch (_) {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🔑</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#818cf8' }}>Reset Password</h1>
          <p style={{ color: '#64748b', marginTop: '4px' }}>Enter your email to receive a reset link</p>
        </div>

        <div style={{ background: '#1e293b', borderRadius: '12px', padding: '28px', border: '1px solid #334155' }}>
          {sent ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>✉️</div>
              <p style={{ color: '#94a3b8', marginBottom: '16px' }}>If that email exists in our system, a reset link has been sent.</p>
              <Link to="/login" style={{ color: '#818cf8', textDecoration: 'none', fontSize: '0.9rem' }}>← Back to login</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: '#94a3b8' }}>Email Address</label>
                <input
                  type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <button type="submit" disabled={loading}
                style={{ padding: '11px', borderRadius: '8px', background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <div style={{ textAlign: 'center' }}>
                <Link to="/login" style={{ color: '#64748b', textDecoration: 'none', fontSize: '0.85rem' }}>← Back to login</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
