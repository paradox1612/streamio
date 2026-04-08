'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { formatBlogDate, type BlogPost } from '@/lib/blog'
import { blogAPI } from '@/utils/api'

export default function BlogIndexPage() {
  const [posts, setPosts] = useState<BlogPost[]>([])

  useEffect(() => {
    blogAPI.list()
      .then((res) => setPosts(Array.isArray(res.data) ? res.data : []))
      .catch(() => setPosts([]))
  }, [])

  return (
    <div className="min-h-screen bg-surface-950">
      <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="panel overflow-hidden p-8 sm:p-10">
          <p className="eyebrow mb-3">StreamBridge blog</p>
          <h1 className="text-4xl font-bold text-white sm:text-5xl">Notes, setup guides, and product updates.</h1>
          <p className="hero-copy mt-4 max-w-3xl">
            Posts are file-based and rendered from local MDX, so adding a new article is just adding one more content file.
          </p>
        </div>

        <div className="mt-8 grid gap-5">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="panel-soft block p-6 transition hover:border-white/[0.16] hover:bg-white/[0.045]"
            >
              <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-slate-400/70">
                <span>{formatBlogDate(post.published_at)}</span>
                <span>{post.author}</span>
                {post.read_time && <span>{post.read_time}</span>}
              </div>
              <h2 className="mt-4 text-2xl font-bold text-white">{post.title}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300/72">{post.description}</p>
              <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand-200">
                Read post
                <ArrowRight className="h-4 w-4" />
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
