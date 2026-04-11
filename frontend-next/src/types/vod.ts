export interface VodItem {
  id: string
  stream_id: string
  raw_title: string
  vod_type: 'movie' | 'series'
  tmdb_id?: number
  imdb_id?: string
  confidence_score?: number
  poster_url?: string
  category?: string
  is_watched?: boolean
  last_watched_at?: string
  streamUrl?: string | null
  watch_progress?: number // 0 to 100
  is_favorite?: boolean
  backdrop_url?: string
  overview?: string
  rating?: number
  year?: string
  runtime?: string
  genres?: string[]
  content_languages?: string[]
}
