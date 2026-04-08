'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Activity, Copy, ExternalLink, Heart, PlayCircle, Server, Tv2 } from 'lucide-react'
import toast from 'react-hot-toast'
import HeroBanner from '@/components/HeroBanner'
import ContentRow from '@/components/ContentRow'
import EmptyState from '@/components/EmptyState'
import SkeletonCard from '@/components/SkeletonCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { freeAccessAPI, homeAPI, providerAPI, userAPI } from '@/utils/api'
import { useAuthStore } from '@/store/auth'

interface Provider {
  id: string
  name: string
  status: string
}

interface HomeMediaItem {
  tmdb_id: number
  title: string
  overview?: string | null
  poster_url?: string | null
  backdrop_url?: string | null
  year?: string | null
  rating?: number | null
  type: 'movie' | 'series'
}

interface ContinueWatchingItem {
  id: string
  raw_title: string
  vod_type?: string | null
  progress_pct?: number | null
  last_watched_at?: string | null
  poster_url?: string | null
  provider_name?: string | null
  category?: string | null
}

interface FavoriteChannelItem {
  id: string
  item_name: string
  poster_url?: string | null
  provider_id?: string | null
  metadata?: { category?: string; streamId?: string }
}

interface HomeSectionsResponse {
  featured: HomeMediaItem | null
  trending_movies: HomeMediaItem[]
  trending_series: HomeMediaItem[]
  continue_watching: ContinueWatchingItem[]
  favorite_channels: FavoriteChannelItem[]
}

function formatLastWatched(value?: string | null) {
  if (!value) return 'Recently watched'
  const then = new Date(value)
  if (Number.isNaN(then.getTime())) return 'Recently watched'
  const diffMs = Date.now() - then.getTime()
  const diffMinutes = Math.max(Math.floor(diffMs / (1000 * 60)), 0)
  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return then.toLocaleDateString()
}

