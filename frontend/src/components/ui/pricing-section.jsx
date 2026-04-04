import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from './button';
import { cn } from '../../lib/utils';

const frequencies = ['monthly', 'yearly'];

function savingsLabel(monthly, yearly) {
  if (!monthly || !yearly) return null;
  const yearlyAsMonthly = yearly / 12;
  const savings = Math.round(((monthly - yearlyAsMonthly) / monthly) * 100);
  return savings > 0 ? `${savings}% off` : null;
}

function PricingFrequencyToggle({ frequency, setFrequency }) {
  return (
    <div className="mx-auto inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-xl">
      {frequencies.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => setFrequency(value)}
          className="relative overflow-hidden rounded-full px-5 py-2 text-sm font-semibold capitalize text-slate-300 transition"
        >
          {frequency === value && (
            <motion.span
              layoutId="pricing-frequency"
              transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }}
              className="absolute inset-0 rounded-full bg-white text-surface-950"
            />
          )}
          <span className={cn('relative z-10', frequency === value && 'text-surface-950')}>
            {value}
          </span>
        </button>
      ))}
    </div>
  );
}

function PricingCard({ plan, frequency }) {
  const savings = frequency === 'yearly'
    ? savingsLabel(plan.price.monthly, plan.price.yearly)
    : null;

  return (
    <div
      className={cn(
        'relative flex h-full flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,23,39,0.86),rgba(8,14,28,0.92))] shadow-[0_28px_90px_rgba(0,0,0,0.32)] backdrop-blur-2xl',
        plan.highlighted && 'border-brand-300/35 bg-[linear-gradient(180deg,rgba(24,41,72,0.88),rgba(7,14,27,0.96))]'
      )}
    >
      {plan.highlighted && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(123,194,255,0.18),transparent_40%)]" />
          <motion.div
            aria-hidden="true"
            className="absolute inset-x-[14%] top-0 h-px bg-gradient-to-r from-transparent via-brand-200 to-transparent"
            animate={{ opacity: [0.35, 1, 0.35], scaleX: [0.9, 1, 0.9] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </>
      )}

      <div className="relative border-b border-white/8 p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-white">{plan.name}</p>
            <p className="mt-1 text-sm text-slate-300/62">{plan.info}</p>
          </div>
          {plan.highlighted && (
            <div className="inline-flex items-center gap-1 rounded-full border border-brand-200/35 bg-brand-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-100">
              <Sparkles className="h-3.5 w-3.5" />
              Popular
            </div>
          )}
        </div>

        <div className="flex items-end gap-2">
          <span className="text-4xl font-bold text-white">${plan.price[frequency]}</span>
          <span className="pb-1 text-sm text-slate-300/55">
            /{frequency === 'monthly' ? 'month' : 'year'}
          </span>
        </div>

        <div className="mt-4 flex min-h-6 items-center gap-2">
          {savings ? (
            <span className="rounded-full bg-emerald-400/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
              {savings}
            </span>
          ) : (
            <span className="text-xs uppercase tracking-[0.16em] text-slate-400/55">
              Flexible monthly billing
            </span>
          )}
        </div>
      </div>

      <div className="relative flex flex-1 flex-col justify-between p-6">
        <ul className="space-y-3" role="list">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-3 text-sm leading-6 text-slate-200/78">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-300" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <Button
          asChild
          variant={plan.highlighted ? 'default' : 'outline'}
          size="lg"
          className="mt-8 w-full"
        >
          <Link to={plan.href}>
            {plan.cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function PricingSection({
  plans,
  heading,
  description,
  className,
}) {
  const [frequency, setFrequency] = React.useState('monthly');

  return (
    <div className={cn('w-full', className)}>
      <div className="mx-auto max-w-3xl text-center">
        <p className="eyebrow mb-3">Subscription model</p>
        <h2 className="text-3xl font-bold text-white sm:text-4xl">{heading}</h2>
        {description && (
          <p className="mt-4 text-base leading-7 text-slate-300/70">{description}</p>
        )}
      </div>

      <div className="mt-8 flex justify-center">
        <PricingFrequencyToggle frequency={frequency} setFrequency={setFrequency} />
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => (
          <PricingCard key={plan.name} plan={plan} frequency={frequency} />
        ))}
      </div>
    </div>
  );
}
