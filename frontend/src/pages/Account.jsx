import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI, userAPI } from '../utils/api';
import toast from 'react-hot-toast';

const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: '8px',
  background: '#0f172a', border: '1px solid #334155',
  color: '#f1f5f9', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
};

export default function Account() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [changingPw, setChangingPw] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) return toast.error('Passwords do not match');
    if (passwords.new.length < 8) return toast.error('Password must be at least 8 characters');
    setChangingPw(true);
    try {
      await authAPI.changePassword(passwords.current, passwords.new);
      toast.success('Password changed successfully');
      setPasswords({ current: '', new: '', confirm: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    } finally {
      setChangingPw(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('⚠️ Permanently delete your account and all data? This cannot be undone.')) return;
    if (!window.confirm('Are you absolutely sure? Type "yes" in the next dialog.')) return;
    const confirm = window.prompt('Type "delete" to confirm:');
    if (confirm !== 'delete') return toast.error('Cancelled');
    setDeleting(true);
    try {
      await userAPI.deleteAccount();
      await logout();
      navigate('/login');
      toast.success('Account deleted');
    } catch (_) {
      toast.error('Failed to delete account');
      setDeleting(false);
    }
  };

  return (
    <div style={{ maxWidth: '560px' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '8px' }}>Account</h1>
      <p style={{ color: '#64748b', marginBottom: '28px' }}>Manage your account settings</p>

      {/* Account Info */}
      <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '16px' }}>Account Info</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Email</span>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{user?.email}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Member Since</span>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Last Seen</span>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{user?.last_seen ? new Date(user.last_seen).toLocaleString() : '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Account Status</span>
            <span style={{ fontSize: '0.85rem', color: user?.is_active ? '#86efac' : '#fca5a5' }}>{user?.is_active ? 'Active' : 'Suspended'}</span>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '16px' }}>Change Password</h2>
        <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: '#94a3b8' }}>Current Password</label>
            <input style={inputStyle} type="password" required placeholder="••••••••"
              value={passwords.current} onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: '#94a3b8' }}>New Password</label>
            <input style={inputStyle} type="password" required placeholder="Min. 8 characters"
              value={passwords.new} onChange={e => setPasswords(p => ({ ...p, new: e.target.value }))} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: '#94a3b8' }}>Confirm New Password</label>
            <input style={inputStyle} type="password" required placeholder="Repeat new password"
              value={passwords.confirm} onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))} />
          </div>
          <button type="submit" disabled={changingPw}
            style={{ padding: '10px', borderRadius: '8px', background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, opacity: changingPw ? 0.7 : 1 }}>
            {changingPw ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </div>

      {/* Danger Zone */}
      <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #7f1d1d' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '8px' }}>⚠️ Danger Zone</h2>
        <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '16px' }}>
          Permanently delete your account and all associated providers, VOD data, and addon URLs. This action is irreversible.
        </p>
        <button onClick={handleDeleteAccount} disabled={deleting}
          style={{ padding: '10px 18px', borderRadius: '8px', background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', opacity: deleting ? 0.7 : 1 }}>
          {deleting ? 'Deleting...' : 'Delete Account'}
        </button>
      </div>
    </div>
  );
}
