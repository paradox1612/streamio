'use client'

import React, { useState, useEffect } from 'react'

const gridCss = `
  @keyframes sb-grid-move {
    0%   { background-position: 0 0; }
    100% { background-position: 80px 80px; }
  }
`

interface GridBackgroundProps {
  children?: React.ReactNode
  className?: string
}

export default function GridBackground({ children, className = '' }: GridBackgroundProps) {
  const [mouse, setMouse] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setMouse({ x: e.clientX - window.innerWidth / 2, y: e.clientY - window.innerHeight / 2 })
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <style>{gridCss}</style>
      <div
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(20,145,255,0.07) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(20,145,255,0.07) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          animation: 'sb-grid-move 24s linear infinite',
          transform: `translate(${mouse.x / 40}px, ${mouse.y / 40}px)`,
          transition: 'transform 0.3s ease-out',
        }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          width: '60vmin', height: '60vmin',
          background: 'radial-gradient(circle, rgba(20,145,255,0.12) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
