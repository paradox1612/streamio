import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowRightIcon, ShieldCheckIcon, SparklesIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

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
    <div className="auth-shell">
      <div className="auth-grid">
        <div className="auth-side">
          <div className="kicker">Cinematic Glass</div>
          <h1 className="mt-8 max-w-md text-5xl font-bold leading-tight text-white">
            Your streaming control surface, tuned for clarity.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-slate-200/[0.72]">
            Manage providers, launch Stremio, monitor health, and keep your catalog matched without fighting the interface.
          </p>
          <div className="mt-12 space-y-4">
            {[
              ['Provider failover', 'Keep active hosts visible and switch-ready when reliability changes.'],
              ['Private addon routing', 'One secure URL for your account, ready to install in seconds.'],
              ['Catalog confidence', 'Browse matched and unmatched titles without losing context.'],
            ].map(([title, body]) => (
              <div key={title} className="panel-soft p-5">
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300/[0.68]">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="auth-form-wrap">
          <div className="mb-8">
            <div className="kicker">
              <SparklesIcon className="h-4 w-4" />
              Welcome Back
            </div>
            <h2 className="mt-6 text-4xl font-bold text-white">Sign in to StreamBridge</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-300/[0.72]">
              Return to your provider workspace, catalog browser, and personal addon settings.
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
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="field-label mb-0">Password</label>
                <Link to="/forgot-password" className="text-xs font-semibold text-brand-300 transition-colors hover:text-brand-200">
                  Reset password
                </Link>
              </div>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="field-input"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? 'Signing in...' : 'Sign In'}
              {!loading && <ArrowRightIcon className="h-4 w-4" />}
            </button>
          </form>

          <div className="mt-8 border-t border-white/10 pt-6 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-100">
              <ShieldCheckIcon className="h-4 w-4" />
              Session and provider data stay scoped to your account
            </div>
            <p className="text-sm text-slate-300/70">
              Don't have an account?{' '}
              <Link to="/signup" className="font-semibold text-brand-300 transition-colors hover:text-brand-200">
                Create one
              </Link>
            </p>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
