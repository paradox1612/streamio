'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { formatBlogDate, type BlogPost } from '@/lib/blog'
import { blogAPI } from '@/utils/api'

export default function BlogPostPage() {
  const params = useParams<{ slug: string }>()
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug
  const [post, setPost] = useState<BlogPost | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!slug) return

    blogAPI.getBySlug(slug)
      .then((res) => {
        setPost(res.data || null)
        setNotFound(false)
      })
      .catch(() => {
        setPost(null)
        setNotFound(true)
      })
  }, [slug])

  if (notFound) {
    return (
      <div className="min-h-screen bg-surface-950">
        <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-sm text-slate-400">Post not found.</p>
          <Link href="/blog" className="mt-4 inline-block text-sm font-semibold text-brand-200">Back to blog</Link>
        </main>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-surface-950">
        <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-sm text-slate-400">Loading post...</p>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-950">
      <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <Link href="/blog" className="text-sm font-semibold text-brand-200">Back to blog</Link>
        <article className="panel mt-5 overflow-hidden p-8 sm:p-10">
          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-slate-400/70">
            <span>{formatBlogDate(post.published_at)}</span>
            <span>{post.author}</span>
            {post.read_time && <span>{post.read_time}</span>}
          </div>
          <h1 className="mt-4 text-4xl font-bold text-white sm:text-5xl">{post.title}</h1>
          <p className="mt-4 text-base leading-7 text-slate-300/72">{post.description}</p>

          <div className="blog-content mt-10 text-slate-200/80">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
          </div>
        </article>
      </main>
    </div>
  )
}
