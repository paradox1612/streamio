import React, { useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import {
  ArrowRight, Server, Film, ShieldCheck, CheckCircle2, Signal, MonitorPlay,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/ui/badge';
import BrandMark from '../components/BrandMark';
import Seo, { SITE_URL } from '../components/Seo';

// ── Sera UI components ──────────────────────────────────────────────────────
import ShimmerButton         from '../components/sera/ShimmerButton';
import GlowButton            from '../components/sera/GlowButton';
import NumberTicker          from '../components/sera/NumberTicker';
import AnnouncementBanner    from '../components/sera/AnnouncementBanner';
import SectionDivider        from '../components/sera/SectionDivider';
import ProviderPreviewWidget from '../components/ProviderPreviewWidget';
import TextRotate from '../components/marketing/TextRotate';
import { AnimatedTestimonials } from '../components/ui/animated-testimonials';
import { Marquee } from '../components/ui/marquee';
import ThreeDMarquee from '../components/ui/3d-marquee';
import { PricingSection } from '../components/ui/pricing-section';
import ParallaxCosmicBackground from '../components/ui/parallax-cosmic-background';
import {
  MobileNav,
  MobileNavHeader,
  MobileNavMenu,
  MobileNavToggle,
  NavBody,
  NavItems,
  Navbar,
  NavbarButton,
} from '../components/ui/resizable-navbar';

// ── Data ────────────────────────────────────────────────────────────────────
const pillars = [
  {
    title: 'IPTV for Stremio without a messy install process',
    copy: 'Bring your IPTV provider into Stremio with one private addon link instead of juggling fragile configs and repeat setup steps.',
    icon: Server,
  },
  {
    title: 'A cleaner Stremio IPTV addon for real provider accounts',
    copy: 'StreamBridge is built for people using Xtream, M3U, or portal-based IPTV services who want a simpler way to watch through Stremio.',
    icon: Film,
  },
  {
    title: 'Test, repair, and keep one install link',
    copy: 'Check your provider before signup, repair metadata where needed, and keep one install URL that is easier to trust and reuse.',
    icon: ShieldCheck,
  },
];

const workflow = [
  ['Create your account', 'Start with one workspace built for IPTV users who want to use Stremio.'],
  ['Connect your IPTV provider',   'Paste your IPTV details once and let StreamBridge check that your Stremio setup will work.'],
  ['Install one addon in Stremio',   'Use one private install link instead of juggling separate configs, apps, and repeat setup steps.'],
];

const proofPoints = [
  'Use IPTV in Stremio with one private addon link',
  'Check whether your IPTV provider works before full setup',
  'Keep provider setup, health checks, and install in one place',
];

const providers = [
  { label: 'Xtream Codes', meta: 'Primary auth', mark: 'XC' },
  { label: 'M3U Plus', meta: 'Playlist ingest', mark: 'M3' },
  { label: 'MAC Portal', meta: 'Device routing', mark: 'MP' },
  { label: 'Stremio', meta: 'Addon target', mark: 'ST' },
  { label: 'TMDB', meta: 'Metadata graph', mark: 'TM' },
  { label: 'XML EPG', meta: 'Guide sync', mark: 'EP' },
  { label: 'HLS', meta: 'Adaptive stream', mark: 'HL' },
  { label: 'Catch-up TV', meta: 'Replay windows', mark: 'CU' },
];

const lineupPoints = [
  {
    title: 'Show what IPTV in Stremio actually looks like',
    copy: 'Search traffic will care about the outcome, so the page should show the cleaner Stremio viewing surface before it explains the plumbing.',
    icon: MonitorPlay,
  },
  {
    title: 'Make the promise explicit for both audiences',
    copy: 'The pitch is simple: IPTV users get a better player, and Stremio users get a straightforward way to add IPTV.',
    icon: Signal,
  },
];

const pricingPlans = [
  {
    name: 'Starter',
    info: 'For one personal setup',
    price: { monthly: 9, yearly: 90 },
    features: [
      '1 private addon URL',
      'Up to 2 provider connections',
      'Provider preview and health checks',
      'Metadata repair for live and VOD',
    ],
    cta: 'Start starter plan',
    href: '/signup',
  },
  {
    name: 'Power',
    info: 'For people juggling multiple sources',
    price: { monthly: 19, yearly: 190 },
    features: [
      '5 provider connections with failover',
      'Priority metadata matching queue',
      'Expiry tracking and provider alerts',
      'Faster reinstall and rotation flow',
    ],
    cta: 'Create power account',
    href: '/signup',
    highlighted: true,
  },
  {
    name: 'Operator',
    info: 'For reseller or household bundles',
    price: { monthly: 39, yearly: 390 },
    features: [
      '10 provider connections',
      'Multiple install environments',
      'Shared support and account controls',
      'Early access to routing improvements',
    ],
    cta: 'Talk to operator',
    href: '/signup',
  },
];

const createSvgDataUri = (svg) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

const createPortraitDataUri = ({ name, role, accentFrom, accentTo }) => {
  const initials = name.split(' ').map((part) => part[0]).join('').slice(0, 2);
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
  `);
};

const createLineupCardUri = ({ title, genre, toneA, toneB, badge }) => createSvgDataUri(`
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
`);

const testimonials = [
  {
    name: 'Damon Reed',
    designation: 'Runs a three-provider sports stack',
    quote: 'The addon stopped feeling fragile. I swap providers, keep one private install URL, and my lineup still looks deliberate instead of patched together.',
    metric: '41% fewer manual reinstall steps',
    context: 'Moved from separate live and VOD fixes into one account workspace.',
    src: createPortraitDataUri({
      name: 'Damon Reed',
      role: 'Sports stack operator',
      accentFrom: '#0f4c81',
      accentTo: '#3ca6ff',
    }),
  },
  {
    name: 'Maya Sullivan',
    designation: 'Maintains family IPTV access',
    quote: 'The preview flow sold it. I could test credentials, see the channels, and trust the install before touching the final addon URL.',
    metric: '10 second provider preview',
    context: 'Used provider preview to validate latency and metadata before signup.',
    src: createPortraitDataUri({
      name: 'Maya Sullivan',
      role: 'Household organizer',
      accentFrom: '#074b5c',
      accentTo: '#10b0d8',
    }),
  },
  {
    name: 'Ibrahim Khan',
    designation: 'Reseller managing provider rotation',
    quote: 'The routing and health checks are the difference. When a host goes sideways, I can recover without rebuilding the experience for everyone downstream.',
    metric: 'Auto failover kept playback online',
    context: 'Uses account-level monitoring to catch expiring routes before users do.',
    src: createPortraitDataUri({
      name: 'Ibrahim Khan',
      role: 'Provider operator',
      accentFrom: '#2e4d8f',
      accentTo: '#7bc2ff',
    }),
  },
];

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
];

const marketingNavItems = [
  { name: 'Features', link: '#features' },
  { name: 'Workflow', link: '#workflow' },
  { name: 'Preview', link: '#preview' },
  { name: 'Pricing', link: '#pricing' },
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
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const landingSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'StreamBridge',
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web',
    description: 'Private Stremio addon management for IPTV providers with provider routing, health checks, metadata repair, and install-ready account URLs.',
    keywords: 'IPTV for Stremio, Stremio IPTV addon, IPTV in Stremio',
    url: SITE_URL,
    offers: [
      { '@type': 'Offer', price: '9', priceCurrency: 'USD', name: 'Starter' },
      { '@type': 'Offer', price: '19', priceCurrency: 'USD', name: 'Power' },
      { '@type': 'Offer', price: '39', priceCurrency: 'USD', name: 'Operator' },
    ],
  };

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <Seo
        title="StreamBridge | IPTV for Stremio With One Private Addon"
        description="Use IPTV in Stremio with one private addon link. StreamBridge tests providers, repairs metadata, and gives IPTV and Stremio users a simpler setup flow."
        path="/"
        jsonLd={landingSchema}
      />
      <ParallaxCosmicBackground className="marketing-shell min-h-screen">
        <div className="marketing-chrome">
          <Navbar>
            <NavBody>
              <a href="/" className="min-w-0">
                <BrandMark compact />
              </a>
              <NavItems items={marketingNavItems} />
              <div className="hidden items-center gap-2 md:flex">
                <NavbarButton as={Link} to="/login" variant="secondary">
                  Login
                </NavbarButton>
                <NavbarButton as={Link} to="/signup" variant="gradient">
                  Create account
                </NavbarButton>
              </div>
            </NavBody>

            <MobileNav>
              <MobileNavHeader>
                <a href="/" className="min-w-0">
                  <BrandMark compact />
                </a>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((value) => !value)}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.12] bg-surface-900/80 text-white shadow-[0_10px_30px_rgba(0,0,0,0.28)] transition hover:bg-surface-800/90"
                  aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                  aria-expanded={mobileMenuOpen}
                  aria-controls="mobile-nav-menu"
                >
                  <MobileNavToggle isOpen={mobileMenuOpen} />
                </button>
              </MobileNavHeader>
              <MobileNavMenu isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} id="mobile-nav-menu">
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
                  <NavbarButton as={Link} to="/login" variant="secondary" className="w-full justify-center">
                    Login
                  </NavbarButton>
                  <NavbarButton as={Link} to="/signup" variant="gradient" className="w-full justify-center">
                    Create account
                  </NavbarButton>
                </div>
              </MobileNavMenu>
            </MobileNav>
          </Navbar>

          <main>
            <section className="relative overflow-hidden border-b border-white/[0.08] pt-24" aria-label="Hero">
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-surface-950/5 to-surface-950/60" aria-hidden="true" />

              <div className="relative mx-auto grid min-h-[calc(100svh-6rem)] max-w-7xl gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-20 lg:px-8 lg:py-20">

                  <div className="max-w-2xl">
                    {/* Sera UI – Announcement Banner replaces old Badge kicker */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      className="mb-6"
                    >
                      <AnnouncementBanner badge="New">
                        IPTV for Stremio, without the usual mess
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
                      className="hero-display mt-2 max-w-[13ch]"
                    >
                      <span className="block">Put IPTV</span>
                      <span className="block">
                        <TextRotate
                          words={['into Stremio.', 'in one addon.', 'through a cleaner player.']}
                          className="bg-gradient-to-r from-white via-brand-200 to-cyan-200 bg-clip-text text-transparent"
                        />
                      </span>
                      <span className="block">Keep it simple.</span>
                    </motion.h1>
                    <motion.p
                      variants={fadeUp} initial="hidden" animate="visible" custom={3}
                      className="hero-support mt-6 max-w-xl"
                    >
                      StreamBridge helps you use IPTV in Stremio with one private addon link. Test your provider, connect it once, repair the messy metadata, and stop rebuilding your setup every time something changes.
                    </motion.p>

                    <motion.p
                      variants={fadeUp} initial="hidden" animate="visible" custom={4}
                      className="mt-4 text-sm font-medium leading-6 text-slate-200/78"
                    >
                      Stremio IPTV addon setup for real provider accounts.
                    </motion.p>

                    <motion.div
                      variants={fadeUp} initial="hidden" animate="visible" custom={5}
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
                      variants={fadeUp} initial="hidden" animate="visible" custom={6}
                      className="mt-10 flex items-center gap-6 border-t border-white/[0.08] pt-8"
                    >
                        {[
                        { value: 1,   suffix: '',  label: 'Install link', isNum: true, valueTone: 'text-cyan-200' },
                        { display: 'IPTV + Stremio', label: 'One setup flow' },
                        { value: 91, suffix: '%', label: 'Catalogs matched', isNum: true },
                      ].map(({
                        value, suffix, label, display, isNum, valueTone = 'text-white',
                      }) => (
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

                    {/* Right: hero visual */}
                    <motion.div
                      initial={{ opacity: 0, y: 32, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: 0.18, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                      className="relative"
                    >
                      <div className="absolute inset-x-[8%] top-[8%] h-40 rounded-full bg-brand-500/18 blur-3xl" />
                      <div className="absolute bottom-[8%] right-[4%] h-36 w-36 rounded-full bg-cyan-300/18 blur-3xl" />
                      <div className="relative overflow-hidden rounded-[34px] border border-white/[0.12] bg-[linear-gradient(180deg,rgba(8,16,31,0.74),rgba(8,16,31,0.92))] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl sm:p-7">
                        <div className="mb-5 flex items-start justify-between gap-4">
                          <div>
                            <p className="metric-label mb-2">Your StreamBridge link</p>
                            <h2 className="text-2xl font-bold text-white">One install for Stremio</h2>
                          </div>
                          <Badge variant="success">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            Active
                          </Badge>
                        </div>

                        <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-surface-950/70 px-4 py-3 font-mono text-xs leading-7 text-brand-100/80 sm:text-sm">
                          https://streambridge.app/addon/<wbr />
                          <span className="text-brand-300">acc_x2f9c4f1</span>/manifest.json
                        </div>

                        <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                        <div className="rounded-[26px] border border-white/[0.08] bg-white/[0.03] p-5">
                            <p className="metric-label mb-4">Why people search for this</p>
                            <ul className="space-y-3" role="list">
                              {proofPoints.map((point) => (
                                <li key={point} className="flex items-start gap-3 text-sm leading-6 text-slate-200/78">
                                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-300" />
                                  <span>{point}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="rounded-[26px] border border-white/[0.08] bg-white/[0.03] p-5">
                            <p className="metric-label mb-4">Route health</p>
                            <div className="grid grid-cols-1 gap-4">
                              {[
                                { label: 'Fallback host', value: 'Auto' },
                                { label: 'Catalog recovery', value: '91%' },
                                { label: 'Current mode', value: 'Online' },
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

            <section className="overflow-hidden border-y border-white/[0.06] bg-white/[0.015] py-6" aria-label="Supported providers">
              <div className="mx-auto mb-4 flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
                <p className="eyebrow mb-0">Supported providers</p>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400/55">Pause on hover</p>
              </div>
              <Marquee pauseOnHover repeat={5} className="[--duration:30s]">
                {providers.map((provider) => (
                  <div
                    key={provider.label}
                    className="flex min-w-[220px] items-center gap-4 rounded-[22px] border border-white/[0.08] bg-white/[0.04] px-4 py-3 backdrop-blur-xl"
                  >
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
                  <div
                    key={`${provider.label}-reverse`}
                    className="flex min-w-[220px] items-center gap-4 rounded-[22px] border border-white/[0.08] bg-white/[0.025] px-4 py-3 backdrop-blur-xl"
                  >
                    <div className="h-2.5 w-2.5 rounded-full bg-brand-300 shadow-[0_0_16px_rgba(123,194,255,0.9)]" />
                    <div>
                      <p className="text-sm font-semibold text-white">{provider.label}</p>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400/55">{provider.meta}</p>
                    </div>
                  </div>
                ))}
              </Marquee>
            </section>

            {/* ── Pillars ───────────────────────────────────────────────────── */}
            <section id="features" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24" aria-label="Features">
              <AnimatedSection>
                <div className="mx-auto max-w-2xl text-center">
                  <p className="eyebrow mb-3">Why StreamBridge exists</p>
                  <h2 className="text-3xl font-bold text-white sm:text-4xl">
                    IPTV users want Stremio. Stremio users want IPTV.
                  </h2>
                  <p className="mt-4 text-base leading-7 text-slate-300/70">
                    Most people looking for a Stremio IPTV addon are trying to bridge those two things without adding another clunky player or another fragile config workflow.
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

            <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24" aria-label="Channel lineup preview">
              <div className="grid gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-16">
                <AnimatedSection>
                  <p className="eyebrow mb-3">What the setup becomes</p>
                  <h2 className="text-3xl font-bold text-white sm:text-4xl">
                    The goal is simple: IPTV inside a cleaner Stremio experience.
                  </h2>
                  <p className="mt-4 max-w-xl text-base leading-7 text-slate-300/70">
                    The technical work matters because the outcome matters: one Stremio IPTV addon, cleaner browsing, and less friction every time you need to reinstall or change providers.
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

            {/* ── How it works ──────────────────────────────────────────────── */}
            <section id="workflow" className="bg-white/[0.015]" aria-label="How it works">
              <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:grid lg:grid-cols-[0.75fr_1.25fr] lg:gap-16 lg:px-8 lg:py-24">
                <AnimatedSection>
                  <p className="eyebrow mb-3">How it works</p>
                  <h2 className="text-3xl font-bold text-white sm:text-4xl">
                    Three steps from IPTV login to Stremio addon.
                  </h2>
                  <p className="mt-4 text-base leading-7 text-slate-300/70">
                    Create the account, check the provider, then install one addon in Stremio.
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
            <section id="preview" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16" aria-label="Try your provider">
              <AnimatedSection>
                <div className="mx-auto max-w-3xl text-center mb-8">
                  <p className="eyebrow mb-3">Test it before signing up</p>
                  <h2 className="text-3xl font-bold text-white sm:text-4xl">
                    Check your IPTV provider before you install anything.
                  </h2>
                  <p className="mt-4 text-base leading-7 text-slate-300/70">
                    This is the fastest way to see whether your IPTV login will work as a Stremio IPTV addon before you commit to the full setup.
                  </p>
                </div>
                <ProviderPreviewWidget />
              </AnimatedSection>
            </section>

            {/* Sera UI – Section Divider */}
            <div className="mx-auto max-w-7xl px-8">
              <SectionDivider label="Get started" />
            </div>

            <section id="social-proof" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16" aria-label="Testimonials">
              <AnimatedSection>
                <div className="mx-auto max-w-3xl text-center">
                  <p className="eyebrow mb-3">What users notice</p>
                  <h2 className="text-3xl font-bold text-white sm:text-4xl">
                    The value lands when setup stops feeling fragile.
                  </h2>
                  <p className="mt-4 text-base leading-7 text-slate-300/70">
                    The core pitch is not infrastructure. It is simple: use IPTV in Stremio without the usual mess.
                  </p>
                </div>
                <AnimatedTestimonials testimonials={testimonials} autoplay className="mt-6" />
              </AnimatedSection>
            </section>

            <div className="mx-auto max-w-7xl px-8">
              <SectionDivider label="Pricing" />
            </div>

            <section id="pricing" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-18" aria-label="Pricing">
              <AnimatedSection>
              <PricingSection
                plans={pricingPlans}
                  heading="Choose the plan that fits your IPTV and Stremio setup."
                  description="Start simple if you just want IPTV in Stremio for yourself, then upgrade only if you manage more providers or more people."
              />
              </AnimatedSection>
            </section>

            {/* ── CTA ──────────────────────────────────────────────────────── */}
            <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24" aria-label="Call to action">
              <AnimatedSection>
                <div className="panel overflow-hidden p-8 sm:p-10 lg:p-12">
                  <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div>
                      <p className="eyebrow mb-3">Start now</p>
                      <h2 className="text-3xl font-bold text-white sm:text-4xl">
                        Start with one StreamBridge link for IPTV in Stremio.
                      </h2>
                      <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300/70">
                        Create an account, test your provider, and get one StreamBridge link that turns your IPTV service into a cleaner Stremio setup.
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
              <span>Use IPTV in Stremio with one simpler addon setup</span>
            </div>
          </footer>
        </div>
      </ParallaxCosmicBackground>
    </>
  );
}
