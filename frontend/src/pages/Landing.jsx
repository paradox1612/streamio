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
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <BrandMark compact />
            <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:items-center sm:gap-3">
              <Link to="/login" className="btn-secondary !w-full !px-4 !py-2 sm:!w-auto sm:!px-5 sm:!py-2.5">
                Sign In
              </Link>
              <Link to="/signup" className="btn-primary !w-full !px-4 !py-2 sm:!w-auto sm:!px-5 sm:!py-2.5">
                Start Free
              </Link>
            </div>
          </div>
        </header>

        <main>
          <section className="relative overflow-hidden border-b border-white/10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(20,145,255,0.18),transparent_30%),linear-gradient(180deg,rgba(6,11,22,0.28),rgba(5,8,22,0.96))]" />
            <div className="relative mx-auto grid min-h-[calc(100svh-122px)] max-w-7xl gap-8 px-4 py-6 sm:min-h-[calc(100svh-73px)] sm:px-6 sm:py-16 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8 lg:py-20">
              <div className="max-w-xl lg:order-1">
                <div className="kicker mb-5">
                  <BoltIcon className="h-4 w-4" />
                  One bridge from IPTV to Stremio
                </div>
                <h1 className="max-w-[9ch] text-[2.35rem] font-bold leading-[0.94] tracking-[-0.05em] text-white sm:max-w-none sm:text-5xl lg:text-7xl">
                  <span className="sm:hidden">Your IPTV bridge into Stremio.</span>
                  <span className="hidden sm:inline">StreamBridge keeps your streaming setup clear, private, and installable.</span>
                </h1>
                <p className="mt-4 max-w-md text-[15px] leading-6 text-slate-200/72 sm:text-lg sm:leading-7">
                  <span className="sm:hidden">Add providers once, keep metadata usable, and install one private addon URL.</span>
                  <span className="hidden sm:inline">Connect providers once, keep metadata readable, and install a single private addon URL instead of juggling multiple brittle setups.</span>
                </p>
                <div className="mt-6 grid gap-3 sm:mt-8 sm:flex sm:flex-row">
                  <Link to="/signup" className="btn-primary !w-full !justify-between sm:!w-auto sm:!justify-center">
                    Create Free Account
                    <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                  <Link to="/login" className="btn-secondary !w-full sm:!w-auto">
                    I already have an account
                  </Link>
                </div>
                <div className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-2">
                  {proofPoints.map((point, index) => (
                    <div key={point} className={`items-start gap-3 rounded-[20px] border border-white/[0.08] bg-white/[0.03] px-4 py-4 ${index > 1 ? 'hidden sm:flex' : 'flex'}`}>
                      <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-300" />
                      <span className="text-sm leading-6 text-slate-100/88">{point}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative lg:order-2">
                <div className="panel mx-auto max-w-2xl overflow-hidden p-3 sm:p-5">
                  <div className="rounded-[24px] border border-white/10 bg-surface-950/85 p-4 sm:rounded-[26px] sm:p-6">
                    <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                      <div>
                        <p className="metric-label mb-1">Personal Addon</p>
                        <h2 className="text-xl font-bold text-white sm:text-2xl">Install-ready endpoint</h2>
                      </div>
                      <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-100">
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

                    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
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
                      <div className="flex flex-col gap-3 rounded-[20px] border border-white/[0.08] bg-white/[0.03] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">Northstream</p>
                          <p className="text-xs text-slate-300/55">Healthy host selected</p>
                        </div>
                        <span className="w-fit rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-100">online</span>
                      </div>
                      <div className="flex flex-col gap-3 rounded-[20px] border border-white/[0.08] bg-white/[0.03] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">CinemaVault</p>
                          <p className="text-xs text-slate-300/55">57,481 matched titles</p>
                        </div>
                        <span className="w-fit rounded-full bg-white/[0.06] px-3 py-1 text-xs font-medium text-slate-100">94%</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="pointer-events-none absolute -bottom-8 left-10 right-10 hidden h-24 rounded-full bg-brand-400/20 blur-3xl sm:block" />
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="mb-8 max-w-2xl sm:mb-10">
              <p className="eyebrow mb-3">Why it feels better</p>
              <h2 className="text-3xl font-bold text-white sm:text-4xl">One system for setup, maintenance, and day-to-day use.</h2>
              <p className="mt-4 text-base leading-7 text-slate-300/72">
                StreamBridge is strongest when it removes repeated setup work. The app keeps routing, health, metadata, and install flow in the same place.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {pillars.map(({ title, copy, icon: Icon }) => (
                <div key={title} className="panel-soft p-5 sm:p-7">
                  <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.04]">
                    <Icon className="h-5 w-5 text-brand-300" />
                  </div>
                  <h3 className="mt-5 text-xl font-bold text-white sm:text-2xl">{title}</h3>
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
