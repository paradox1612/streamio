import React from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, Shield, User2 } from 'lucide-react';
import { cn } from '../../lib/utils';

function AuthBackdropOrb({ className }) {
  return <div className={cn('absolute rounded-full blur-3xl', className)} aria-hidden="true" />;
}

function StepPill({ active, complete, index, label }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
          complete
            ? 'border-emerald-300/35 bg-emerald-400/15 text-emerald-100'
            : active
              ? 'border-brand-300/35 bg-brand-400/15 text-brand-100'
              : 'border-white/10 bg-white/[0.03] text-slate-400'
        )}
      >
        {complete ? <CheckCircle2 className="h-4.5 w-4.5" /> : index}
      </div>
      <span className={cn('text-sm font-medium', active || complete ? 'text-white' : 'text-slate-400')}>{label}</span>
    </div>
  );
}

function BaseInput({ label, icon: Icon, trailing, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-300/62">
        {label}
      </span>
      <div className="auth-field">
        <span className="auth-field-icon">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <input {...props} className="auth-input" />
        {trailing}
      </div>
    </label>
  );
}

export function AuthComponent({
  logo,
  brandName = 'StreamBridge',
  fullName = '',
  email = '',
  password = '',
  confirmPassword = '',
  acceptTerms = false,
  onFullNameChange,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onAcceptTermsChange,
  onSubmit,
  loading = false,
  error = '',
  title = 'Create your account',
  subtitle = 'Start with secure email and password access. Social login will come later.',
  footer,
  sideLabel = 'New account flow',
}) {
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  const passwordReady = password.length >= 8;
  const confirmReady = confirmPassword.length >= 8 && confirmPassword === password;
  const progress = confirmReady && acceptTerms ? 3 : passwordReady ? 2 : email ? 1 : 0;

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[#050816] text-white">
      <AuthBackdropOrb className="left-[-10rem] top-[-6rem] h-80 w-80 bg-brand-500/18" />
      <AuthBackdropOrb className="right-[-8rem] top-1/4 h-96 w-96 bg-cyan-400/14" />
      <AuthBackdropOrb className="bottom-[-10rem] left-1/4 h-[28rem] w-[28rem] bg-sky-300/10" />

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[0.94fr_1.06fr]">
        <section className="hidden border-r border-white/[0.08] px-8 py-10 lg:flex lg:flex-col lg:justify-between">
          <div className="inline-flex w-fit items-center gap-3 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 shadow-[0_18px_44px_rgba(0,0,0,0.22)]">
            {logo}
            <span className="text-sm font-semibold text-slate-100">{brandName}</span>
          </div>

          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-200/70">{sideLabel}</p>
            <h1 className="mt-5 max-w-[12ch] text-5xl font-bold leading-[1.02] tracking-[-0.04em] text-white">
              Get your private addon workspace online in minutes.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-300/66">
              This flow is intentionally first-party: email, password, provider preview carryover, and a direct handoff into your dashboard once the account is created.
            </p>

            <div className="mt-10 space-y-4">
              <StepPill index={1} label="Identity" active={progress === 0 || progress === 1} complete={progress > 1} />
              <StepPill index={2} label="Security" active={progress === 2} complete={progress > 2} />
              <StepPill index={3} label="Activation" active={progress === 3} complete={progress === 3} />
            </div>
          </div>

          <div className="rounded-[30px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(18,28,49,0.72),rgba(7,14,28,0.68))] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.38)]">
            <p className="text-sm font-semibold text-white">What happens next</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300/66">
              <li className="flex gap-3"><ArrowRight className="mt-1 h-4 w-4 flex-none text-brand-200" /> Your account is created and signed in immediately.</li>
              <li className="flex gap-3"><ArrowRight className="mt-1 h-4 w-4 flex-none text-brand-200" /> Any provider preview from the landing page is connected automatically.</li>
              <li className="flex gap-3"><ArrowRight className="mt-1 h-4 w-4 flex-none text-brand-200" /> You land in the same dashboard styling used across the user workspace.</li>
            </ul>
          </div>
        </section>

        <section className="flex items-center justify-center px-4 py-8 sm:px-6 lg:px-10">
          <div className="w-full max-w-xl rounded-[36px] border border-white/[0.1] bg-[linear-gradient(180deg,rgba(18,28,49,0.92),rgba(8,16,31,0.84))] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:p-8">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              {logo}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-200/72">{sideLabel}</p>
                <h2 className="text-base font-bold text-white">{brandName}</h2>
              </div>
            </div>

            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-200/72">{sideLabel}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-white sm:text-4xl">{title}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300/65">{subtitle}</p>

            <form onSubmit={onSubmit} className="mt-8 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <BaseInput
                  label="Full name"
                  icon={User2}
                  type="text"
                  value={fullName}
                  onChange={onFullNameChange}
                  placeholder="Optional"
                  autoComplete="name"
                />
                <BaseInput
                  label="Email"
                  icon={Mail}
                  type="email"
                  value={email}
                  onChange={onEmailChange}
                  placeholder="name@example.com"
                  autoComplete="email"
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <BaseInput
                  label="Password"
                  icon={Lock}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={onPasswordChange}
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                  trailing={(
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="auth-field-toggle"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                    </button>
                  )}
                />
                <BaseInput
                  label="Confirm password"
                  icon={Shield}
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={onConfirmPasswordChange}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  trailing={(
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((current) => !current)}
                      className="auth-field-toggle"
                      aria-label={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                    </button>
                  )}
                />
              </div>

              <div className="rounded-[26px] border border-white/[0.08] bg-white/[0.03] p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={onAcceptTermsChange}
                    className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent text-brand-500 focus:ring-brand-500/40"
                  />
                  <span className="text-sm leading-6 text-slate-300/66">
                    I agree to the platform terms and I understand that sign-in is currently email/password only.
                  </span>
                </label>
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading || !acceptTerms}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-500 via-brand-400 to-cyan-300 px-5 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_20px_50px_rgba(20,145,255,0.35)] transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <ArrowRight className="h-4.5 w-4.5" />}
                {loading ? 'Creating account...' : 'Create account'}
              </button>
            </form>

            {footer ? <div className="mt-6 border-t border-white/[0.08] pt-5">{footer}</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
