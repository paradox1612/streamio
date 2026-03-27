import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, ArrowRight, Link2, Activity, LayoutDashboard, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import BrandMark from '../components/BrandMark';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

const perks = [
  {
    icon: Link2,
    title: 'One private addon URL',
    desc: 'Every provider flows through a single account-scoped endpoint.',
  },
  {
    icon: Activity,
    title: 'Provider control after signup',
    desc: 'Credentials, failover, and refresh tools live in the product — not in setup emails.',
  },
  {
    icon: LayoutDashboard,
    title: 'Ready on any device',
    desc: 'Manage catalog health and routing from the same workspace anywhere.',
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

function PasswordStrength({ password }) {
  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  if (!password) return null;

  const colors = ['bg-red-500', 'bg-orange-400', 'bg-amber-400', 'bg-emerald-400'];
  const labels = ['Weak', 'Fair', 'Good', 'Strong'];

  return (
    <div className="mt-2">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i < score ? colors[score - 1] : 'bg-white/10'
            }`}
          />
        ))}
      </div>
      <p className={`mt-1.5 text-xs font-medium ${score > 0 ? 'text-slate-300/70' : ''}`}>
        {password ? labels[score - 1] || 'Weak' : ''}
      </p>
    </div>
  );
}

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return toast.error('Passwords do not match');
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters');
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

        {/* ── Left panel ── */}
        <div className="auth-side">
          <div className="ambient-orb left-[-4rem] top-20 h-56 w-56 bg-cyan-400/20" />
          <div className="ambient-orb bottom-16 right-[-4rem] h-64 w-64 bg-brand-400/20 [animation-delay:3s]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-surface-950/80 to-transparent" />

          <div className="relative z-10 flex h-full flex-col">
            <BrandMark />

            <div className="mt-auto pb-4 pt-16">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  Get started free
                </span>
              </motion.div>

              <motion.h2
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                custom={1}
                className="mt-6 text-4xl font-bold leading-[1.08] text-white lg:text-5xl"
              >
                One account.<br />One clean setup.
              </motion.h2>

              <motion.p
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                custom={2}
                className="mt-4 max-w-sm text-base leading-7 text-slate-300/70"
              >
                Sign up takes under a minute. Provider credentials and addon setup happen right after.
              </motion.p>

              <div className="mt-10 grid gap-3">
                {perks.map(({ icon: Icon, title, desc }, i) => (
                  <motion.div
                    key={title}
                    variants={fadeUp}
                    initial="hidden"
                    animate="visible"
                    custom={i + 3}
                    className="flex items-start gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-4 backdrop-blur-sm"
                  >
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05]">
                      <Icon className="h-4 w-4 text-cyan-300" />
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
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-white sm:text-4xl">Create your workspace</h1>
              <p className="mt-2 text-sm text-slate-300/65">
                Start free. No credit card required.
              </p>
            </div>

            <div className="panel p-6 sm:p-8">
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>

                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email address</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    required
                    autoComplete="email"
                    spellCheck="false"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      placeholder="Min. 8 characters"
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
                  <PasswordStrength password={form.password} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-confirm">Confirm password</Label>
                  <div className="relative">
                    <Input
                      id="signup-confirm"
                      type={showConfirm ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      placeholder="Repeat password"
                      value={form.confirm}
                      onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                      className={`pr-11 ${
                        form.confirm && form.confirm !== form.password
                          ? 'border-red-400/40 focus:border-red-400/60 focus:shadow-[0_0_0_3px_rgba(248,113,113,0.12)]'
                          : form.confirm && form.confirm === form.password
                          ? 'border-emerald-400/40'
                          : ''
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400/60 hover:text-slate-300 transition-colors"
                      aria-label={showConfirm ? 'Hide password' : 'Show password'}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {form.confirm && form.confirm !== form.password && (
                    <p className="text-xs text-red-400">Passwords don't match</p>
                  )}
                </div>

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
                      Creating account…
                    </span>
                  ) : (
                    <>
                      Create Free Account
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/[0.08]" />
                <span className="text-xs text-slate-400/50 font-medium">WHAT YOU UNLOCK</span>
                <div className="h-px flex-1 bg-white/[0.08]" />
              </div>

              <div className="grid gap-2">
                {['Private addon URL created instantly', 'Add providers right after signup', 'Metadata repair from one poster-first workspace'].map(item => (
                  <div key={item} className="flex items-center gap-2.5 text-xs text-slate-300/70">
                    <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-6 text-center text-sm text-slate-300/55">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-brand-300 hover:text-brand-200 transition-colors">
                Sign in
              </Link>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
