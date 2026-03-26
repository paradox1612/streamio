import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowRightIcon, SparklesIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      return toast.error('Passwords do not match');
    }
    if (form.password.length < 8) {
      return toast.error('Password must be at least 8 characters');
    }
    setLoading(true);
    try {
      await signup(form.email, form.password);
      toast.success('Account created! Welcome to StreamBridge 🎉');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-grid">
        <div className="auth-side">
          <div className="kicker">Private Setup</div>
          <h1 className="mt-8 max-w-md text-5xl font-bold leading-tight text-white">
            Build a personal bridge between your providers and Stremio.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-slate-200/[0.72]">
            Sign up once, connect your IPTV sources, and browse VOD, live channels, and addon settings from one clean workspace.
          </p>
          <div className="mt-12 grid gap-4">
            {[
              'Unique addon URL generated for your account',
              'Provider health, failover, and catalog stats in one place',
              'Fast access to live TV, VOD matching, and account controls',
            ].map((line) => (
              <div key={line} className="panel-soft px-5 py-4 text-sm text-slate-100">
                {line}
              </div>
            ))}
          </div>
        </div>

        <div className="auth-form-wrap">
          <div className="mb-8">
            <div className="kicker">
              <SparklesIcon className="h-4 w-4" />
              New Account
            </div>
            <h2 className="mt-6 text-4xl font-bold text-white">Create your workspace</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-300/[0.72]">
              Start with your account now. Providers and addon setup come right after.
            </p>
          </div>

          <div className="panel p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="field-label">Email Address</label>
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="field-input"
              />
            </div>

            <div>
              <label className="field-label">Password</label>
              <input
                type="password"
                required
                placeholder="Min. 8 characters"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="field-input"
              />
            </div>

            <div>
              <label className="field-label">Confirm Password</label>
              <input
                type="password"
                required
                placeholder="Repeat password"
                value={form.confirm}
                onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                className="field-input"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? 'Creating account...' : 'Create Account'}
              {!loading && <ArrowRightIcon className="h-4 w-4" />}
            </button>
          </form>

          <div className="mt-8 border-t border-white/10 pt-6 text-center">
            <p className="text-sm text-slate-300/70">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-brand-300 transition-colors hover:text-brand-200">
                Sign in
              </Link>
            </p>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
