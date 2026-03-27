import * as React from 'react';
import { cn } from '../../lib/utils';

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'flex h-11 w-full rounded-2xl border border-white/10 bg-surface-900/80 px-4 py-3 text-sm text-white placeholder:text-slate-400/55 transition-all duration-200 focus:outline-none focus:border-brand-500/40 focus:shadow-[0_0_0_3px_rgba(20,145,255,0.15)] disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };
