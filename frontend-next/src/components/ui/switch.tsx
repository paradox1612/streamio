'use client'

import React from 'react'
import { motion } from 'framer-motion'

interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

export function Switch({ checked, onCheckedChange, disabled, className = '' }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-brand-500' : 'bg-white/10'
      } ${className}`}
    >
      <motion.span
        initial={false}
        animate={{ x: checked ? 20 : 4 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0"
      />
    </button>
  )
}
