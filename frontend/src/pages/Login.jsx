import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import AuthShowcase from '../components/AuthShowcase';
import BrandMark from '../components/BrandMark';

const trustPoints = [
  'Your addon URL stays account-scoped and reinstallable',
  'Provider health, expiry, and catalog repair return in one view',
  'No reconfiguration maze before you get back to playback',
];

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
          eyebrow="Return To Your Workspace"
          title="Get back to the one place that keeps providers, matching, and addon delivery under control."
          body="The login page should reduce hesitation. StreamBridge brings users back to a private workspace where source health, account expiry, catalog cleanup, and Stremio install all stay aligned."
          bullets={[
            ['Private install path', 'Re-enter your workspace and reinstall from the same account-scoped addon URL when you need it.'],
            ['Operator visibility', 'Check provider health, route around degraded hosts, and spot expiry risk before playback breaks.'],
            ['Catalog continuity', 'Pick up metadata repair where you left off instead of rebuilding context across separate tools.'],
          ]}
        />

        <div className="auth-form-wrap">
          <div className="mb-6 lg:hidden">
            <BrandMark />
          </div>

          <div className="mb-8">
            <div className="kicker">
              <SparklesIcon className="h-4 w-4" />
              Welcome Back
            </div>
            <h2 className="mt-5 text-[2.15rem] font-bold leading-tight text-white sm:text-[2.75rem]">
              Sign in and get your streaming stack back online fast.
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-6 text-slate-300/[0.74] sm:text-base">
              Access provider routing, metadata repair, Live TV, and your private addon URL without bouncing between separate tools or setup screens.
            </p>
          </div>

          <div className="panel p-5 sm:p-8">
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              {trustPoints.map((point) => (
                <div key={point} className="rounded-[20px] border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                  <CheckCircleIcon className="h-5 w-5 text-brand-300" />
                  <p className="mt-3 text-sm leading-6 text-slate-200/76">{point}</p>
                </div>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <label htmlFor="login-email" className="field-label">Email Address</label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  spellCheck="false"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="field-input"
                />
              </div>

              <div>
                <div className="mb-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <label htmlFor="login-password" className="field-label mb-0">Password</label>
                  <Link to="/forgot-password" className="text-xs font-semibold text-brand-300 hover:text-brand-200">
                    Reset password
                  </Link>
                </div>
                <input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="field-input"
                />
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Signing in\u2026' : 'Enter Workspace'}
                {!loading && <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />}
              </button>
            </form>

            <div className="mt-8 border-t border-white/10 pt-6">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-100">
                <ShieldCheckIcon className="h-4 w-4" />
                Secure sign-in for your providers, addon endpoint, and account data
              </div>
              <p className="text-sm text-slate-300/70">
                New to StreamBridge?{' '}
                <Link to="/signup" className="font-semibold text-brand-300 transition-colors hover:text-brand-200">
                  Create your account
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
