'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, useInView } from 'framer-motion'
import {
  ArrowRight, CheckCircle2, Film, MonitorPlay, Server, ShieldCheck, Signal,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { Badge } from '@/components/ui/badge'
import BrandMark from '@/components/BrandMark'
import ShimmerButton from '@/components/sera/ShimmerButton'
import GlowButton from '@/components/sera/GlowButton'
import NumberTicker from '@/components/sera/NumberTicker'
import AnnouncementBanner from '@/components/sera/AnnouncementBanner'
import SectionDivider from '@/components/sera/SectionDivider'
import TextRotate from '@/components/marketing/TextRotate'
import { AnimatedTestimonials } from '@/components/ui/animated-testimonials'
import { Marquee } from '@/components/ui/marquee'
import ThreeDMarquee from '@/components/ui/3d-marquee'
import { PricingSection } from '@/components/ui/pricing-section'
import ParallaxCosmicBackground from '@/components/ui/parallax-cosmic-background'
import {
  MobileNav, MobileNavHeader, MobileNavMenu, MobileNavToggle,
  NavBody, NavItems, Navbar, NavbarButton,
} from '@/components/ui/resizable-navbar'
import ProviderPreviewWidget from '@/components/ProviderPreviewWidget'

// ── Data ─────────────────────────────────────────────────────────────────────

const pillars = [
  {
    title: 'Your TV subscription, inside a Netflix-like app',
    copy: "If you pay for a live TV service, StreamBridge puts it inside Stremio — a clean, modern player that works on your TV, phone, and laptop. No extra apps, no complicated setup.",
    icon: Server,
  },
  {
    title: 'Live sports, news, and movies — all in one place',
    copy: "Get live channels AND a full on-demand library, organised and browsable like Netflix. Proper titles, artwork, and descriptions — everything looking exactly how it should.",
    icon: Film,
  },
  {
    title: 'Set it up once and it keeps working',
    copy: "Test your TV service for free before signing up. Connect it in under 5 minutes. If anything ever changes on your provider's end, StreamBridge handles it automatically.",
    icon: ShieldCheck,
  },
]

const workflow: [string, string][] = [
  ['Create your free account', 'Takes 30 seconds. No credit card needed — you can test your TV service before you pay anything.'],
  ['Connect your TV service', 'Paste your login details once. StreamBridge checks everything works and shows you your channels before you commit.'],
  ["Start watching in Stremio", "Copy one link into Stremio and you're done. All your live channels, sports, and on-demand content — in one clean app."],
]

const proofPoints = [
  'Live TV, sports, and movies — all in one Netflix-style app',
  'Try your TV service for free before paying anything',
  'One setup that keeps working — no maintenance required',
]

const providers = [
  { label: 'Xtream Codes', meta: 'Most TV services', mark: 'XC' },
  { label: 'M3U Playlist', meta: 'Playlist link', mark: 'M3' },
  { label: 'MAC Portal', meta: 'Portal login', mark: 'MP' },
  { label: 'Stremio', meta: 'Your player', mark: 'ST' },
  { label: 'TMDB', meta: 'Show artwork', mark: 'TM' },
  { label: 'XML EPG', meta: 'TV guide', mark: 'EP' },
  { label: 'HLS', meta: 'Live streams', mark: 'HL' },
  { label: 'Catch-up TV', meta: 'Watch back', mark: 'CU' },
]

const lineupPoints = [
  {
    title: "Looks like Netflix — but it's your own TV service",
    copy: "Stremio gives your live channels and on-demand content a clean, modern interface with real artwork, descriptions, and ratings. It's what watching TV should feel like.",
    icon: MonitorPlay,
  },
  {
    title: "Already paying for a TV service? This is how you watch it properly",
    copy: "If you have a TV subscription and don't love the app it came with, StreamBridge moves it into Stremio in minutes — no tech knowledge needed.",
    icon: Signal,
  },
]

const pricingPlans = [
  {
    name: 'Starter',
    info: 'Perfect for one person',
    price: { monthly: 9, yearly: 90 },
    features: [
      'One Stremio setup for yourself',
      'Connect up to 2 TV services',
      'Test your service free before paying',
      'Correct titles, artwork & descriptions',
    ],
    cta: 'Start free trial',
    href: '/signup',
  },
  {
    name: 'Power',
    info: 'For households or heavy users',
    price: { monthly: 19, yearly: 190 },
    features: [
      '5 TV services with automatic backup',
      'Switches sources automatically if one drops',
      'Alerts before your TV service expires',
      'Priority content matching',
    ],
    cta: 'Start free trial',
    href: '/signup',
    highlighted: true,
  },
  {
    name: 'Operator',
    info: 'For families or shared setups',
    price: { monthly: 39, yearly: 390 },
    features: [
      '10 TV service connections',
      'Multiple Stremio setups',
      'Shared account with easy handoff',
      'Early access to new features',
    ],
    cta: 'Talk to us',
    href: '/signup',
  },
]

const createSvgDataUri = (svg: string) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`

const createPortraitDataUri = ({
  name, role, accentFrom, accentTo,
}: { name: string; role: string; accentFrom: string; accentTo: string }) => {
  const initials = name.split(' ').map((part) => part[0]).join('').slice(0, 2)
  return createSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 900">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${accentFrom}" />
          <stop offset="100%" stop-color="${accentTo}" />
        </linearGradient>
      </defs>
      <rect width="800" height="900" fill="#07101d" />
      <rect x="26" y="26" width="748" height="848" rx="48" fill="url(#bg)" opacity="0.92" />
      <circle cx="168" cy="196" r="128" fill="rgba(255,255,255,0.14)" />
      <circle cx="628" cy="256" r="160" fill="rgba(255,255,255,0.1)" />
      <circle cx="406" cy="740" r="220" fill="rgba(6,11,23,0.32)" />
      <text x="80" y="520" fill="white" font-family="Arial, sans-serif" font-size="210" font-weight="700">${initials}</text>
      <text x="82" y="640" fill="rgba(255,255,255,0.9)" font-family="Arial, sans-serif" font-size="36" font-weight="700">${name}</text>
      <text x="82" y="688" fill="rgba(255,255,255,0.7)" font-family="Arial, sans-serif" font-size="24">${role}</text>
    </svg>
  `)
}

