import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRightIcon, CheckCircleIcon, SparklesIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import AuthShowcase from '../components/AuthShowcase';
import BrandMark from '../components/BrandMark';

const benefits = [
  'Create your private addon URL',
  'Add providers right after signup',
  'Fix metadata from one poster-first workspace',
];

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
      toast.success('Account created! Welcome to StreamBridge');
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
        <AuthShowcase
          eyebrow="Fastest Path To Value"
          title="Create the account now, add providers next, and install one private addon URL."
          body="Signup should take less than a minute. The real setup happens after this step, so the form stays short and the payoff stays clear."
          bullets={[
            ['One account, one addon route', 'Every provider you add later flows through the same account-scoped endpoint.'],
            ['Provider control after signup', 'Credentials, host failover, and refresh tools all live in the product, not in setup email chains.'],
            ['Ready for mobile and desktop', 'Use the same workspace to manage catalog health wherever you are.'],
          ]}
        />

        <div className="auth-form-wrap">
          <div className="mb-8 lg:hidden">
            <BrandMark />
          </div>

          <div className="mb-8">
            <div className="kicker">
              <SparklesIcon className="h-4 w-4" />
              New Account
            </div>
            <h2 className="mt-6 text-3xl font-bold text-white sm:text-4xl">Create your workspace</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-300/[0.72]">
              Start with your account now. Provider credentials and addon setup happen right after sign up.
            </p>
          </div>

          <div className="panel p-5 sm:p-8">
            <div className="mb-5 rounded-[24px] border border-brand-300/15 bg-brand-400/8 p-4">
              <p className="text-sm font-semibold text-white">What you unlock immediately</p>
              <div className="mt-3 grid gap-3">
                {benefits.map((benefit) => (
                  <div key={benefit} className="flex items-start gap-3 text-sm text-slate-100/84">
                    <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-300" />
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

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
                  placeholder="Minimum 8 characters"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="field-input"
                />
                <p className="mt-2 text-xs text-slate-300/55">Use at least 8 characters. You can change it later in Account settings.</p>
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

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Creating account...' : 'Create Free Account'}
                {!loading && <ArrowRightIcon className="h-4 w-4" />}
              </button>
            </form>

            <div className="mt-8 border-t border-white/10 pt-6">
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
