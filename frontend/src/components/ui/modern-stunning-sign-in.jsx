import * as React from 'react';
import { Eye, EyeOff, Loader2, Lock, Mail, Shield, User2 } from 'lucide-react';
import { cn } from '../../lib/utils';

function AuthOrb({ className }) {
  return <div className={cn('absolute rounded-full blur-3xl', className)} aria-hidden="true" />;
}

function DefaultMark() {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-[0_18px_45px_rgba(8,16,31,0.38)]">
      <div className="absolute inset-[6px] rounded-[14px] bg-gradient-to-br from-brand-400/30 via-cyan-200/10 to-white/[0.02]" />
      <div className="relative h-5 w-5 rounded-full border border-white/35">
        <div className="absolute left-1/2 top-[-1px] h-[calc(100%+2px)] w-[2px] -translate-x-1/2 bg-white/70" />
        <div className="absolute left-[-1px] top-1/2 h-[2px] w-[calc(100%+2px)] -translate-y-1/2 bg-white/70" />
      </div>
    </div>
  );
}

function Field({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  icon,
  error,
}) {
  const [revealed, setRevealed] = React.useState(false);
  const Icon = icon;
  const isPassword = type === 'password';

  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-300/62">
        {label}
      </span>
      <div className={cn('auth-field', error && 'auth-field-error')}>
        <span className="auth-field-icon">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <input
          type={isPassword && revealed ? 'text' : type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="auth-input"
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            className="auth-field-toggle"
            aria-label={revealed ? 'Hide password' : 'Show password'}
          >
            {revealed ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
          </button>
        ) : null}
      </div>
    </label>
  );
}

const IDENTIFIER_MODES = {
  email: {
    label: 'Email',
    placeholder: 'name@example.com',
    autoComplete: 'email',
    type: 'email',
    icon: Mail,
  },
  username: {
    label: 'Username',
    placeholder: 'admin username',
    autoComplete: 'username',
    type: 'text',
    icon: User2,
  },
};

function ModernStunningSignIn({
  brandName = 'StreamBridge',
  logo,
  title = 'Welcome back',
  subtitle = 'Enter your credentials to continue.',
  identifierMode = 'email',
  identifierValue,
  passwordValue,
  onIdentifierChange,
  onPasswordChange,
  onSubmit,
  submitLabel = 'Sign In',
  loadingLabel = 'Signing in...',
  loading = false,
  error = '',
  footer,
  asideTitle = 'One private media bridge, minus the brittle setup.',
  asideCopy = 'Keep provider access, addon delivery, and recovery paths in one dependable workspace.',
  asidePoints = [
    'Private addon URL tied to your account',
    'Provider health and expiry visibility',
    'Catalog repair without leaving the app',
  ],
  badge = 'Secure sign-in',
}) {
  const identifierConfig = IDENTIFIER_MODES[identifierMode] || IDENTIFIER_MODES.email;

  return (
    <div className="relative isolate flex min-h-screen w-full overflow-hidden bg-[#050816] text-white">
      <AuthOrb className="left-[-8rem] top-[-5rem] h-72 w-72 bg-brand-500/18" />
      <AuthOrb className="right-[-7rem] top-1/3 h-80 w-80 bg-cyan-400/16" />
      <AuthOrb className="bottom-[-8rem] left-1/3 h-96 w-96 bg-sky-300/10" />

      <div className="relative z-10 grid min-h-screen w-full lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden border-r border-white/[0.08] lg:flex lg:flex-col lg:justify-between">
          <div className="p-8">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 shadow-[0_18px_44px_rgba(0,0,0,0.22)]">
              {logo || <DefaultMark />}
              <span className="text-sm font-semibold text-slate-100">{brandName}</span>
            </div>
          </div>

          <div className="px-8 pb-10">
            <div className="max-w-xl rounded-[36px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(18,28,49,0.76),rgba(7,14,28,0.72))] p-8 shadow-[0_30px_90px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-brand-200/72">{badge}</p>
              <h1 className="mt-5 max-w-[12ch] text-5xl font-bold leading-[1.02] text-white">
                {asideTitle}
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-slate-300/68">{asideCopy}</p>
              <div className="mt-8 space-y-3">
                {asidePoints.map((point) => (
                  <div
                    key={point}
                    className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-sm text-slate-100/88"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-400/20 bg-brand-500/10 text-brand-200">
                      <Shield className="h-4 w-4" />
                    </span>
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-4 py-8 sm:px-6 lg:px-10">
          <div className="w-full max-w-md rounded-[34px] border border-white/[0.1] bg-[linear-gradient(180deg,rgba(18,28,49,0.9),rgba(8,16,31,0.82))] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:p-8">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              {logo || <DefaultMark />}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-200/72">{badge}</p>
                <h2 className="text-base font-bold text-white">{brandName}</h2>
              </div>
            </div>

            <div className="mb-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-200/72">{badge}</p>
              <h2 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-white">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300/65">{subtitle}</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-5">
              <Field
                label={identifierConfig.label}
                type={identifierConfig.type}
                value={identifierValue}
                onChange={onIdentifierChange}
                placeholder={identifierConfig.placeholder}
                autoComplete={identifierConfig.autoComplete}
                icon={identifierConfig.icon}
                error={error}
              />
              <Field
                label="Password"
                type="password"
                value={passwordValue}
                onChange={onPasswordChange}
                placeholder="Enter your password"
                autoComplete={identifierMode === 'username' ? 'current-password' : 'current-password'}
                icon={Lock}
                error={error}
              />

              {error ? (
                <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-500 via-brand-400 to-cyan-300 px-5 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_20px_50px_rgba(20,145,255,0.35)] transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : null}
                {loading ? loadingLabel : submitLabel}
              </button>
            </form>

            {footer ? <div className="mt-6 border-t border-white/[0.08] pt-5">{footer}</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

const SignIn1 = ModernStunningSignIn;

export { ModernStunningSignIn, SignIn1 };
