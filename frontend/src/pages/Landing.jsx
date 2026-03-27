import React, { useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import {
  ArrowRight, Zap, Server, Film, ShieldCheck, CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import BrandMark from '../components/BrandMark';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

// ── Sera UI components ──────────────────────────────────────────────────────
import ShimmerButton         from '../components/sera/ShimmerButton';
import GlowButton            from '../components/sera/GlowButton';
import NumberTicker          from '../components/sera/NumberTicker';
import Marquee               from '../components/sera/Marquee';
import GridBackground        from '../components/sera/GridBackground';
import AnnouncementBanner    from '../components/sera/AnnouncementBanner';
import SectionDivider        from '../components/sera/SectionDivider';
import ProviderPreviewWidget from '../components/ProviderPreviewWidget';

// ── Data ────────────────────────────────────────────────────────────────────
const pillars = [
  {
    title: 'Route several IPTV sources through one install flow',
    copy: 'Add providers once, keep them health-checked, and stop rebuilding Stremio every time a host changes.',
    icon: Server,
  },
  {
    title: 'Keep posters and titles usable without side tools',
    copy: 'Matching, TMDB enrichment, and manual correction stay close to the catalog instead of becoming another workflow.',
    icon: Film,
  },
  {
    title: 'Deliver a private endpoint that feels production-ready',
    copy: 'Every account keeps a scoped install URL that is simple to reinstall, rotate, and trust.',
    icon: ShieldCheck,
  },
];

const workflow = [
  ['Create your account', 'Start with one workspace built for your own provider stack.'],
  ['Connect providers',   'Bring in credentials once and let StreamBridge monitor host health.'],
  ['Install one addon',   'Use a single private URL in Stremio instead of juggling separate configs.'],
];

const proofPoints = [
  'Switch providers without rebuilding the addon config',
  'Keep provider health and expiry visible in one workspace',
  'Repair metadata where it matters instead of across multiple tools',
];

// Tags shown in the marquee strip
const marqueeItems = [
  'IPTV Routing', 'Provider Health', 'Metadata Repair', 'Private Endpoints',
  'Stremio Addons', 'Host Failover', 'TMDB Enrichment', 'Catalog Matching',
  'Live TV', 'VOD Browsing', 'Expiry Tracking', 'One-click Install',
];

// ── Animation variants ───────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  }),
};

function AnimatedSection({ children, className }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────
export default function Landing() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="marketing-shell min-h-screen">
      <div className="marketing-chrome">

        {/* ── Nav ─────────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-surface-950/60 backdrop-blur-2xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
            <BrandMark compact />
            <nav className="flex items-center gap-2 sm:gap-3" aria-label="Main navigation">
              <Button asChild variant="outline" size="sm">
                <Link to="/login">Sign In</Link>
              </Button>
              {/* Sera UI – Shimmer Button (nav CTA) */}
              <ShimmerButton className="text-sm" onClick={() => window.location.href = '/signup'}>
                Start Free <ArrowRight className="h-3.5 w-3.5 inline-block ml-1" />
              </ShimmerButton>
            </nav>
          </div>
        </header>

        <main>
          {/* ── Hero (Sera UI GridBackground wraps entire section) ──────── */}
          <GridBackground>
            <section className="relative overflow-hidden border-b border-white/[0.08]" aria-label="Hero">
              <div className="ambient-orb left-[-8rem] top-[8rem] h-80 w-80 bg-cyan-300/18 opacity-70" aria-hidden="true" />
              <div className="ambient-orb right-[-6rem] top-[3rem] h-96 w-96 bg-brand-400/16 opacity-70 [animation-delay:2s]" aria-hidden="true" />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-surface-950/10 to-surface-950/60" aria-hidden="true" />

              <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8 lg:py-24 xl:py-28">

                {/* Left: copy */}
                <div>
                  {/* Sera UI – Announcement Banner replaces old Badge kicker */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="mb-6"
                  >
                    <AnnouncementBanner badge="New">
                      IPTV infrastructure, cleaned up for Stremio
                    </AnnouncementBanner>
                  </motion.div>

                  <motion.p
                    variants={fadeUp} initial="hidden" animate="visible" custom={1}
                    className="text-[11px] font-semibold uppercase tracking-[0.26em] text-sky-100/45"
                  >
                    StreamBridge
                  </motion.p>
                  <motion.h1
                    variants={fadeUp} initial="hidden" animate="visible" custom={2}
                    className="hero-display mt-2"
                  >
                    One private bridge for the providers you actually use.
                  </motion.h1>
                  <motion.p
                    variants={fadeUp} initial="hidden" animate="visible" custom={3}
                    className="hero-support mt-6"
                  >
                    StreamBridge turns a messy IPTV setup into one installable, account-scoped Stremio addon with provider routing, health visibility, and metadata repair built in.
                  </motion.p>

                  <motion.div
                    variants={fadeUp} initial="hidden" animate="visible" custom={4}
                    className="mt-8 flex flex-col gap-3 sm:flex-row"
                  >
                    {/* Sera UI – Shimmer Button (primary hero CTA) */}
                    <ShimmerButton className="text-sm font-semibold" onClick={() => window.location.href = '/signup'}>
                      Create Free Account <ArrowRight className="h-4 w-4 inline-block ml-1" />
                    </ShimmerButton>
                    {/* Sera UI – Glow Button (secondary hero CTA) */}
                    <GlowButton size="md" onClick={() => window.location.href = '/login'}>
                      I already have an account
                    </GlowButton>
                  </motion.div>

                  {/* Proof metrics – Sera UI NumberTicker */}
                  <motion.div
                    variants={fadeUp} initial="hidden" animate="visible" custom={5}
                    className="mt-10 flex items-center gap-6 border-t border-white/[0.08] pt-8"
                  >
                    {[
                      { value: 1,   suffix: '',  label: 'Private URL per account', isNum: true },
                      { display: 'Auto', label: 'Host failover' },
                      { value: 91, suffix: '%', label: 'Catalogs matched', isNum: true },
                    ].map(({ value, suffix, label, display, isNum }) => (
                      <div key={label} className="min-w-0">
                        <p className="text-2xl font-bold text-white">
                          {isNum
                            ? <NumberTicker value={value} suffix={suffix} duration={1400} delay={700} className="text-2xl font-bold text-white" />
                            : display}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-300/55">{label}</p>
                      </div>
                    ))}
                  </motion.div>
                </div>

                {/* Right: app preview card */}
                <motion.div
                  initial={{ opacity: 0, y: 32, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.18, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="panel overflow-hidden p-6 sm:p-8">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="metric-label mb-2">Private addon endpoint</p>
                        <h2 className="text-2xl font-bold text-white">Install-ready</h2>
                      </div>
                      <Badge variant="success">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Active
                      </Badge>
                    </div>

                    <div className="mt-5 overflow-x-auto rounded-2xl border border-white/[0.08] bg-surface-950/70 px-4 py-3 font-mono text-xs leading-7 text-brand-100/80 sm:text-sm">
                      https://streambridge.app/addon/<wbr />
                      <span className="text-brand-300">acc_x2f9c4f1</span>/manifest.json
                    </div>

                    <div className="surface-divider mt-6 pt-6">
                      <p className="metric-label mb-4">Why operators keep this open</p>
                      <ul className="space-y-3" role="list">
                        {proofPoints.map((point) => (
                          <li key={point} className="flex items-start gap-3 text-sm leading-6 text-slate-200/78">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-300" />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="surface-divider mt-6 pt-6">
                      <div className="grid grid-cols-3 divide-x divide-white/[0.06]">
                        {[
                          { value: 3,     label: 'Sources', tone: 'text-white',       isNum: true },
                          { value: 57000, label: 'Titles',  tone: 'text-white',       isNum: true, formatFn: (n) => `${Math.round(n / 1000)}K` },
                          { label: 'Routing', tone: 'text-emerald-300', display: 'Online' },
                        ].map(({ value, label, tone, isNum, formatFn, display }) => (
                          <div key={label} className="px-4 text-center first:pl-0 last:pr-0">
                            <p className={`text-xl font-bold ${tone}`}>
                              {isNum
                                ? <NumberTicker value={value} formatFn={formatFn} duration={1600} delay={900} className={`text-xl font-bold ${tone}`} />
                                : display}
                            </p>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300/55">{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </section>
          </GridBackground>

          {/* ── Sera UI Marquee strip ─────────────────────────────────────── */}
          <div className="border-y border-white/[0.06] bg-white/[0.015] py-4 overflow-hidden">
            <Marquee speed={35} pauseOnHover repeat={4}>
              {marqueeItems.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300/60 whitespace-nowrap"
                >
                  <span className="h-1 w-1 rounded-full bg-brand-400/60" />
                  {item}
                </span>
              ))}
            </Marquee>
          </div>

          {/* ── Pillars ───────────────────────────────────────────────────── */}
          <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24" aria-label="Features">
            <AnimatedSection>
              <div className="mx-auto max-w-2xl text-center">
                <p className="eyebrow mb-3">Built for operators</p>
                <h2 className="text-3xl font-bold text-white sm:text-4xl">
                  The value is obvious in under a minute.
                </h2>
                <p className="mt-4 text-base leading-7 text-slate-300/70">
                  Users do not need a long onboarding sequence. They need routing, repair, and install in the same place.
                </p>
              </div>
            </AnimatedSection>

            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {pillars.map(({ title, copy, icon: Icon }, i) => (
                <AnimatedSection key={title}>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={{ y: -4, transition: { duration: 0.2 } }}
                    className="panel-soft h-full p-6 cursor-default"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.04]">
                      <Icon className="h-5 w-5 text-brand-300" />
                    </div>
                    <h3 className="mt-5 text-lg font-bold text-white">{title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-300/70">{copy}</p>
                  </motion.div>
                </AnimatedSection>
              ))}
            </div>
          </section>

          {/* Sera UI – Section Divider */}
          <div className="mx-auto max-w-7xl px-8">
            <SectionDivider label="How it works" />
          </div>

          {/* ── How it works ──────────────────────────────────────────────── */}
          <section className="bg-white/[0.015]" aria-label="How it works">
            <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:grid lg:grid-cols-[0.75fr_1.25fr] lg:gap-16 lg:px-8 lg:py-24">
              <AnimatedSection>
                <p className="eyebrow mb-3">Three steps</p>
                <h2 className="text-3xl font-bold text-white sm:text-4xl">
                  Fast path from signup to playback.
                </h2>
                <p className="mt-4 text-base leading-7 text-slate-300/70">
                  Get access, connect sources, install once.
                </p>
              </AnimatedSection>

              <ol className="mt-10 grid gap-4 lg:mt-0" role="list">
                {workflow.map(([title, copy], index) => (
                  <AnimatedSection key={title}>
                    <motion.li
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      className="grid gap-4 rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-5 sm:grid-cols-[auto_1fr] sm:items-start sm:p-6"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm font-bold text-white">
                        0{index + 1}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">{title}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-300/70">{copy}</p>
                      </div>
                    </motion.li>
                  </AnimatedSection>
                ))}
              </ol>
            </div>
          </section>

          {/* Sera UI – Section Divider */}
          <div className="mx-auto max-w-7xl px-8">
            <SectionDivider label="Try it now" />
          </div>

          {/* ── Provider Preview Widget ───────────────────────────────────── */}
          <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16" aria-label="Try your provider">
            <AnimatedSection>
              <div className="mx-auto max-w-3xl text-center mb-8">
                <p className="eyebrow mb-3">No account needed yet</p>
                <h2 className="text-3xl font-bold text-white sm:text-4xl">
                  Works with your provider? Find out in 10 seconds.
                </h2>
                <p className="mt-4 text-base leading-7 text-slate-300/70">
                  Enter your Xtream credentials and StreamBridge will scan your catalog live — channels, movies, series — before you ever touch a signup form.
                </p>
              </div>
              <ProviderPreviewWidget />
            </AnimatedSection>
          </section>

          {/* Sera UI – Section Divider */}
          <div className="mx-auto max-w-7xl px-8">
            <SectionDivider label="Get started" />
          </div>

          {/* ── CTA ──────────────────────────────────────────────────────── */}
          <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24" aria-label="Call to action">
            <AnimatedSection>
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
                    {/* Sera UI – Shimmer Button */}
                    <ShimmerButton className="text-sm font-semibold" onClick={() => window.location.href = '/signup'}>
                      Start Free <ArrowRight className="h-4 w-4 inline-block ml-1" />
                    </ShimmerButton>
                    {/* Sera UI – Glow Button */}
                    <GlowButton size="md" onClick={() => window.location.href = '/login'}>
                      Sign In
                    </GlowButton>
                  </div>
                </div>
              </div>
            </AnimatedSection>
          </section>
        </main>

        <footer className="border-t border-white/[0.08]">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-slate-400/60 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <span>StreamBridge</span>
            <span>Private Stremio addon delivery for real IPTV accounts</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