export default function DashboardPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [providers, setProviders] = useState<Provider[]>([])
  const [addonUrl, setAddonUrl] = useState('')
  const [copying, setCopying] = useState(false)
  const [freeAccessStatus, setFreeAccessStatus] = useState<'inactive' | 'active' | 'expired'>('inactive')
  const [sections, setSections] = useState<HomeSectionsResponse>({
    featured: null,
    trending_movies: [],
    trending_series: [],
    continue_watching: [],
    favorite_channels: [],
  })

  useEffect(() => {
    let cancelled = false

    Promise.all([
      homeAPI.getSections(),
      providerAPI.list(),
      userAPI.getAddonUrl(),
      freeAccessAPI.getStatus(),
    ])
      .then(([homeRes, providersRes, addonRes, freeRes]) => {
        if (cancelled) return
        setSections(homeRes.data)
        setProviders(Array.isArray(providersRes.data) ? providersRes.data : [])
        setAddonUrl(addonRes.data?.addonUrl || '')
        setFreeAccessStatus(freeRes.data?.status || 'inactive')
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load home screen')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const hasByoProviders = Boolean(user?.has_byo_providers)
  const canUseLiveTv = Boolean((user as typeof user & { can_use_live_tv?: boolean })?.can_use_live_tv)

  const continueWatchingItems = useMemo(
    () =>
      sections.continue_watching.map((item) => ({
        id: item.id,
        title: item.raw_title,
        subtitle: item.provider_name || item.category || 'Continue watching',
        image: item.poster_url,
        href: '/vod',
        progress: Number(item.progress_pct || 0),
        badge: item.vod_type || 'VOD',
        meta: formatLastWatched(item.last_watched_at),
        ctaLabel: 'Resume',
      })),
    [sections.continue_watching]
  )

  const trendingMovieItems = useMemo(
    () =>
      sections.trending_movies.map((item) => ({
        id: `movie-${item.tmdb_id}`,
        title: item.title,
        subtitle: item.overview,
        image: item.poster_url,
        href: '/vod',
        badge: item.year || 'Movie',
        meta: item.rating ? `TMDB ${item.rating}` : 'Trending this week',
        ctaLabel: 'Browse VOD',
      })),
    [sections.trending_movies]
  )

  const trendingSeriesItems = useMemo(
    () =>
      sections.trending_series.map((item) => ({
        id: `series-${item.tmdb_id}`,
        title: item.title,
        subtitle: item.overview,
        image: item.poster_url,
        href: '/vod',
        badge: item.year || 'Series',
        meta: item.rating ? `TMDB ${item.rating}` : 'Trending this week',
        ctaLabel: 'Browse VOD',
      })),
    [sections.trending_series]
  )

  const favoriteChannelItems = useMemo(
    () =>
      sections.favorite_channels.map((item) => ({
        id: item.id,
        title: item.item_name,
        subtitle: item.metadata?.category || 'Favorite channel',
        image: item.poster_url,
        href: '/live',
        badge: 'Saved',
        meta: item.provider_id ? 'Linked to your provider' : 'Quick access',
        ctaLabel: 'Open Live TV',
      })),
    [sections.favorite_channels]
  )

  const statCards = [
    {
      label: 'Providers',
      value: providers.length.toString(),
      copy: hasByoProviders ? 'Connected to your catalog' : 'Add a provider to unlock your lineup',
      icon: Server,
    },
    {
      label: 'Live TV',
      value: canUseLiveTv ? 'Ready' : 'Locked',
      copy: canUseLiveTv ? 'Launch channels from your BYO provider' : 'Live TV needs a BYO provider',
      icon: Tv2,
    },
    {
      label: 'Continue Watching',
      value: sections.continue_watching.length.toString(),
      copy: sections.continue_watching.length ? 'Resume where you left off' : 'Start watching to build your row',
      icon: PlayCircle,
    },
    {
      label: 'Favorites',
      value: sections.favorite_channels.length.toString(),
      copy: sections.favorite_channels.length ? 'Saved live channels on deck' : 'Favorite channels appear here',
      icon: Heart,
    },
  ]

  const copyUrl = async () => {
    if (!addonUrl) return
    setCopying(true)
    try {
      await navigator.clipboard.writeText(addonUrl)
      toast.success('Addon URL copied')
    } catch {
      toast.error('Copy failed')
    } finally {
      window.setTimeout(() => setCopying(false), 1200)
    }
  }

  const installInStremio = () => {
    if (!addonUrl) return
    window.open(`stremio://${addonUrl.replace(/^https?:\/\//, '')}`, '_blank')
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="panel p-8">
          <h1 className="hero-title">Loading your home screen...</h1>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
          <SkeletonCard count={12} type="vod" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="space-y-5"
      >
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="default" className="gap-1.5">
            <Activity className="h-3 w-3" />
            Cloud Stream Home
          </Badge>
          {freeAccessStatus === 'active' && !hasByoProviders && (
            <span className="kicker">Free movies and series active</span>
          )}
        </div>

        {sections.featured ? (
          <HeroBanner
            item={sections.featured}
            primaryAction={{ label: 'Browse VOD', href: '/vod' }}
            secondaryAction={{ label: 'Open Live TV', href: canUseLiveTv ? '/live' : '/providers' }}
          />
        ) : (
          <Card className="p-8">
            <p className="eyebrow mb-3">Featured</p>
            <h1 className="hero-title">Your streaming home is ready for data.</h1>
            <p className="hero-copy mt-4">
              Add a provider to pull in catalog rows, keep using TMDB trending picks, and start building continue watching.
            </p>
          </Card>
        )}
      </motion.section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ label, value, copy, icon: Icon }) => (
          <Card key={label} className="p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="metric-label">{label}</p>
              <span className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-white/[0.08] bg-white/[0.04] text-brand-200">
                <Icon className="h-[18px] w-[18px]" />
              </span>
            </div>
            <p className="text-[2rem] font-bold text-white">{value}</p>
            <p className="mt-2 text-sm text-slate-300/60">{copy}</p>
          </Card>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="p-5 sm:p-6">
          <p className="eyebrow mb-2">Quick actions</p>
          <h2 className="section-title">Jump back into your setup</h2>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/vod">Browse VOD</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={canUseLiveTv ? '/live' : '/providers'}>
                {canUseLiveTv ? 'Open Live TV' : 'Add Provider'}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/providers">Manage Providers</Link>
            </Button>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <p className="eyebrow mb-2">Addon link</p>
          <h2 className="section-title">Install once</h2>
          {addonUrl ? (
            <>
              <div className="mt-4 overflow-x-auto whitespace-nowrap rounded-[18px] border border-white/[0.08] bg-surface-950/70 p-4 font-mono text-sm text-slate-200/80">
                {addonUrl}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={copyUrl} variant="outline">
                  <Copy className="h-4 w-4" />
                  {copying ? 'Copied' : 'Copy URL'}
                </Button>
                <Button onClick={installInStremio}>
                  <ExternalLink className="h-4 w-4" />
                  Open in Stremio
                </Button>
              </div>
            </>
          ) : (
            <p className="section-copy mt-3">Your addon URL will appear here after the account finishes loading.</p>
          )}
        </Card>
      </section>

      <ContentRow
        title="Continue Watching"
        eyebrow="Resume"
        items={continueWatchingItems}
        emptyLabel="Watch something from your provider catalog and it will show up here."
      />

      <ContentRow
        title="Trending Movies"
        eyebrow="TMDB"
        items={trendingMovieItems}
        emptyLabel="TMDB trending movies are unavailable right now. Check that TMDB is configured on the backend."
      />

      <ContentRow
        title="Trending Series"
        eyebrow="TMDB"
        items={trendingSeriesItems}
        emptyLabel="TMDB trending series are unavailable right now. Check that TMDB is configured on the backend."
      />

      <ContentRow
        title="Favorite Channels"
        eyebrow="Live TV"
        items={favoriteChannelItems}
        emptyLabel="Favorite channels on the Live TV page and they will appear here for quick access."
      />

      {!hasByoProviders && sections.continue_watching.length === 0 && (
        <EmptyState
          icon={Server}
          heading="Add a provider to unlock the full home experience"
          description="TMDB can power discovery, but your own provider is what fills Live TV, continue watching, and your personal catalog."
          action={() => router.push('/providers')}
          actionLabel="Add Provider"
        />
      )}
    </div>
  )
}
