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

const pillars = [
  {
    title: 'Multi-provider routing',
    copy: 'Keep several Xtream sources under one account and switch between healthy hosts without reconfiguring Stremio.',
    icon: ServerStackIcon,
  },
  {
    title: 'Metadata that stays usable',
    copy: 'Posters, TMDB matching, and manual correction live in the same workspace instead of scattered tools.',
    icon: FilmIcon,
  },
  {
    title: 'Private account delivery',
    copy: 'Each account gets one private addon URL, ready to install and easy to rotate if it ever leaks.',
    icon: ShieldCheckIcon,
  },
];

const proofPoints = [
  'Private addon URL per account',
  'Host failover and health rechecks',
  'Live TV, VOD, and matching in one workspace',
  'No separate addon config per provider',
];

export default function Landing() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="marketing-shell min-h-screen">
      <div className="marketing-chrome">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-surface-950/70 backdrop-blur-2xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <BrandMark compact />
            <div className="flex items-center gap-2 sm:gap-3">
              <Link to="/login" className="btn-secondary !px-4 !py-2.5 sm:!px-5">
                Sign In
              </Link>
              <Link to="/signup" className="btn-primary !px-4 !py-2.5 sm:!px-5">
                Start Free
              </Link>
            </div>
          </div>
        </header>

        <main>
          <section className="relative overflow-hidden border-b border-white/10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(20,145,255,0.18),transparent_30%),linear-gradient(180deg,rgba(6,11,22,0.28),rgba(5,8,22,0.96))]" />
            <div className="relative mx-auto grid min-h-[calc(100svh-73px)] max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8 lg:py-20">
              <div className="max-w-xl">
                <div className="kicker mb-6">
                  <BoltIcon className="h-4 w-4" />
                  One bridge from IPTV to Stremio
                </div>
                <h1 className="text-4xl font-bold leading-[0.95] text-white sm:text-5xl lg:text-7xl">
                  StreamBridge keeps your streaming setup clear, private, and installable.
                </h1>
                <p className="mt-6 max-w-lg text-base leading-7 text-slate-200/72 sm:text-lg">
                  Connect providers once, keep metadata readable, and install a single private addon URL instead of juggling multiple brittle setups.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link to="/signup" className="btn-primary !justify-between sm:!justify-center">
                    Create Free Account
                    <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                  <Link to="/login" className="btn-secondary">
                    I already have an account
                  </Link>
                </div>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {proofPoints.map((point) => (
                    <div key={point} className="flex items-start gap-3 rounded-[20px] border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                      <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-300" />
                      <span className="text-sm leading-6 text-slate-100/88">{point}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative">
                <div className="panel mx-auto max-w-2xl overflow-hidden p-4 sm:p-5">
                  <div className="rounded-[26px] border border-white/10 bg-surface-950/85 p-4 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                      <div>
                        <p className="metric-label mb-1">Personal Addon</p>
                        <h2 className="text-2xl font-bold text-white">Install-ready endpoint</h2>
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-100">
                        <span className="h-2 w-2 rounded-full bg-emerald-300" />
                        Active
                      </div>
                    </div>

                    <div className="mt-5 rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4">
                      <p className="metric-label mb-2">Private URL</p>
                      <div className="overflow-x-auto font-mono text-xs leading-6 text-brand-100/85 sm:text-sm">
                        https://streambridge.app/addon/<span className="text-brand-300">acc_x2f9c4f1</span>/manifest.json
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 sm:grid-cols-3">
                      <div className="panel-soft p-4">
                        <p className="metric-label mb-2">Providers</p>
                        <p className="text-3xl font-bold text-white">3</p>
                        <p className="mt-2 text-sm text-slate-300/65">Healthy sources available.</p>
                      </div>
                      <div className="panel-soft p-4">
                        <p className="metric-label mb-2">Match Rate</p>
                        <p className="text-3xl font-bold text-white">91%</p>
                        <p className="mt-2 text-sm text-slate-300/65">Metadata corrected and ready.</p>
                      </div>
                      <div className="panel-soft p-4">
                        <p className="metric-label mb-2">Failover</p>
                        <p className="text-3xl font-bold text-white">Auto</p>
                        <p className="mt-2 text-sm text-slate-300/65">Switches to the next host.</p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3">
                      <div className="flex items-center justify-between rounded-[20px] border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-white">Northstream</p>
                          <p className="text-xs text-slate-300/55">Healthy host selected</p>
                        </div>
                        <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-100">online</span>
                      </div>
                      <div className="flex items-center justify-between rounded-[20px] border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-white">CinemaVault</p>
                          <p className="text-xs text-slate-300/55">57,481 matched titles</p>
                        </div>
                        <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-medium text-slate-100">94%</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="pointer-events-none absolute -bottom-8 left-10 right-10 h-24 rounded-full bg-brand-400/20 blur-3xl" />
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="mb-10 max-w-2xl">
              <p className="eyebrow mb-3">Why it feels better</p>
              <h2 className="text-3xl font-bold text-white sm:text-4xl">One system for setup, maintenance, and day-to-day use.</h2>
              <p className="mt-4 text-base leading-7 text-slate-300/72">
                StreamBridge is strongest when it removes repeated setup work. The app keeps routing, health, metadata, and install flow in the same place.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {pillars.map(({ title, copy, icon: Icon }) => (
                <div key={title} className="panel-soft p-6 sm:p-7">
                  <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.04]">
                    <Icon className="h-5 w-5 text-brand-300" />
                  </div>
                  <h3 className="mt-6 text-2xl font-bold text-white">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-300/72">{copy}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="border-y border-white/10 bg-white/[0.02]">
            <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8">
              <div>
                <p className="eyebrow mb-3">Start here</p>
                <h2 className="text-3xl font-bold text-white sm:text-4xl">Create the account first. Add providers right after.</h2>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300/72">
                  The fastest path is account, provider credentials, then one install-ready addon URL. No complex onboarding wizard is required to get value.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link to="/signup" className="btn-primary">
                  Create Account
                </Link>
                <Link to="/login" className="btn-secondary">
                  Sign In
                </Link>
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-slate-400/75 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <span>StreamBridge</span>
            <span>Private Stremio addon delivery for IPTV accounts</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
