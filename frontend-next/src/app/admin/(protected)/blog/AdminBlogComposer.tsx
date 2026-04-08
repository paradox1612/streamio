'use client'

import { useState } from 'react'
import { Loader2, PlusCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { adminAPI } from '@/utils/api'
import type { CreateBlogPostState } from './actions'

export default function AdminBlogComposer({ onCreated }: { onCreated: () => void }) {
  const [state, setState] = useState<CreateBlogPostState>({})
  const [pending, setPending] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPending(true)
    setState({})

    const formData = new FormData(event.currentTarget)
    const payload = {
      title: String(formData.get('title') || '').trim(),
      slug: String(formData.get('slug') || '').trim(),
      description: String(formData.get('description') || '').trim(),
      author: String(formData.get('author') || '').trim(),
      publishedAt: String(formData.get('publishedAt') || '').trim(),
      readTime: String(formData.get('readTime') || '').trim(),
      tags: String(formData.get('tags') || '').trim(),
      content: String(formData.get('content') || '').trim(),
      featured: formData.get('featured') === 'on',
      isPublished: true,
    }

    try {
      const res = await adminAPI.createBlogPost(payload)
      setState({ success: `Created "${res.data.title}" at slug "${res.data.slug}".` })
      event.currentTarget.reset()
      onCreated()
    } catch (error: unknown) {
      const message =
        typeof error === 'object' &&
        error &&
        'response' in error &&
        typeof error.response === 'object' &&
        error.response &&
        'data' in error.response &&
        typeof error.response.data === 'object' &&
        error.response.data &&
        'error' in error.response.data &&
        typeof error.response.data.error === 'string'
          ? error.response.data.error
          : 'Failed to create blog post.'
      setState({ error: message })
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="panel overflow-hidden p-6 sm:p-8 lg:p-10">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-brand-400/20 bg-brand-500/12">
          <PlusCircle className="h-5 w-5 text-brand-200" />
        </div>
        <div>
          <p className="eyebrow mb-1">Create post</p>
          <h2 className="text-2xl font-bold text-white">Publish a new blog entry from admin.</h2>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 grid gap-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" placeholder="How to install StreamBridge in Stremio" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="slug">Slug</Label>
            <Input id="slug" name="slug" placeholder="optional-custom-slug" />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="description">Description</Label>
          <Input id="description" name="description" placeholder="Short summary shown on the blog index." required />
        </div>

        <div className="grid gap-5 lg:grid-cols-4">
          <div className="grid gap-2 lg:col-span-2">
            <Label htmlFor="author">Author</Label>
            <Input id="author" name="author" defaultValue="StreamBridge Team" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="publishedAt">Publish date</Label>
            <Input id="publishedAt" name="publishedAt" type="date" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="readTime">Read time</Label>
            <Input id="readTime" name="readTime" defaultValue="5 min read" />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="tags">Tags</Label>
          <Input id="tags" name="tags" placeholder="setup, stremio, guide" />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="content">Post content</Label>
          <textarea
            id="content"
            name="content"
            required
            rows={14}
            className="field-input min-h-[20rem] rounded-[24px]"
            placeholder={`## Intro\n\nWrite the post in Markdown or MDX.\n\n- Bullet one\n- Bullet two`}
          />
        </div>

        <label className="inline-flex items-center gap-3 text-sm text-slate-200/75">
          <input type="checkbox" name="featured" className="h-4 w-4 rounded border-white/20 bg-transparent text-cyan-300 focus:ring-cyan-300" />
          Mark as featured on the landing page
        </label>

        {state.error && (
          <div className="rounded-[18px] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {state.error}
          </div>
        )}
        {state.success && (
          <div className="rounded-[18px] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {state.success}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="submit" disabled={pending} className="sm:w-auto">
            {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating post</> : 'Create post'}
          </Button>
          <p className="text-sm text-slate-400/65">
            This creates a shared database record, so all pods read the same post immediately.
          </p>
        </div>
      </form>
    </section>
  )
}
