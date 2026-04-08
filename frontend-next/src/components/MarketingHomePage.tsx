'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileText,
  Film,
  MonitorPlay,
  ShieldCheck,
} from 'lucide-react'
import BrandMark from '@/components/BrandMark'
import AnnouncementBanner from '@/components/sera/AnnouncementBanner'
import NumberTicker from '@/components/sera/NumberTicker'
import ProviderPreviewWidget from '@/components/ProviderPreviewWidget'
import ParallaxCosmicBackground from '@/components/ui/parallax-cosmic-background'
import { PricingSection } from '@/components/ui/pricing-section'
import {
  MobileNav, MobileNavHeader, MobileNavMenu, MobileNavToggle,
  NavBody, NavItems, Navbar, NavbarButton,
} from '@/components/ui/resizable-navbar'
import { Badge } from '@/components/ui/badge'
import { blogAPI } from '@/utils/api'
import type { BlogPost } from '@/lib/blog'

const marketingNavItems = [
  { name: 'Features', link: '#features' },
  { name: 'How it works', link: '#workflow' },
  { name: 'Preview', link: '#preview' },
  { name: 'Blog', link: '/blog' },
]

const pillars = [
  {
    title: 'Private addon URL per account',
    copy: 'Each account gets its own install link, so provider routing and metadata stay isolated.',
    icon: ShieldCheck,
  },
  {
    title: 'Better catalog presentation',
    copy: 'Movies, series, live TV, and artwork look cleaner once your provider is routed through StreamBridge.',
    icon: Film,
  },
  {
    title: 'One install path for every device',
    copy: 'Copy the addon URL once or open it directly in Stremio and use the same setup across your screens.',
    icon: MonitorPlay,
  },
]

const workflow = [
  {
    step: '01',
    title: 'Create your account',
    copy: 'Start with email and password. No extra setup is required before testing the service.',
  },
  {
    step: '02',
    title: 'Connect your provider',
    copy: 'Add your provider details and let StreamBridge validate the host, catalog, and account status.',
  },
  {
    step: '03',
    title: 'Install the addon',
    copy: 'Use the personal addon page to copy the private URL into Stremio and start watching.',
  },
]

const proofPoints = [
  'Provider checks before you commit to the setup',
  'Private addon install URL tied to your account',
  'Cleaner metadata and a better viewing surface in Stremio',
]

const pricingPlans = [
  {
    name: 'Starter',
    info: 'Single-user setup',
    price: { monthly: 9, yearly: 90 },
    features: [
      '1 personal setup',
      'Up to 2 providers',
      'Private addon URL',
      'Metadata cleanup',
    ],
    cta: 'Create account',
    href: '/signup',
  },
  {
    name: 'Power',
    info: 'Households and backups',
    price: { monthly: 19, yearly: 190 },
    features: [
      'Up to 5 providers',
      'Fallback-ready routing',
      'Expiry visibility',
      'Priority support',
    ],
    cta: 'Start now',
    href: '/signup',
    highlighted: true,
  },
  {
    name: 'Operator',
    info: 'Shared environments',
    price: { monthly: 39, yearly: 390 },
    features: [
      '10 providers',
      'Multiple installs',
      'Admin handoff',
      'Early feature access',
    ],
    cta: 'Talk to us',
    href: '/signup',
  },
]

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay, duration: 0.45, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
}

