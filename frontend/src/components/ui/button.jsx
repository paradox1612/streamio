import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-950 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-brand-500 text-white shadow-[0_18px_44px_rgba(20,145,255,0.28)] hover:bg-brand-400 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(20,145,255,0.36)] active:translate-y-0',
        destructive:
          'border border-red-400/20 bg-red-500/10 text-red-100 hover:border-red-400/30 hover:bg-red-500/15',
        outline:
          'border border-white/10 bg-white/[0.04] text-slate-100 hover:bg-white/[0.08] hover:border-white/20 hover:-translate-y-0.5 active:translate-y-0',
        secondary:
          'border border-white/10 bg-white/[0.04] text-slate-100 hover:bg-white/[0.08] hover:border-white/20 hover:-translate-y-0.5 active:translate-y-0',
        ghost:
          'text-slate-300 hover:bg-white/[0.06] hover:text-white',
        link: 'text-brand-300 underline-offset-4 hover:underline hover:text-brand-200',
      },
      size: {
        default: 'h-10 px-5 py-2.5',
        sm: 'h-9 px-4 py-2 text-xs',
        lg: 'h-12 px-6 py-3 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
