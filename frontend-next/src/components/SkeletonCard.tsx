import React from 'react'

interface SkeletonCardProps {
  count?: number
  type?: 'stat' | 'provider' | 'vod'
}

export default function SkeletonCard({ count = 1, type = 'stat' }: SkeletonCardProps) {
  if (type === 'stat') {
    return <>{Array.from({ length: count }).map((_, i) => <div key={i} className="skeleton h-32" />)}</>
  }
  if (type === 'provider') {
    return <>{Array.from({ length: count }).map((_, i) => <div key={i} className="skeleton h-48" />)}</>
  }
  if (type === 'vod') {
    return <>{Array.from({ length: count }).map((_, i) => <div key={i} className="skeleton aspect-[2/3]" />)}</>
  }
  return <div className="skeleton h-20" />
}
