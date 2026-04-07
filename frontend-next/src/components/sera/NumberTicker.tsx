'use client'

import React, { useEffect, useState, useRef } from 'react'

interface NumberTickerProps {
  value: number
  duration?: number
  delay?: number
  decimalPlaces?: number
  prefix?: string
  suffix?: string
  className?: string
  formatFn?: ((v: number) => string) | null
  onComplete?: () => void
}

export default function NumberTicker({
  value, duration = 1800, delay = 0, decimalPlaces = 0,
  prefix = '', suffix = '', className = '', formatFn = null, onComplete,
}: NumberTickerProps) {
  const [displayValue, setDisplayValue] = useState(0)
  const animIdRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const startTime = performance.now()
      const animate = (now: number) => {
        const elapsed = now - startTime
        const progress = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 4)
        setDisplayValue(value * eased)
        if (progress < 1) {
          animIdRef.current = requestAnimationFrame(animate)
        } else {
          setDisplayValue(value)
          onComplete?.()
        }
      }
      animIdRef.current = requestAnimationFrame(animate)
    }, delay)

    return () => {
      clearTimeout(timeoutId)
      if (animIdRef.current) cancelAnimationFrame(animIdRef.current)
    }
  }, [value, duration, delay, onComplete])

  const formatted = formatFn
    ? formatFn(displayValue)
    : Number(displayValue.toFixed(decimalPlaces)).toLocaleString()

  return (
    <span className={`inline-block tabular-nums ${className}`}>
      {prefix}{formatted}{suffix}
    </span>
  )
}
