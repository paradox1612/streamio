'use client'

import React from 'react'

interface GlowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg'
}

const sizes = {
  sm: 'h-9 px-5 text-sm',
  md: 'h-11 px-8 text-base',
  lg: 'h-[52px] px-10 text-lg',
}

export default function GlowButton({ children, onClick, disabled, className = '', type = 'button', size = 'md', ...props }: GlowButtonProps) {
  return (
    <button
      type={type as 'button' | 'submit' | 'reset'}
      onClick={onClick}
      disabled={disabled}
      className={`relative cursor-pointer rounded-2xl border-none p-[1.5px] transition-transform duration-300 ease-in-out hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${className}`}
      style={{ background: 'radial-gradient(circle 80px at 80% -10%, #ffffff22, #0d1628)' }}
      {...props}
    >
      <div className="absolute top-0 right-0 h-[60%] w-[65%] rounded-[120px] -z-10" style={{ boxShadow: '0 0 30px rgba(20,145,255,0.35)' }} />
      <div
        className="absolute bottom-0 left-0 h-full w-[70px] rounded-2xl"
        style={{
          boxShadow: '-10px 10px 30px rgba(20,145,255,0.18)',
          background: 'radial-gradient(circle 60px at 0% 100%, #7bc2ff, rgba(20,145,255,0.6), transparent)',
        }}
      />
      <div
        className={`relative z-20 flex items-center justify-center overflow-hidden rounded-[14px] gap-2 font-semibold text-white ${sizes[size]}`}
        style={{ background: 'radial-gradient(circle 80px at 80% -50%, #334, #060b17)' }}
      >
        <div
          className="absolute top-0 left-0 h-full w-full rounded-[14px]"
          style={{ background: 'radial-gradient(circle 60px at 0% 100%, rgba(123,194,255,0.1), rgba(20,145,255,0.07), transparent)' }}
        />
        <span className="relative z-10 whitespace-nowrap flex items-center gap-2">{children}</span>
      </div>
    </button>
  )
}
