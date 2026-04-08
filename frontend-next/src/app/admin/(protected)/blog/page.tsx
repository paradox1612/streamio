'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, FileText, PlusCircle } from 'lucide-react'
import { formatBlogDate, type BlogPost } from '@/lib/blog'
import { adminAPI } from '@/utils/api'
import AdminBlogComposer from './AdminBlogComposer'

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([])

  const loadPosts = useCallback(() => {
    adminAPI.listBlogPosts()
      .then((res) => setPosts(Array.isArray(res.data) ? res.data : []))
      .catch(() => setPosts([]))
  }, [])

  useEffect(() => {
    loadPosts()
  }, [loadPosts])

  return (
    <div className="space-y-6">
      <AdminBlogComposer onCreated={loadPosts} />

      <section className="panel overflow-hidden p-6 sm:p-8 lg:p-10">
        <p className="eyebrow mb-3">Publishing</p>
        <h1 className="text-3xl font-bold text-white sm:text-5xl">Blog manager</h1>
        <p className="hero-copy mt-4 max-w-3xl">
          The blog is stored in Postgres and exposed through the backend API, so it stays consistent across multiple frontend and backend pods.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/blog" className="btn-secondary justify-center sm:w-auto">
            View public blog
            <ExternalLink className="h-4 w-4" />
          </Link>
          <div className="inline-flex items-center gap-2 rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-slate-300/72">
            <PlusCircle className="h-4 w-4 text-brand-300" />
            Shared storage: `blog_posts`
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        {posts.map((post) => (
          <div key={post.slug} className="panel-soft p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-slate-400/70">
                  <span>{formatBlogDate(post.published_at)}</span>
                  <span>{post.author}</span>
                  {post.read_time && <span>{post.read_time}</span>}
                </div>
                <h2 className="mt-3 text-2xl font-bold text-white">{post.title}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300/72">{post.description}</p>
                <p className="mt-3 text-xs text-slate-400/65">
                  Slug: <span className="font-mono text-slate-300">{post.slug}</span>
                </p>
              </div>
              <Link href={`/blog/${post.slug}`} className="btn-secondary justify-center lg:w-auto">
                <FileText className="h-4 w-4" />
                Open post
              </Link>
            </div>
          </div>
        ))}
      </section>

      <section className="panel-soft p-6">
        <h2 className="text-xl font-bold text-white">Open-source stack</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300/72">
          The admin surface writes to the backend blog API, and the public blog renders database-backed Markdown with `react-markdown`.
        </p>
      </section>
    </div>
  )
}
