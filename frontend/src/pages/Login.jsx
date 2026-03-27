import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, ArrowRight, Shield, Zap, Tv2, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import BrandMark from '../components/BrandMark';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

const features = [
  {
    icon: Shield,
    title: 'Private addon endpoint',
    desc: 'Your account-scoped URL stays available and reinstallable anytime.',
  },
  {
    icon: Zap,
    title: 'Provider health at a glance',
    desc: 'Expiry, host failover, and catalog repair — all in one workspace.',
  },
  {
    icon: Tv2,
    title: 'Back to playback fast',
    desc: 'No reconfiguration maze. Pick up exactly where you left off.',
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  }),
};

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
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

        {/* ── Left panel ── */}
        <div className="auth-side">
          {/* Ambient orbs */}
          <div className="ambient-orb left-[-4rem] top-16 h-56 w-56 bg-brand-400/25" />
          <div className="ambient-orb bottom-20 right-[-4rem] h-64 w-64 bg-cyan-400/15 [animation-delay:3s]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-surface-950/80 to-transparent" />

          <div className="relative z-10 flex h-full flex-col">
            <BrandMark />

            <div className="mt-auto pb-4 pt-16">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/20 bg-brand-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-300" />
                  Returning workspace
                </span>
              </motion.div>

              <motion.h2
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                custom={1}
                className="mt-6 text-4xl font-bold leading-[1.08] text-white lg:text-5xl"
              >
                Your streaming stack,<br />back online fast.
              </motion.h2>

              <motion.p
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                custom={2}
                className="mt-4 max-w-sm text-base leading-7 text-slate-300/70"
              >
                Provider routing, metadata repair, Live TV, and your private addon URL — all from one workspace.
              </motion.p>

              <div className="mt-10 grid gap-3">
                {features.map(({ icon: Icon, title, desc }, i) => (
                  <motion.div
                    key={title}
                    variants={fadeUp}
                    initial="hidden"
                    animate="visible"
                    custom={i + 3}
                    className="flex items-start gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-4 backdrop-blur-sm"
                  >
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05]">
                      <Icon className="h-4 w-4 text-brand-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-300/60">{desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: form ── */}
        <div className="auth-form-wrap flex flex-col justify-center">
          <div className="mb-6 lg:hidden">
            <BrandMark />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Heading */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-white sm:text-4xl">Welcome back</h1>
              <p className="mt-2 text-sm text-slate-300/65">
                Sign in to access your workspace.
              </p>
            </div>

            {/* Form card */}
            <div className="panel p-6 sm:p-8">
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email address</Label>
                  <Input
                    id="login-email"
                    type="email"
                    required
                    autoComplete="email"
                    spellCheck="false"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password">Password</Label>
                    <Link
                      to="/forgot-password"
                      className="text-xs font-medium text-brand-300 hover:text-brand-200 transition-colors"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      className="pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400/60 hover:text-slate-300 transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full"
                  size="lg"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Signing in…
                    </span>
                  ) : (
                    <>
                      Enter Workspace
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              {/* Divider */}
              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/[0.08]" />
                <span className="text-xs text-slate-400/50 font-medium">SECURE</span>
                <div className="h-px flex-1 bg-white/[0.08]" />
              </div>

              {/* Security note */}
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.07] px-4 py-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
                <p className="text-xs leading-5 text-emerald-100/80">
                  End-to-end encrypted sign-in for your providers, addon endpoint, and account data.
                </p>
              </div>
            </div>

            {/* Footer link */}
            <p className="mt-6 text-center text-sm text-slate-300/55">
              New to StreamBridge?{' '}
              <Link to="/signup" className="font-semibold text-brand-300 hover:text-brand-200 transition-colors">
                Create a free account
              </Link>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
