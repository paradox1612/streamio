import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { providerAPI } from '../utils/api';
import { PENDING_PROVIDER_KEY } from '../components/ProviderPreviewWidget';
import { AuthComponent } from '../components/ui/sign-up';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '', fullName: '' });
  const [isChecked, setIsChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const logo = (
    <div className="relative flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.04] shadow-[0_18px_45px_rgba(8,16,31,0.38)]">
      <div className="absolute inset-[5px] rounded-[14px] bg-gradient-to-br from-brand-400/30 via-cyan-200/10 to-white/[0.02]" />
      <div className="relative h-5 w-5 rounded-full border border-white/35">
        <div className="absolute left-1/2 top-[-1px] h-[calc(100%+2px)] w-[2px] -translate-x-1/2 bg-white/70" />
        <div className="absolute left-[-1px] top-1/2 h-[2px] w-[calc(100%+2px)] -translate-y-1/2 bg-white/70" />
      </div>
    </div>
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password || !form.confirmPassword) {
      const nextError = 'Email, password, and confirmation are required';
      setError(nextError);
      return toast.error(nextError);
    }
    if (form.password !== form.confirmPassword) {
      const nextError = 'Passwords do not match';
      setError(nextError);
      return toast.error(nextError);
    }
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters');
    setError('');
    setLoading(true);
    try {
      await signup(form.email, form.password);

      // Auto-connect provider if the user came from the landing page preview widget
      let providerConnected = false;
      try {
        const raw = sessionStorage.getItem(PENDING_PROVIDER_KEY);
        if (raw) {
          const pending = JSON.parse(raw);
          sessionStorage.removeItem(PENDING_PROVIDER_KEY);
          await providerAPI.create({
            name: pending.name || 'My Provider',
            hosts: [pending.host],
            username: pending.username,
            password: pending.password,
          });
          providerConnected = true;
        }
      } catch (_) {
        // Provider auto-connect failed — not fatal, user can add it manually
      }

      if (providerConnected) {
        toast.success('Account created and provider connected!');
      } else {
        toast.success('Account created! Welcome aboard');
      }
      navigate('/dashboard');
    } catch (err) {
      const nextError = err.response?.data?.error || 'Signup failed';
      setError(nextError);
      toast.error(nextError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthComponent
      logo={logo}
      brandName="StreamBridge"
      fullName={form.fullName}
      email={form.email}
      password={form.password}
      confirmPassword={form.confirmPassword}
      acceptTerms={isChecked}
      onFullNameChange={(e) => setForm((current) => ({ ...current, fullName: e.target.value }))}
      onEmailChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
      onPasswordChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
      onConfirmPasswordChange={(e) => setForm((current) => ({ ...current, confirmPassword: e.target.value }))}
      onAcceptTermsChange={(e) => setIsChecked(e.target.checked)}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
      footer={(
        <p className="text-sm text-slate-300/65">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-white transition-colors hover:text-brand-100">
            Sign in
          </Link>
          .
        </p>
      )}
    />
  );
}
