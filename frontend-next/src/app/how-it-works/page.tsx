import Link from 'next/link'
import { ArrowRight, CheckCircle2, Copy, ExternalLink, ShieldCheck } from 'lucide-react'

const steps = [
  {
    title: 'Create your account',
    copy: 'Start with a normal StreamBridge account so your provider settings and addon token stay tied to you.',
  },
  {
    title: 'Add your provider',
    copy: 'Enter the provider host, username, and password from the dashboard. StreamBridge validates the connection and surfaces status issues early.',
  },
  {
    title: 'Open your addon page',
    copy: 'Once the provider is connected, go to the personal addon page to get the account-specific manifest URL.',
  },
  {
    title: 'Install in Stremio',
    copy: 'Use the direct install button or copy the URL into Stremio. That is the final step for playback.',
  },
]

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-surface-950">
      <main className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="panel overflow-hidden p-8 sm:p-10">
          <p className="eyebrow mb-3">Setup guide</p>
          <h1 className="text-4xl font-bold text-white sm:text-5xl">How to get from account to playback.</h1>
          <p className="hero-copy mt-4 max-w-3xl">
            This page replaces the scattered explanations from the landing page with one direct walkthrough.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="btn-primary justify-center sm:w-auto">
              Create account
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/blog" className="btn-secondary justify-center sm:w-auto">
              Read setup posts
            </Link>
          </div>
        </div>

        <section className="mt-8 grid gap-4">
          {steps.map((step, index) => (
            <div key={step.title} className="panel-soft grid gap-4 p-6 sm:grid-cols-[auto_1fr]">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm font-bold text-white">
                0{index + 1}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{step.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300/72">{step.copy}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="panel-soft p-6">
            <div className="flex items-center gap-3">
              <Copy className="h-5 w-5 text-brand-300" />
              <h2 className="text-xl font-bold text-white">What to copy</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300/72">
              The addon page gives you one private manifest URL. That is the link you copy into Stremio. If the URL is ever shared accidentally, regenerate it from the same page.
            </p>
          </div>

          <div className="panel-soft p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-brand-300" />
              <h2 className="text-xl font-bold text-white">When to rotate it</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300/72">
              Rotate the addon URL only when you think it was exposed. Rotation invalidates the old route immediately and requires reinstalling the new one in Stremio.
            </p>
          </div>
        </section>

        <section className="mt-8 panel-soft p-6">
          <h2 className="text-xl font-bold text-white">Quick checks before you blame playback</h2>
          <div className="mt-4 grid gap-3">
            {[
              'Provider credentials are correct and the provider is online.',
              'The addon URL starts with your deployed domain and not a local development host.',
              'You are installing the latest addon URL if you have regenerated the token before.',
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 text-sm leading-6 text-slate-300/72">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />
                <span>{item}</span>
              </div>
            ))}
          </div>
          <Link href="/blog/getting-started-with-streambridge" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-200">
            Read the detailed getting started post
            <ExternalLink className="h-4 w-4" />
          </Link>
        </section>
      </main>
    </div>
  )
}
