import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI, userAPI } from '../utils/api';
import { CheckIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

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
    if (!window.confirm('Permanently delete your account and all data? This cannot be undone.')) return;
    if (!window.confirm('Are you absolutely sure?')) return;
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
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="panel overflow-hidden p-6 sm:p-8 lg:p-10">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <div className="kicker mb-5">Account</div>
            <h1 className="hero-title">Secure your workspace and keep access predictable.</h1>
            <p className="hero-copy mt-4">
              Your account controls provider access, addon identity, and route-level security. Keep your password current and treat destructive actions carefully.
            </p>
          </div>
          <div className="panel-soft p-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-100">
              <ShieldCheckIcon className="h-4 w-4" />
              {user?.is_active ? 'Account active' : 'Account suspended'}
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-300/[0.68]">
              Email, addon token, and provider records are bound to this account identity.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="panel-soft p-6 sm:p-8">
          <p className="eyebrow mb-2">Profile</p>
          <h2 className="section-title">Account information</h2>
          <div className="mt-6 space-y-4">
            {[
              ['Email', user?.email || '—'],
              ['Member Since', user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'],
              ['Last Seen', user?.last_seen ? new Date(user.last_seen).toLocaleDateString() : '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
                <span className="text-sm text-slate-300/60">{label}</span>
                <span className="text-sm font-medium text-white">{value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-300/60">Status</span>
              <span className={`inline-flex items-center gap-2 text-sm font-medium ${user?.is_active ? 'text-emerald-100' : 'text-red-100'}`}>
                {user?.is_active && <CheckIcon className="h-4 w-4" />}
                {user?.is_active ? 'Active' : 'Suspended'}
              </span>
            </div>
          </div>
        </div>

        <div className="panel-soft p-6 sm:p-8">
          <p className="eyebrow mb-2">Security</p>
          <h2 className="section-title">Change password</h2>
          <form onSubmit={handleChangePassword} className="mt-6 space-y-5">
            <div>
              <label className="field-label">Current Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={passwords.current}
                onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))}
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label">New Password</label>
              <input
                type="password"
                required
                placeholder="Minimum 8 characters"
                value={passwords.new}
                onChange={e => setPasswords(p => ({ ...p, new: e.target.value }))}
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label">Confirm New Password</label>
              <input
                type="password"
                required
                placeholder="Repeat new password"
                value={passwords.confirm}
                onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))}
                className="field-input"
              />
            </div>
            <button type="submit" disabled={changingPw} className="btn-primary w-full">
              {changingPw ? 'Updating password...' : 'Update Password'}
            </button>
          </form>
        </div>
      </section>

      <section className="panel-soft border-red-400/[0.15] bg-red-500/5 p-6 sm:p-8">
        <p className="eyebrow mb-2 text-red-100/60">Danger Zone</p>
        <h2 className="section-title">Delete account</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300/[0.72]">
          This removes your account, providers, and addon access permanently. There is no recovery path after confirmation.
        </p>
        <button onClick={handleDeleteAccount} disabled={deleting} className="btn-danger mt-6">
          {deleting ? 'Deleting account...' : 'Delete Account'}
        </button>
      </section>
    </div>
  );
}