const createLineupCardUri = ({
  title, genre, toneA, toneB, badge,
}: { title: string; genre: string; toneA: string; toneB: string; badge: string }) => createSvgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900">
    <defs>
      <linearGradient id="card" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${toneA}" />
        <stop offset="100%" stop-color="${toneB}" />
      </linearGradient>
    </defs>
    <rect width="1200" height="900" rx="52" fill="#050816" />
    <rect x="34" y="34" width="1132" height="832" rx="42" fill="url(#card)" />
    <circle cx="990" cy="180" r="190" fill="rgba(255,255,255,0.09)" />
    <circle cx="230" cy="710" r="240" fill="rgba(4,12,24,0.3)" />
    <rect x="92" y="92" width="172" height="58" rx="29" fill="rgba(255,255,255,0.14)" />
    <text x="128" y="130" fill="white" font-family="Arial, sans-serif" font-size="28" font-weight="700">${badge}</text>
    <text x="92" y="554" fill="white" font-family="Arial, sans-serif" font-size="86" font-weight="700">${title}</text>
    <text x="92" y="628" fill="rgba(255,255,255,0.76)" font-family="Arial, sans-serif" font-size="34">${genre}</text>
    <text x="92" y="744" fill="rgba(255,255,255,0.92)" font-family="Arial, sans-serif" font-size="28">Premium lineup preview</text>
  </svg>
