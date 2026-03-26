import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { authAPI } from '../utils/api';
import BrandMark from '../components/BrandMark';

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
    <div className="auth-shell">
      <div className="w-full max-w-lg">
        <div className="panel p-5 sm:p-8">
          <BrandMark />
          <div className="mb-7 mt-6 sm:mb-8 sm:mt-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.04] sm:h-16 sm:w-16 sm:rounded-[22px]">
              <EnvelopeIcon className="h-8 w-8 text-brand-300" />
            </div>
            <h1 className="mt-5 text-center text-[2rem] font-bold leading-tight text-white sm:mt-6 sm:text-3xl">Reset your password</h1>
            <p className="mt-3 text-center text-sm leading-6 text-slate-300/[0.72]">
              Enter your account email and we&apos;ll send reset instructions if it exists in the system.
            </p>
          </div>

          {sent ? (
            <div className="text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-100">
                Link requested
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-300/[0.72]">
                If that email exists in our system, a reset link has been sent.
              </p>
              <Link to="/login" className="btn-secondary mt-8 w-full sm:w-auto">
                <ArrowLeftIcon className="h-4 w-4" />
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="field-label">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="field-input"
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <div className="text-center">
                <Link to="/login" className="text-sm font-semibold text-slate-300/[0.68] transition-colors hover:text-white">
                  <ArrowLeftIcon className="mr-1 inline h-4 w-4" />
                  Back to login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