export default function MarketingHomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [featuredPosts, setFeaturedPosts] = useState<BlogPost[]>([])

  useEffect(() => {
    blogAPI.listFeatured(3)
      .then((res) => setFeaturedPosts(Array.isArray(res.data) ? res.data : []))
      .catch(() => setFeaturedPosts([]))
  }, [])

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
              <NavbarButton as={Link} href="/blog" variant="secondary">Blog</NavbarButton>
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
                onClick={() => setMobileMenuOpen((value) => !value)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.12] bg-surface-900/80 text-white transition hover:bg-surface-800/90"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              >
                <MobileNavToggle isOpen={mobileMenuOpen} />
              </button>
            </MobileNavHeader>
            <MobileNavMenu isOpen={mobileMenuOpen}>
              {marketingNavItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.link}
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full rounded-2xl px-4 py-3 text-sm font-medium text-slate-200/78 transition hover:bg-white/[0.06] hover:text-white"
                >
                  {item.name}
                </Link>
              ))}
              <div className="grid w-full gap-2 border-t border-white/[0.08] pt-3">
                <NavbarButton as={Link} href="/login" variant="secondary" className="w-full justify-center">Login</NavbarButton>
                <NavbarButton as={Link} href="/signup" variant="gradient" className="w-full justify-center">Create account</NavbarButton>
              </div>
            </MobileNavMenu>
          </MobileNav>
        </Navbar>

        <main>
          <section className="relative overflow-hidden border-b border-white/[0.08] pt-24">
            <div className="relative mx-auto grid min-h-[calc(100svh-6rem)] max-w-7xl gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-20 lg:px-8 lg:py-20">
              <div className="max-w-2xl">
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.35 }}
                  className="mb-6"
                >
                  <AnnouncementBanner badge="Now live">
                    IPTV access inside a cleaner Stremio workflow
                  </AnnouncementBanner>
                </motion.div>

                <motion.p
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  custom={0.08}
                  className="text-[11px] font-semibold uppercase tracking-[0.26em] text-sky-100/45"
                >
                  StreamBridge
                </motion.p>
                <motion.h1
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  custom={0.14}
                  className="hero-display mt-2 max-w-[12ch]"
                >
                  Your provider. Better app. Less friction.
                </motion.h1>
                <motion.p
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  custom={0.2}
                  className="hero-support mt-6 max-w-xl"
                >
                  StreamBridge turns your provider access into a private Stremio addon URL, cleans up the catalog
                  presentation, and gives you a simpler install flow across TV, laptop, and phone.
                </motion.p>

                <motion.div
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  custom={0.28}
                  className="mt-8 flex flex-col gap-3 sm:flex-row"
                >
                  <Link href="/signup" className="btn-primary justify-center sm:w-auto">
                    Create account
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link href="/login" className="btn-secondary justify-center sm:w-auto">
                    I already have an account
                  </Link>
                  <Link href="/how-it-works" className="btn-secondary justify-center sm:w-auto">
                    Setup guide
                  </Link>
                </motion.div>

                <motion.div
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  custom={0.34}
                  className="mt-10 flex items-center gap-6 border-t border-white/[0.08] pt-8"
                >
                  <div>
                    <p className="text-2xl font-bold text-cyan-200">Private</p>
                    <p className="mt-1 text-xs leading-5 text-slate-300/55">Per-user addon link</p>
                  </div>
                  <div>
                    <NumberTicker value={5} suffix=" min" duration={1200} className="text-2xl font-bold text-white" />
                    <p className="mt-1 text-xs leading-5 text-slate-300/55">Typical setup time</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">Any device</p>
                    <p className="mt-1 text-xs leading-5 text-slate-300/55">TV, phone, laptop</p>
                  </div>
                </motion.div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.45 }}
                className="relative"
              >
                <div className="relative overflow-hidden rounded-[34px] border border-white/[0.12] bg-[linear-gradient(180deg,rgba(8,16,31,0.74),rgba(8,16,31,0.92))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl sm:p-7">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="metric-label mb-2">Install snapshot</p>
                      <h2 className="text-2xl font-bold text-white">What the setup gives you</h2>
                    </div>
                    <Badge variant="success">Ready</Badge>
                  </div>

                  <div className="rounded-2xl border border-white/[0.08] bg-surface-950/70 p-5">
                    <div className="space-y-3">
                      {proofPoints.map((point) => (
                        <div key={point} className="flex items-start gap-3 text-sm leading-6 text-slate-200/78">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />
                          <span>{point}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 sm:grid-cols-3">
                    {[
                      { label: 'Provider status', value: 'Checked' },
                      { label: 'Addon URL', value: 'Private' },
                      { label: 'Playback target', value: 'Stremio' },
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400/65">{item.label}</p>
                        <p className="mt-1 text-lg font-bold text-white">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>
          </section>

          <section id="features" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow mb-3">Why it exists</p>
              <h2 className="text-3xl font-bold text-white sm:text-4xl">
                StreamBridge focuses on the actual bottlenecks: provider routing, addon install, and catalog quality.
              </h2>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {pillars.map(({ title, copy, icon: Icon }) => (
                <div key={title} className="panel-soft h-full p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.04]">
                    <Icon className="h-5 w-5 text-brand-300" />
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-white">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-300/70">{copy}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="workflow" className="bg-white/[0.015]">
            <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:grid lg:grid-cols-[0.8fr_1.2fr] lg:gap-14 lg:px-8 lg:py-20">
              <div>
                <p className="eyebrow mb-3">How it works</p>
                <h2 className="text-3xl font-bold text-white sm:text-4xl">
                  Three steps. No maze of marketing sections.
                </h2>
                <p className="mt-4 text-base leading-7 text-slate-300/70">
                  Create an account, add your provider, install the private addon URL in Stremio.
                </p>
              </div>

              <ol className="mt-10 grid gap-4 lg:mt-0" role="list">
                {workflow.map((item) => (
                  <li
                    key={item.step}
                    className="grid gap-4 rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-5 sm:grid-cols-[auto_1fr] sm:items-start sm:p-6"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm font-bold text-white">
                      {item.step}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300/70">{item.copy}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section id="preview" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-18">
            <div className="mx-auto mb-8 max-w-3xl text-center">
              <p className="eyebrow mb-3">Preview</p>
              <h2 className="text-3xl font-bold text-white sm:text-4xl">
                Validate the provider before you go deeper.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-300/70">
                The preview tool gives you a quick confidence check before you start configuring the rest of the account.
              </p>
            </div>
            <ProviderPreviewWidget />
          </section>

          <section className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:px-8">
            <div className="panel-soft p-6">
              <p className="eyebrow mb-3">Need the walkthrough?</p>
              <h2 className="text-2xl font-bold text-white">Use the setup guide.</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300/72">
                The guide page covers account creation, provider connection, addon installation, and when to rotate the private URL.
              </p>
              <Link href="/how-it-works" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-200">
                Open setup guide
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>

            <div className="panel-soft p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="eyebrow mb-3">Blog</p>
                  <h2 className="text-2xl font-bold text-white">Recent notes and setup posts.</h2>
                </div>
                <Link href="/blog" className="text-sm font-semibold text-brand-200">View all</Link>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {featuredPosts.map((post) => (
                  <Link
                    key={post.slug}
                    href={`/blog/${post.slug}`}
                    className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-5 transition hover:border-white/[0.16] hover:bg-white/[0.045]"
                  >
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400/70">
                      <FileText className="h-3.5 w-3.5" />
                      {post.read_time || 'Guide'}
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-white">{post.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-300/72">{post.description}</p>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
            <PricingSection
              plans={pricingPlans}
              heading="Simple pricing for a cleaner setup."
              description="Keep the plans straightforward and move quickly from provider credentials to playback."
            />
          </section>

          <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-20">
            <div className="panel overflow-hidden p-8 sm:p-10 lg:p-12">
              <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <p className="eyebrow mb-3">Start here</p>
                  <h2 className="text-3xl font-bold text-white sm:text-4xl">
                    Build the account, test the provider, install the addon.
                  </h2>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300/70">
                    Get to a working setup quickly, then use the guide and blog only when you need the extra detail.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
                  <Link href="/signup" className="btn-primary justify-center">
                    Create account
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link href="/blog" className="btn-secondary justify-center">
                    Read blog
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t border-white/[0.08]">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 text-sm text-slate-400/60 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <span>StreamBridge</span>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/how-it-works" className="transition hover:text-white">How it works</Link>
              <Link href="/blog" className="transition hover:text-white">Blog</Link>
              <Link href="/login" className="transition hover:text-white">Login</Link>
            </div>
          </div>
        </footer>
      </div>
    </ParallaxCosmicBackground>
  )
}
