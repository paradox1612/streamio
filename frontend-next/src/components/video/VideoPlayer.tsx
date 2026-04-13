'use client'

import React, { useEffect, useRef } from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import { Monitor, AlertCircle, Laptop, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface VideoPlayerProps {
  src: string
  type?: string
  title?: string
  onClose?: () => void
  onProgress?: (pct: number) => void
  onEnd?: () => void
}

export default function VideoPlayer({ src, type, title, onProgress, onEnd }: VideoPlayerProps) {
  const videoRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<ReturnType<typeof videojs> | null>(null)
  const lowerSrc = src.toLowerCase()
  const isNativeOnly =
    lowerSrc.endsWith('.mkv') ||
    lowerSrc.endsWith('.avi') ||
    lowerSrc.endsWith('.ts') ||
    lowerSrc.includes('/live/')

  useEffect(() => {
    if (isNativeOnly || !videoRef.current) return

    const videoElement = document.createElement('video-js')
    videoElement.classList.add('vjs-big-play-centered', 'vjs-theme-city')
    videoRef.current.appendChild(videoElement)

    const player = playerRef.current = videojs(videoElement, {
      autoplay: true,
      controls: true,
      responsive: true,
      fluid: true,
      sources: [{
        src,
        type: type || (src.includes('.ts') || src.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4')
      }]
    })

    // Progress tracking
    const interval = setInterval(() => {
      if (player && !player.paused()) {
        const currentTime = player.currentTime()
        const duration = player.duration()
        if (typeof duration === 'number' && duration > 0 && typeof currentTime === 'number') {
          const pct = Math.floor((currentTime / duration) * 100)
          onProgress?.(pct)
        }
      }
    }, 30000) // Every 30s

    player.on('ended', () => {
      onEnd?.()
    })

    return () => {
      clearInterval(interval)
      if (player && !player.isDisposed()) {
        player.dispose()
        playerRef.current = null
      }
    }
  }, [src, type, isNativeOnly, onEnd, onProgress])

  const openInIINA = () => window.open(`iina://weblink?url=${encodeURIComponent(src)}`)
  const openInVLC = () => window.open(`vlc://${src.replace(/^https?:\/\//, '')}`)
  const openInInfuse = () => window.open(`infuse://address/${src.replace(/^https?:\/\//, '')}`)

  return (
    <div className="flex flex-col gap-4">
      {isNativeOnly ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] p-12 text-center">
          <AlertCircle className="mb-4 h-12 w-12 text-amber-400" />
          <h3 className="text-xl font-bold text-white">Native Player Required</h3>
          <p className="mt-2 max-w-md text-slate-400">
            This stream uses a format ({src.split('.').pop()?.toUpperCase()}) that browsers cannot play natively. 
            Launch it in a high-performance player instead.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button onClick={openInIINA} className="bg-sky-500 hover:bg-sky-600">
              <Laptop className="mr-2 h-4 w-4" /> IINA (Mac)
            </Button>
            <Button onClick={openInVLC} className="bg-orange-500 hover:bg-orange-600">
              <Monitor className="mr-2 h-4 w-4" /> VLC (All)
            </Button>
            <Button onClick={openInInfuse} className="bg-rose-500 hover:bg-rose-600">
              <Smartphone className="mr-2 h-4 w-4" /> Infuse (iOS/Mac)
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div data-vjs-player>
            <div ref={videoRef} className="overflow-hidden rounded-2xl shadow-2xl" />
          </div>
          
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/5 bg-white/[0.03] p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Playing in Browser</p>
              <h4 className="mt-1 font-medium text-white">{title || 'Stream'}</h4>
            </div>
            
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={openInIINA} className="h-8 text-[11px]">
                Open in IINA
              </Button>
              <Button variant="outline" size="sm" onClick={openInVLC} className="h-8 text-[11px]">
                Open in VLC
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
