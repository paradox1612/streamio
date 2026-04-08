export interface BlogPost {
  id: string
  slug: string
  title: string
  description: string
  content: string
  author: string
  tags: string[]
  featured: boolean
  is_published: boolean
  published_at: string
  created_at: string
  updated_at: string
  read_time?: string | null
}

export function formatBlogDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}
