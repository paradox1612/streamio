'use client'

import React from 'react'

const shimmerCss = `
  @property --sb-angle {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
  }
  @keyframes sb-shimmer-spin {
    to { --sb-angle: 360deg; }
  }
`

interface ShimmerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
}

export default function ShimmerButton({ children, onClick, disabled, className = '', type = 'button', ...props }: ShimmerButtonProps) {
  return (
    <button
      type={type as 'button' | 'submit' | 'reset'}
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex items-center justify-center p-[1.5px] rounded-full overflow-hidden cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-transform duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${className}`}
      {...props}
    >
      <style>{shimmerCss}</style>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'conic-gradient(from var(--sb-angle), transparent 20%, #1491ff, #7bc2ff, transparent 50%)',
          animation: 'sb-shimmer-spin 2.5s linear infinite',
        }}
      />
      <span
        className="relative z-10 inline-flex items-center justify-center gap-2 w-full h-full px-6 py-3 text-white font-semibold rounded-full transition-colors duration-300"
        style={{ background: 'linear-gradient(180deg,#0d1628 0%,#050816 100%)' }}
      >
        {children}
      </span>
    </button>
  )
}
