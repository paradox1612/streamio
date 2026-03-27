import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  ArrowRightIcon,
  BoltIcon,
  CheckCircleIcon,
  FilmIcon,
  ServerStackIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import BrandMark from '../components/BrandMark';

const proofPoints = [
  'Switch providers without rebuilding the addon config',
  'Keep provider health and expiry visible in one workspace',
  'Repair metadata where it matters instead of across multiple tools',
];

const pillars = [
  {
    title: 'Route several IPTV sources through one install flow',
    copy: 'Add providers once, keep them health-checked, and stop rebuilding Stremio every time a host changes.',
    icon: ServerStackIcon,
  },
  {
    title: 'Keep posters and titles usable without side tools',
    copy: 'Matching, TMDB enrichment, and manual correction stay close to the catalog instead of becoming another workflow.',
    icon: FilmIcon,
  },
  {
    title: 'Deliver a private endpoint that feels production-ready',
    copy: 'Every account keeps a scoped install URL that is simple to reinstall, rotate, and trust.',
    icon: ShieldCheckIcon,
  },
];

const workflow = [
  ['Create your account', 'Start with one workspace built for your own provider stack.'],
  ['Connect providers', 'Bring in credentials once and let StreamBridge monitor host health.'],
  ['Install one addon', 'Use a single private URL in Stremio instead of juggling separate configs.'],
];

