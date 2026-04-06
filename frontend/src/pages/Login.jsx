import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { reportableError } from '../utils/reportableToast';
import { useAuth } from '../context/AuthContext';
import { ModernStunningSignIn } from '../components/ui/modern-stunning-sign-in';
import Seo from '../components/Seo';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const logo = useMemo(() => (
    <div className="relative flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.04] shadow-[0_18px_45px_rgba(8,16,31,0.38)]">
      <div className="absolute inset-[5px] rounded-[14px] bg-gradient-to-br from-brand-400/30 via-cyan-200/10 to-white/[0.02]" />
      <div className="relative h-5 w-5 rounded-full border border-white/35">
        <div className="absolute left-1/2 top-[-1px] h-[calc(100%+2px)] w-[2px] -translate-x-1/2 bg-white/70" />
        <div className="absolute left-[-1px] top-1/2 h-[2px] w-[calc(100%+2px)] -translate-y-1/2 bg-white/70" />
      </div>
    </div>
  ), []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err) {
      const nextError = err.response?.data?.error || 'Login failed';
      setError(nextError);
      reportableError(nextError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Seo
        title="Sign In | StreamBridge"
        description="Sign in to your StreamBridge workspace to manage providers, addon installs, routing health, and metadata repair."
        path="/login"
        robots="noindex, nofollow"
      />
      <ModernStunningSignIn
        brandName="StreamBridge"
        logo={logo}
        title="Sign in"
        subtitle=""
        identifierMode="email"
        identifierValue={form.email}
        passwordValue={form.password}
        onIdentifierChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
        onPasswordChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
        onSubmit={handleSubmit}
        loading={loading}
        loadingLabel="Signing in..."
        error={error}
        footer={(
          <div className="flex items-center justify-between gap-3 text-sm text-slate-300/65">
            <Link to="/forgot-password" className="transition-colors hover:text-white">
              Forgot password?
            </Link>
            <Link to="/signup" className="font-semibold text-white transition-colors hover:text-brand-100">
              Create account
            </Link>
          </div>
        )}
      />
    </>
  );
}
