import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRightIcon, ShieldCheckIcon, SparklesIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import AuthShowcase from '../components/AuthShowcase';
import BrandMark from '../components/BrandMark';

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
        <AuthShowcase
          eyebrow="Workspace Access"
          title="Pick up right where your providers, matching, and addon setup left off."
          body="Everything operational stays in one workspace. Sign in to monitor providers, install your addon, and fix the catalog without context switching."
          bullets={[
            ['Live health and failover', 'Keep the active host visible and react quickly when a provider degrades.'],
            ['Private addon delivery', 'Your account-scoped install URL stays ready whenever you need to reinstall Stremio.'],
            ['Metadata confidence', 'Browse posters first, then repair only the titles that still need intervention.'],
          ]}
        />

        <div className="auth-form-wrap">
          <div className="mb-6 lg:hidden">
            <BrandMark />
          </div>

          <div className="mb-6 sm:mb-8">
            <div className="kicker">
              <SparklesIcon className="h-4 w-4" />
              Welcome Back
            </div>
            <h2 className="mt-5 text-[2rem] font-bold leading-tight text-white sm:mt-6 sm:text-4xl">Sign in to StreamBridge</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-300/[0.72]">
              Return to your provider workspace, VOD browser, Live TV filters, and personal addon controls.
            </p>
          </div>

          <div className="panel p-5 sm:p-8">
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
                <div className="mb-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
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

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Signing in...' : 'Sign In'}
                {!loading && <ArrowRightIcon className="h-4 w-4" />}
              </button>
            </form>

            <div className="mt-8 border-t border-white/10 pt-6">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-100">
                <ShieldCheckIcon className="h-4 w-4" />
                Account, providers, and addon URL stay scoped to you
              </div>
              <p className="text-sm text-slate-300/70">
                Don&apos;t have an account?{' '}
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