export default function Landing() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="marketing-shell min-h-screen">
      <div className="marketing-chrome">

        {/* ── Nav ── */}
        <header className="sticky top-0 z-30 border-b border-white/10 bg-surface-950/70 backdrop-blur-2xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
            <BrandMark compact />
            <nav className="flex items-center gap-2 sm:gap-3" aria-label="Main navigation">
              <Link to="/login" className="btn-secondary !px-4 !py-2">
                Sign In
              </Link>
              <Link to="/signup" className="btn-primary !px-4 !py-2 sm:!px-5">
                Start Free
              </Link>
            </nav>
          </div>
        </header>

        <main>
          {/* ── Hero ── */}
          <section className="relative overflow-hidden border-b border-white/10" aria-label="Hero">
            {/* Ambient orbs */}
            <div className="ambient-orb left-[-8rem] top-[10rem] h-72 w-72 bg-cyan-300/20" aria-hidden="true" />
            <div className="ambient-orb right-[-6rem] top-[4rem] h-96 w-96 bg-brand-400/18 [animation-delay:2s]" aria-hidden="true" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,8,22,0.14),rgba(5,8,22,0.82))]" aria-hidden="true" />

            <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8 lg:py-20 xl:py-24">

              {/* Left: copy */}
              <div className="fade-rise">
                <div className="kicker">
                  <BoltIcon className="h-4 w-4" aria-hidden="true" />
                  IPTV infrastructure, cleaned up for Stremio
                </div>

                <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.26em] text-sky-100/50">
                  StreamBridge
                </p>
                <h1 className="hero-display mt-2">
                  One private bridge for the providers you actually use.
                </h1>
                <p className="hero-support mt-6">
                  StreamBridge turns a messy IPTV setup into one installable, account-scoped Stremio addon with provider routing, health visibility, and metadata repair built in.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link to="/signup" className="btn-primary">
                    Create Free Account
                    <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <Link to="/login" className="btn-secondary">
                    I already have an account
                  </Link>
                </div>

                {/* Proof metrics */}
                <div className="mt-10 flex items-center gap-6 border-t border-white/[0.08] pt-8">
                  {[
                    { value: '1', label: 'Private URL per account' },
                    { value: 'Auto', label: 'Host failover' },
                    { value: '91%', label: 'Catalogs matched' },
                  ].map(({ value, label }) => (
                    <div key={label} className="min-w-0">
                      <p className="text-2xl font-bold text-white" aria-label={`${value}: ${label}`}>{value}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-300/60">{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: app preview card */}
              <div className="fade-rise [animation-delay:0.12s]">
                <div className="panel overflow-hidden p-6 sm:p-8">

                  {/* Endpoint header */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="metric-label mb-2">Private addon endpoint</p>
                      <h2 className="text-2xl font-bold text-white">Install-ready</h2>
                    </div>
                    <span className="metric-chip flex-shrink-0">
                      <span className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
                      Active
                    </span>
                  </div>

                  {/* URL bar */}
                  <div className="mt-5 overflow-x-auto rounded-2xl border border-white/[0.08] bg-surface-950/70 px-4 py-3 font-mono text-xs leading-7 text-brand-100/80 sm:text-sm">
                    https://streambridge.app/addon/<wbr />
                    <span className="text-brand-300">acc_x2f9c4f1</span>/manifest.json
                  </div>

                  {/* Feature list */}
                  <div className="surface-divider mt-6 pt-6">
                    <p className="metric-label mb-4">Why operators keep this open</p>
                    <ul className="space-y-3" role="list">
                      {proofPoints.map((point) => (
                        <li key={point} className="flex items-start gap-3 text-sm leading-6 text-slate-200/78">
                          <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-300" aria-hidden="true" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* At-a-glance stats */}
                  <div className="surface-divider mt-6 pt-6">
                    <div className="grid grid-cols-3 divide-x divide-white/[0.06]">
                      {[
                        { value: '3', label: 'Sources', tone: 'text-white' },
                        { value: '57K', label: 'Titles', tone: 'text-white' },
                        { value: 'Online', label: 'Routing', tone: 'text-emerald-300' },
                      ].map(({ value, label, tone }) => (
                        <div key={label} className="px-4 text-center first:pl-0 last:pr-0">
                          <p className={`text-xl font-bold ${tone}`}>{value}</p>
                          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300/55">{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Pillars ── */}
          <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24" aria-label="Features">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow mb-3">Built for operators</p>
              <h2 className="text-3xl font-bold text-white sm:text-4xl">
                The value is obvious in under a minute.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-300/70">
                Users do not need a long onboarding sequence. They need routing, repair, and install in the same place.
              </p>
            </div>

            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {pillars.map(({ title, copy, icon: Icon }) => (
                <div key={title} className="panel-soft p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.04]">
                    <Icon className="h-5 w-5 text-brand-300" aria-hidden="true" />
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-white">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-300/70">{copy}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── How it works ── */}
          <section className="border-y border-white/10 bg-white/[0.015]" aria-label="How it works">
            <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:grid lg:grid-cols-[0.75fr_1.25fr] lg:gap-16 lg:px-8 lg:py-24">
              <div>
                <p className="eyebrow mb-3">Three steps</p>
                <h2 className="text-3xl font-bold text-white sm:text-4xl">
                  Fast path from signup to playback.
                </h2>
                <p className="mt-4 text-base leading-7 text-slate-300/70">
                  Get access, connect sources, install once.
                </p>
              </div>

              <ol className="mt-10 grid gap-4 lg:mt-0" role="list">
                {workflow.map(([title, copy], index) => (
                  <li
                    key={title}
                    className="grid gap-4 rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-5 sm:grid-cols-[auto_1fr] sm:items-start sm:p-6"
                  >
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm font-bold text-white"
                      aria-hidden="true"
                    >
                      0{index + 1}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300/70">{copy}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* ── CTA ── */}
          <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24" aria-label="Call to action">
            <div className="panel overflow-hidden p-8 sm:p-10 lg:p-12">
              <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <p className="eyebrow mb-3">Start now</p>
                  <h2 className="text-3xl font-bold text-white sm:text-4xl">
                    Create the account, bring in providers, and ship one cleaner setup.
                  </h2>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300/70">
                    StreamBridge is strongest when the first session ends with a working addon URL.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
                  <Link to="/signup" className="btn-primary">
                    Start Free
                    <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <Link to="/login" className="btn-secondary">
                    Sign In
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-slate-400/70 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <span>StreamBridge</span>
            <span>Private Stremio addon delivery for real IPTV accounts</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
