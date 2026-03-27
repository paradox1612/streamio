import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-white/10 bg-white/[0.06] text-slate-100',
        success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
        warning: 'border-amber-400/20 bg-amber-400/10 text-amber-100',
        danger: 'border-red-400/20 bg-red-400/10 text-red-100',
        brand: 'border-brand-400/20 bg-brand-400/10 text-brand-100',
        outline: 'border-white/10 bg-transparent text-slate-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