`)

const testimonials = [
  {
    name: 'Damon Reed',
    designation: 'Sports fan, manages 3 TV services',
    quote: "I used to spend ages fixing things whenever my provider changed. Now I just sit down and watch. The channels are all there, everything looks right, and I haven't had to touch it in months.",
    metric: "Hasn't reconfigured anything in 4 months",
    context: 'Switched from juggling separate apps for live TV and on-demand.',
    src: createPortraitDataUri({ name: 'Damon Reed', role: 'Sports fan', accentFrom: '#0f4c81', accentTo: '#3ca6ff' }),
  },
  {
    name: 'Maya Sullivan',
    designation: 'Parent, manages TV for the whole family',
    quote: "I'm not technical at all, so I was nervous. But I tested it before paying, saw all the channels were there, and was watching within about 5 minutes. My kids use it every day now.",
    metric: 'Up and running in under 5 minutes',
    context: "Set up the whole family's TV without any technical help.",
    src: createPortraitDataUri({ name: 'Maya Sullivan', role: 'Parent', accentFrom: '#074b5c', accentTo: '#10b0d8' }),
  },
  {
    name: 'Ibrahim Khan',
    designation: 'Manages TV access for extended family',
    quote: "My parents and siblings all use it. When one service goes down it switches automatically — they don't even notice. I get an alert before anything expires. It just runs itself.",
    metric: 'Zero complaints across 3 households',
    context: "Runs TV access for family members who aren't technical.",
    src: createPortraitDataUri({ name: 'Ibrahim Khan', role: 'Family organiser', accentFrom: '#2e4d8f', accentTo: '#7bc2ff' }),
  },
]

const channelShowcaseImages = [
  createLineupCardUri({ title: 'Horizon Sports', genre: '4K matchday feeds', toneA: '#102848', toneB: '#2857d1', badge: 'LIVE' }),
  createLineupCardUri({ title: 'Cinema One', genre: 'Metadata repaired movies', toneA: '#31124c', toneB: '#7b2cbf', badge: 'VOD' }),
  createLineupCardUri({ title: 'Signal 24', genre: 'Always-on news lineup', toneA: '#15354a', toneB: '#1f9d8d', badge: 'NEWS' }),
  createLineupCardUri({ title: 'Kids Loop', genre: 'Family-safe rows', toneA: '#4d2910', toneB: '#d97706', badge: 'FAM' }),
  createLineupCardUri({ title: 'Fight Night', genre: 'Event channels and replay', toneA: '#3d1320', toneB: '#d43f5e', badge: 'PPV' }),
  createLineupCardUri({ title: 'Studio Max', genre: 'Premium series shelf', toneA: '#10273f', toneB: '#0ea5e9', badge: 'SERIES' }),
  createLineupCardUri({ title: 'World Football', genre: 'Regional sports packs', toneA: '#183b22', toneB: '#16a34a', badge: 'SPORT' }),
  createLineupCardUri({ title: 'Night Drive', genre: 'Music video carousel', toneA: '#32165e', toneB: '#7c3aed', badge: 'MUSIC' }),
  createLineupCardUri({ title: 'Retro Vault', genre: 'Cleaned classic catalog', toneA: '#45300c', toneB: '#ca8a04', badge: 'ARCHIVE' }),
]

const marketingNavItems = [
  { name: 'Features', link: '#features' },
  { name: 'Workflow', link: '#workflow' },
  { name: 'Preview', link: '#preview' },
  { name: 'Pricing', link: '#pricing' },
]

// ── Animation variants ────────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
}

function AnimatedSection({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  if (user) {
    router.replace('/dashboard')
    return null
  }

  return (
    <ParallaxCosmicBackground className="marketing-shell min-h-screen">
      <div className="marketing-chrome">
        <Navbar>
          <NavBody>
            <Link href="/" className="min-w-0">
              <BrandMark compact />
            </Link>
            <NavItems items={marketingNavItems} />
            <div className="hidden items-center gap-2 md:flex">
              <NavbarButton as={Link} href="/login" variant="secondary">Login</NavbarButton>
              <NavbarButton as={Link} href="/signup" variant="gradient">Create account</NavbarButton>
            </div>
          </NavBody>

          <MobileNav>
            <MobileNavHeader>
              <Link href="/" className="min-w-0">
                <BrandMark compact />
              </Link>
              <button
                type="button"
                onClick={() => setMobileMenuOpen((v) => !v)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.12] bg-surface-900/80 text-white transition hover:bg-surface-800/90"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
              >
                <MobileNavToggle isOpen={mobileMenuOpen} />
              </button>
            </MobileNavHeader>
            <MobileNavMenu isOpen={mobileMenuOpen}>
              {marketingNavItems.map((item) => (
                <a
                  key={item.name}
                  href={item.link}
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full rounded-2xl px-4 py-3 text-sm font-medium text-slate-200/78 transition hover:bg-white/[0.06] hover:text-white"
                >
                  {item.name}
                </a>
              ))}
              <div className="grid w-full gap-2 border-t border-white/[0.08] pt-3">
                <NavbarButton as={Link} href="/login" variant="secondary" className="w-full justify-center">Login</NavbarButton>
                <NavbarButton as={Link} href="/signup" variant="gradient" className="w-full justify-center">Create account</NavbarButton>
              </div>
            </MobileNavMenu>
          </MobileNav>
        </Navbar>

        <main>
          {/* ── Hero ───────────────────────────────────────────────────── */}
          <section className="relative overflow-hidden border-b border-white/[0.08] pt-24" aria-label="Hero">
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-surface-950/5 to-surface-950/60" aria-hidden="true" />

            <div className="relative mx-auto grid min-h-[calc(100svh-6rem)] max-w-7xl gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-20 lg:px-8 lg:py-20">
              <div className="max-w-2xl">
                <motion.div
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
                  className="mb-6"
                >
                  <AnnouncementBanner badge="New">
                    Your TV subscription, inside a Netflix-style app
                  </AnnouncementBanner>
                </motion.div>

                <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={1}
                  className="text-[11px] font-semibold uppercase tracking-[0.26em] text-sky-100/45"
                >
                  StreamBridge
                </motion.p>
                <motion.h1 variants={fadeUp} initial="hidden" animate="visible" custom={2}
                  className="hero-display mt-2 max-w-[13ch]"
                >
                  <span className="block">Watch your</span>
                  <span className="block">
                    <span className="sr-only">TV service like Netflix.</span>
                    <TextRotate
                      words={['TV like Netflix.', 'channels, clean.', 'live TV, your way.']}
                      className="bg-gradient-to-r from-white via-brand-200 to-cyan-200 bg-clip-text text-transparent"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="block">Finally.</span>
                </motion.h1>
                <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={3}
                  className="hero-support mt-6 max-w-xl"
                >
                  StreamBridge takes your TV subscription and puts it inside Stremio — a clean, modern app that works on your TV, phone, and laptop. Live sports, news, and movies on-demand, all browsable like Netflix. Set up in under 5 minutes.
                </motion.p>

                <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={4}
                  className="mt-4 text-sm font-medium leading-6 text-slate-200/78"
                >
                  Works with most TV subscriptions. No technical knowledge needed.
                </motion.p>

                <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={5}
                  className="mt-8 flex flex-col gap-3 sm:flex-row"
                >
                  <ShimmerButton className="text-sm font-semibold" onClick={() => (window.location.href = '/signup')}>
                    Start Watching Free <ArrowRight className="ml-1 inline-block h-4 w-4" />
                  </ShimmerButton>
                  <GlowButton size="md" onClick={() => (window.location.href = '/login')}>
                    I already have an account
                  </GlowButton>
                </motion.div>
                <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={5}
                  className="mt-3 text-xs text-slate-400/55"
                >
                  No credit card needed · Cancel anytime · Works on any device
                </motion.p>

                <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={6}
                  className="mt-10 flex items-center gap-6 border-t border-white/[0.08] pt-8"
                >
                  {[
                    { display: 'Free', label: 'No card to try', valueTone: 'text-cyan-200' },
                    { value: 5, suffix: ' min', label: 'Setup time', isNum: true },
                    { display: 'Any device', label: 'TV, phone, laptop' },
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ].map(({ value, suffix, label, display, isNum, valueTone = 'text-white' }: any) => (
                    <div key={label} className="min-w-0">
                      <p className={`text-2xl font-bold ${valueTone}`}>
                        {isNum
                          ? <NumberTicker value={value} suffix={suffix} duration={1400} delay={700} className={`text-2xl font-bold ${valueTone}`} />
                          : display}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-300/55">{label}</p>
                    </div>
                  ))}
                </motion.div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 32, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.18, duration: 0.65, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
                className="relative"
              >
                <div className="absolute inset-x-[8%] top-[8%] h-40 rounded-full bg-brand-500/18 blur-3xl" />
                <div className="absolute bottom-[8%] right-[4%] h-36 w-36 rounded-full bg-cyan-300/18 blur-3xl" />
                <div className="relative overflow-hidden rounded-[34px] border border-white/[0.12] bg-[linear-gradient(180deg,rgba(8,16,31,0.74),rgba(8,16,31,0.92))] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl sm:p-7">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="metric-label mb-2">Your streaming lineup</p>
                      <h2 className="text-2xl font-bold text-white">Everything in one place</h2>
                    </div>
                    <Badge variant="success">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Live
                    </Badge>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-surface-950/70 px-4 py-3 text-xs leading-7 text-brand-100/80 sm:text-sm">
                    <span className="text-slate-400/70">Connected TV service  →  </span>
                    <span className="font-semibold text-brand-300">Stremio</span>
                    <span className="text-slate-400/70">  ·  watching on </span>
                    <span className="font-semibold text-white">any screen</span>
                  </div>

                  <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                    <div className="rounded-[26px] border border-white/[0.08] bg-white/[0.03] p-5">
                      <p className="metric-label mb-4">What you get</p>
                      <ul className="space-y-3" role="list">
                        {proofPoints.map((point) => (
                          <li key={point} className="flex items-start gap-3 text-sm leading-6 text-slate-200/78">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-[26px] border border-white/[0.08] bg-white/[0.03] p-5">
                      <p className="metric-label mb-4">Works on</p>
                      <div className="grid grid-cols-1 gap-4">
                        {[
                          { label: 'Smart TV & laptop', value: '✓' },
                          { label: 'iPhone & Android', value: '✓' },
                          { label: 'Status', value: 'Online' },
                        ].map((item) => (
                          <div key={item.label} className="rounded-2xl border border-white/[0.08] bg-surface-950/55 px-4 py-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400/65">{item.label}</p>
                            <p className="mt-1 text-lg font-bold text-white">{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="surface-divider mt-6 pt-6">
                    <div className="grid grid-cols-3 divide-x divide-white/[0.06]">
                      {[
                        { value: 5, suffix: ' min', label: 'To set up', tone: 'text-white', isNum: true },
                        { value: 57000, label: 'Titles', tone: 'text-white', isNum: true, formatFn: (n: number) => `${Math.round(n / 1000)}K` },
                        { label: 'Working', tone: 'text-emerald-300', display: '✓ Live' },
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      ].map(({ value, suffix, label, tone, isNum, formatFn, display }: any) => (
                        <div key={label} className="px-4 text-center first:pl-0 last:pr-0">
                          <p className={`text-xl font-bold ${tone}`}>
                            {isNum
                              ? <NumberTicker value={value} suffix={suffix} formatFn={formatFn} duration={1600} delay={900} className={`text-xl font-bold ${tone}`} />
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

          {/* ── Provider Marquee ───────────────────────────────────────── */}
          <section className="overflow-hidden border-y border-white/[0.06] bg-white/[0.015] py-6" aria-label="Supported providers">
            <div className="mx-auto mb-4 flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
              <p className="eyebrow mb-0">Supported providers</p>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400/55">Pause on hover</p>
            </div>
            <Marquee pauseOnHover repeat={5} className="[--duration:30s]">
              {providers.map((provider) => (
                <div key={provider.label} className="flex min-w-[220px] items-center gap-4 rounded-[22px] border border-white/[0.08] bg-white/[0.04] px-4 py-3 backdrop-blur-xl">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-surface-950/70 text-sm font-bold text-brand-200">
                    {provider.mark}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{provider.label}</p>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400/55">{provider.meta}</p>
                  </div>
                </div>
              ))}
            </Marquee>
            <Marquee pauseOnHover reverse repeat={5} className="mt-3 [--duration:34s]">
              {providers.slice().reverse().map((provider) => (
                <div key={`${provider.label}-reverse`} className="flex min-w-[220px] items-center gap-4 rounded-[22px] border border-white/[0.08] bg-white/[0.025] px-4 py-3 backdrop-blur-xl">
                  <div className="h-2.5 w-2.5 rounded-full bg-brand-300 shadow-[0_0_16px_rgba(123,194,255,0.9)]" />
                  <div>
                    <p className="text-sm font-semibold text-white">{provider.label}</p>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400/55">{provider.meta}</p>
                  </div>
                </div>
              ))}
            </Marquee>
          </section>

          {/* ── Devices ───────────────────────────────────────────────── */}
          <section className="border-b border-white/[0.06] bg-white/[0.01] py-8" aria-label="Works on your devices">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.22em] text-slate-400/55">Works on every screen you own</p>
              <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
                {[
                  { label: 'Smart TV', icon: '📺' },
                  { label: 'iPhone', icon: '📱' },
                  { label: 'Android', icon: '📱' },
                  { label: 'iPad / Tablet', icon: '📱' },
                  { label: 'Laptop', icon: '💻' },
                  { label: 'Fire Stick', icon: '📺' },
                  { label: 'Web Browser', icon: '🌐' },
                ].map(({ label, icon }) => (
                  <div key={label} className="flex items-center gap-2 rounded-[16px] border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 backdrop-blur-xl">
                    <span className="text-base leading-none">{icon}</span>
                    <span className="text-sm font-medium text-slate-200/75">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Pillars ───────────────────────────────────────────────── */}
          <section id="features" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24" aria-label="Features">
            <AnimatedSection>
              <div className="mx-auto max-w-2xl text-center">
                <p className="eyebrow mb-3">Why StreamBridge exists</p>
                <h2 className="text-3xl font-bold text-white sm:text-4xl">
                  You&apos;re already paying for TV. You deserve a better way to watch it.
                </h2>
                <p className="mt-4 text-base leading-7 text-slate-300/70">
                  Most TV subscriptions come with an app that feels clunky and outdated. StreamBridge moves your channels into Stremio — a modern, Netflix-style player — in minutes.
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
                    transition={{ delay: i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
                    whileHover={{ y: -4, transition: { duration: 0.2 } }}
                    className="panel-soft h-full cursor-default p-6"
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

          <div className="mx-auto max-w-7xl px-8">
            <SectionDivider label="How it works" />
          </div>

          {/* ── Lineup preview ────────────────────────────────────────── */}
          <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24" aria-label="Channel lineup preview">
            <div className="grid gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-16">
              <AnimatedSection>
                <p className="eyebrow mb-3">What it looks like</p>
                <h2 className="text-3xl font-bold text-white sm:text-4xl">
                  Your TV channels — with the look and feel of Netflix.
                </h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-slate-300/70">
                  Instead of a clunky TV app, you get Stremio: a clean, modern interface with real artwork, descriptions, and ratings for everything you watch. Live TV and on-demand, all in one place.
                </p>
                <div className="mt-8 grid gap-4">
                  {lineupPoints.map(({ title, copy, icon: Icon }) => (
                    <div key={title} className="panel-soft flex items-start gap-4 p-5">
                      <div className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.04]">
                        <Icon className="h-5 w-5 text-brand-300" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">{title}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-300/68">{copy}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </AnimatedSection>

              <AnimatedSection>
                <div className="relative overflow-hidden rounded-[34px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-3 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
                  <div className="pointer-events-none absolute inset-x-[18%] top-0 h-28 rounded-full bg-brand-400/14 blur-3xl" />
                  <ThreeDMarquee images={channelShowcaseImages} className="h-[30rem] rounded-[28px] bg-surface-950/55" />
                </div>
              </AnimatedSection>
            </div>
          </section>

          {/* ── How it works ──────────────────────────────────────────── */}
          <section id="workflow" className="bg-white/[0.015]" aria-label="How it works">
            <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:grid lg:grid-cols-[0.75fr_1.25fr] lg:gap-16 lg:px-8 lg:py-24">
              <AnimatedSection>
                <p className="eyebrow mb-3">How it works</p>
                <h2 className="text-3xl font-bold text-white sm:text-4xl">
                  Three steps and you&apos;re watching. Under 5 minutes.
                </h2>
                <p className="mt-4 text-base leading-7 text-slate-300/70">
                  No technical knowledge needed. Create an account, connect your TV service, and you&apos;re done.
                </p>
              </AnimatedSection>

              <ol className="mt-10 grid gap-4 lg:mt-0" role="list">
                {workflow.map(([title, copy], index) => (
                  <AnimatedSection key={title}>
                    <motion.li
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
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

          <div className="mx-auto max-w-7xl px-8">
            <SectionDivider label="Try it now" />
          </div>

          {/* ── Provider Preview Widget ───────────────────────────────── */}
          <section id="preview" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16" aria-label="Try your provider">
            <AnimatedSection>
              <div className="mx-auto mb-8 max-w-3xl text-center">
                <p className="eyebrow mb-3">Try it before signing up</p>
                <h2 className="text-3xl font-bold text-white sm:text-4xl">
                  See your channels before you pay a single penny.
                </h2>
                <p className="mt-4 text-base leading-7 text-slate-300/70">
                  Paste your TV service login below and StreamBridge shows you exactly what you&apos;ll get — live channels, your content library, everything — before you create an account. No card, no commitment.
                </p>
              </div>
              <ProviderPreviewWidget />
            </AnimatedSection>
          </section>

          <div className="mx-auto max-w-7xl px-8">
            <SectionDivider label="Get started" />
          </div>

          {/* ── Testimonials ──────────────────────────────────────────── */}
          <section id="social-proof" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16" aria-label="Testimonials">
            <AnimatedSection>
              <div className="mx-auto max-w-3xl text-center">
                <p className="eyebrow mb-3">What people say</p>
                <h2 className="text-3xl font-bold text-white sm:text-4xl">
                  Real people. Same TV service. Much better experience.
                </h2>
                <p className="mt-4 text-base leading-7 text-slate-300/70">
                  From parents managing family TV to sports fans who just want it to work — here&apos;s what they say after switching.
                </p>
              </div>
              <AnimatedTestimonials testimonials={testimonials} autoplay className="mt-6" />
            </AnimatedSection>
          </section>

          <div className="mx-auto max-w-7xl px-8">
            <SectionDivider label="Pricing" />
          </div>

          {/* ── Pricing ───────────────────────────────────────────────── */}
          <section id="pricing" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-18" aria-label="Pricing">
            <AnimatedSection>
              <PricingSection
                plans={pricingPlans}
                heading="Simple pricing. No contracts. Cancel anytime."
                description="Start for free — no credit card needed. Upgrade only if you want more TV services or need to set up multiple people."
              />
              <p className="mt-6 text-center text-xs text-slate-400/50">
                No credit card needed to start · Cancel anytime in one click · All plans include a free provider preview
              </p>
            </AnimatedSection>
          </section>

          {/* ── Definition + crawlable testimonials ───────────────────── */}
          <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8" aria-label="About StreamBridge">
            <AnimatedSection>
              <div className="panel-soft p-6 sm:p-8">
                <h2 className="mb-3 text-xl font-bold text-white">What is StreamBridge?</h2>
                <p className="text-base leading-7 text-slate-300/80">
                  StreamBridge connects your TV subscription to Stremio — a clean, modern streaming app that works on your TV, phone, and laptop.
                  Instead of using a clunky app from your TV provider, you get a Netflix-style interface with real artwork, descriptions, and a proper browsing experience.
                  It works with most TV services, takes under 5 minutes to set up, and keeps working automatically even when your provider makes changes.
                </p>
                <div className="mt-8 grid gap-6 sm:grid-cols-3">
                  {testimonials.map(({ name, designation, quote, metric, context }) => (
                    <blockquote key={name} className="rounded-[20px] border border-white/[0.08] bg-white/[0.025] p-5">
                      <p className="text-sm italic leading-6 text-slate-200/80">&ldquo;{quote}&rdquo;</p>
                      <footer className="mt-4">
                        <p className="text-sm font-semibold text-white">{name}</p>
                        <p className="text-xs text-slate-400/70">{designation}</p>
                        {metric && <p className="mt-2 text-xs font-medium text-brand-300">{metric}</p>}
                        {context && <p className="mt-1 text-xs text-slate-400/55">{context}</p>}
                      </footer>
                    </blockquote>
                  ))}
                </div>
              </div>
            </AnimatedSection>
          </section>

          {/* ── FAQ ───────────────────────────────────────────────────── */}
          <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16" aria-label="Frequently asked questions" id="faq">
            <AnimatedSection>
              <div className="mx-auto max-w-3xl">
                <h2 className="mb-10 text-center text-3xl font-bold text-white sm:text-4xl">
                  Frequently asked questions
                </h2>
                <dl className="space-y-6">
                  {[
                    { q: 'What is StreamBridge?', a: "StreamBridge takes your TV subscription and puts it inside Stremio — a clean, modern app that looks and feels like Netflix. Instead of using the app your TV provider gave you, you get a much better viewing experience with proper artwork, descriptions, and browsing. It works on your TV, phone, laptop, and most streaming devices." },
                    { q: 'Will it work on my TV / Fire Stick / iPhone / laptop?', a: "Yes. Stremio works on Smart TVs, Amazon Fire Stick, iPhone, Android, iPad, Windows, Mac, and web browsers. Once StreamBridge connects your TV service, you can watch on any of these devices — all from the same account." },
                    { q: 'Do I need any technical knowledge to set this up?', a: "No. You just need your TV service login details (the username and password you use to log in to your TV provider). StreamBridge walks you through the rest. Most people are up and watching in under 5 minutes." },
                    { q: 'Can I try it before paying?', a: "Yes — you can test your TV service for free before creating an account. Just paste your login details into the preview tool above and StreamBridge shows you your channels and content. No credit card needed." },
                    { q: 'What if my TV service goes down or changes?', a: "StreamBridge automatically switches to a backup source if your main one has a problem. Your setup stays the same — you don't need to reinstall anything or do anything manually. You'll also get an alert before your service expires." },
                    { q: 'Why do my shows look wrong or have missing artwork?', a: "TV services often have poorly labelled content that doesn't match the standard TV databases. StreamBridge automatically fixes this — matching your shows and movies to the correct artwork, descriptions, and ratings so everything looks right in Stremio." },
                    { q: 'Can I cancel anytime?', a: "Yes. There are no contracts and no lock-in. You can cancel your StreamBridge plan at any time with one click. Your TV service is unaffected — StreamBridge is just the bridge between it and Stremio." },
                  ].map(({ q, a }) => (
                    <div key={q} className="panel-soft p-5 sm:p-6">
                      <dt className="mb-2 text-base font-bold text-white">{q}</dt>
                      <dd className="text-sm leading-6 text-slate-300/75">{a}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </AnimatedSection>
          </section>

          {/* ── Comparison ────────────────────────────────────────────── */}
          <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8" aria-label="StreamBridge vs your TV provider's own app">
            <AnimatedSection>
              <div className="mx-auto max-w-3xl">
                <h2 className="mb-6 text-center text-2xl font-bold text-white">StreamBridge vs. your TV provider&apos;s own app</h2>
                <div className="overflow-x-auto rounded-[20px] border border-white/[0.08]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.08] bg-white/[0.03]">
                        <th className="px-5 py-3 text-left font-semibold text-slate-300/70"> </th>
                        <th className="px-5 py-3 text-left font-semibold text-brand-300">StreamBridge + Stremio</th>
                        <th className="px-5 py-3 text-left font-semibold text-slate-400/70">Your provider&apos;s app</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {[
                        ['Interface', 'Clean, modern — like Netflix', 'Clunky, outdated'],
                        ['Try before you pay', 'Free preview, no card needed', 'Pay first, hope for the best'],
                        ['Show artwork & descriptions', 'Automatic, looks great', 'Often missing or wrong'],
                        ['If service goes down', 'Switches automatically', 'You have to fix it yourself'],
                        ['Works on your devices', 'TV, phone, laptop, tablet', 'Often limited devices'],
                        ['Setup & maintenance', 'Once, then forget it', 'Breaks when anything changes'],
                      ].map(([feat, sb, manual]) => (
                        <tr key={feat} className="bg-white/[0.015]">
                          <td className="px-5 py-3 font-medium text-slate-200/80">{feat}</td>
                          <td className="px-5 py-3 text-slate-200/75">{sb}</td>
                          <td className="px-5 py-3 text-slate-400/60">{manual}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </AnimatedSection>
          </section>

          {/* ── CTA ───────────────────────────────────────────────────── */}
          <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24" aria-label="Call to action">
            <AnimatedSection>
              <div className="panel overflow-hidden p-8 sm:p-10 lg:p-12">
                <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <p className="eyebrow mb-3">Start watching today</p>
                    <h2 className="text-3xl font-bold text-white sm:text-4xl">
                      Your TV subscription deserves a better app.
                    </h2>
                    <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300/70">
                      Try your TV service for free, see your channels, and start watching in Stremio in under 5 minutes. No credit card. No commitment. Cancel anytime.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
                    <div className="flex flex-col gap-1">
                      <ShimmerButton className="text-sm font-semibold" onClick={() => (window.location.href = '/signup')}>
                        Start Watching Free <ArrowRight className="ml-1 inline-block h-4 w-4" />
                      </ShimmerButton>
                      <p className="text-center text-[11px] text-slate-400/50">No card needed · Cancel anytime</p>
                    </div>
                    <GlowButton size="md" onClick={() => (window.location.href = '/login')}>
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
            <span>Your TV subscription, in a Netflix-style app. Works on any device.</span>
          </div>
        </footer>
      </div>
    </ParallaxCosmicBackground>
  )
}
