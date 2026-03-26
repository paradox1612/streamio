-- StreamBridge Database Schema
-- Run with: psql $DATABASE_URL -f schema.sql

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enable trigram extension for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ─────────────────────────────────────────
-- Users
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR UNIQUE NOT NULL,
  password_hash VARCHAR NOT NULL,
  addon_token VARCHAR UNIQUE NOT NULL,
  preferred_languages TEXT[] DEFAULT ARRAY[]::TEXT[],
  excluded_languages TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN DEFAULT true,
  reset_token VARCHAR,
  reset_token_expires TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_languages TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS excluded_languages TEXT[] DEFAULT ARRAY[]::TEXT[];

-- ─────────────────────────────────────────
-- Admin Users
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR UNIQUE NOT NULL,
  password_hash VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- User Providers (Xtream Codes)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  hosts TEXT[] NOT NULL,
  username VARCHAR NOT NULL,
  password VARCHAR NOT NULL,
  active_host VARCHAR,
  status VARCHAR DEFAULT 'unknown',
  last_checked TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- VOD Catalog per provider
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_provider_vod (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES user_providers(id) ON DELETE CASCADE,
  stream_id VARCHAR NOT NULL,
  raw_title VARCHAR NOT NULL,
  normalized_title VARCHAR,
  canonical_title VARCHAR,
  canonical_normalized_title VARCHAR,
  title_year INTEGER,
  content_languages TEXT[] DEFAULT ARRAY[]::TEXT[],
  quality_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  poster_url VARCHAR,
  category VARCHAR,
  vod_type VARCHAR CONSTRAINT user_provider_vod_vod_type_check CHECK (vod_type IN ('movie', 'series', 'live')),
  container_extension VARCHAR DEFAULT 'mp4',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(provider_id, stream_id, vod_type)
);

-- ─────────────────────────────────────────
-- TMDB Movies (global)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tmdb_movies (
  id INTEGER PRIMARY KEY,
  original_title VARCHAR NOT NULL,
  normalized_title VARCHAR,
  release_year INTEGER,
  popularity FLOAT DEFAULT 0,
  poster_path VARCHAR,
  overview TEXT,
  imdb_id VARCHAR
);

-- ─────────────────────────────────────────
-- TMDB Series (global)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tmdb_series (
  id INTEGER PRIMARY KEY,
  original_title VARCHAR NOT NULL,
  normalized_title VARCHAR,
  first_air_year INTEGER,
  popularity FLOAT DEFAULT 0,
  poster_path VARCHAR,
  overview TEXT
);

-- ─────────────────────────────────────────
-- Global match cache (shared across all users)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matched_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_title VARCHAR UNIQUE NOT NULL,
  tmdb_id INTEGER,
  tmdb_type VARCHAR CHECK (tmdb_type IN ('movie', 'series')),
  imdb_id VARCHAR,
  confidence_score FLOAT,
  matched_at TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- Host health per provider
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS host_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES user_providers(id) ON DELETE CASCADE,
  host_url VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'unknown',
  response_time_ms INTEGER,
  last_checked TIMESTAMP,
  UNIQUE(provider_id, host_url)
);

-- ─────────────────────────────────────────
-- Job run tracking
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'running',
  started_at TIMESTAMP DEFAULT NOW(),
  finished_at TIMESTAMP,
  error_message TEXT,
  metadata JSONB
);

-- ─────────────────────────────────────────
-- Incremental migrations (safe to re-run)
-- ─────────────────────────────────────────
ALTER TABLE user_provider_vod
  ADD COLUMN IF NOT EXISTS container_extension VARCHAR DEFAULT 'mp4';
ALTER TABLE user_provider_vod
  ADD COLUMN IF NOT EXISTS normalized_title VARCHAR;
ALTER TABLE user_provider_vod
  ADD COLUMN IF NOT EXISTS canonical_title VARCHAR;
ALTER TABLE user_provider_vod
  ADD COLUMN IF NOT EXISTS canonical_normalized_title VARCHAR;
ALTER TABLE user_provider_vod
  ADD COLUMN IF NOT EXISTS title_year INTEGER;
ALTER TABLE user_provider_vod
  ADD COLUMN IF NOT EXISTS content_languages TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE user_provider_vod
  ADD COLUMN IF NOT EXISTS quality_tags TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE tmdb_movies
  ADD COLUMN IF NOT EXISTS normalized_title VARCHAR;
ALTER TABLE tmdb_series
  ADD COLUMN IF NOT EXISTS normalized_title VARCHAR;

-- ─────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_addon_token ON users(addon_token);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_providers_user_id ON user_providers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_provider_vod_provider_id ON user_provider_vod(provider_id);
CREATE INDEX IF NOT EXISTS idx_user_provider_vod_user_id ON user_provider_vod(user_id);
CREATE INDEX IF NOT EXISTS idx_user_provider_vod_type ON user_provider_vod(vod_type);
CREATE INDEX IF NOT EXISTS idx_user_provider_vod_normalized_title ON user_provider_vod(normalized_title);
CREATE INDEX IF NOT EXISTS idx_user_provider_vod_canonical_normalized_title ON user_provider_vod(canonical_normalized_title);
CREATE INDEX IF NOT EXISTS idx_user_provider_vod_user_type_normalized ON user_provider_vod(user_id, vod_type, normalized_title);
CREATE INDEX IF NOT EXISTS idx_upv_user_type_canonical ON user_provider_vod(user_id, vod_type, canonical_normalized_title);
CREATE INDEX IF NOT EXISTS user_provider_vod_normalized_title_trgm_gist ON user_provider_vod
  USING gist(normalized_title gist_trgm_ops);
CREATE INDEX IF NOT EXISTS user_provider_vod_canonical_title_trgm_gist ON user_provider_vod
  USING gist(canonical_normalized_title gist_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_matched_content_raw_title ON matched_content(raw_title);
CREATE INDEX IF NOT EXISTS idx_matched_content_tmdb_id ON matched_content(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_host_health_provider_id ON host_health(provider_id);
CREATE INDEX IF NOT EXISTS idx_job_runs_job_name ON job_runs(job_name);

-- Trigram indexes for fuzzy title matching
CREATE INDEX IF NOT EXISTS tmdb_movies_title_trgm ON tmdb_movies
  USING gin(original_title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS tmdb_series_title_trgm ON tmdb_series
  USING gin(original_title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tmdb_movies_original_title_lower ON tmdb_movies (LOWER(original_title));
CREATE INDEX IF NOT EXISTS idx_tmdb_series_original_title_lower ON tmdb_series (LOWER(original_title));
CREATE INDEX IF NOT EXISTS idx_tmdb_movies_normalized_title ON tmdb_movies (normalized_title);
CREATE INDEX IF NOT EXISTS idx_tmdb_series_normalized_title ON tmdb_series (normalized_title);
CREATE INDEX IF NOT EXISTS tmdb_movies_normalized_title_trgm_gist ON tmdb_movies
  USING gist(normalized_title gist_trgm_ops);
CREATE INDEX IF NOT EXISTS tmdb_series_normalized_title_trgm_gist ON tmdb_series
  USING gist(normalized_title gist_trgm_ops);
CREATE INDEX IF NOT EXISTS matched_content_raw_title_trgm ON matched_content
  USING gin(raw_title gin_trgm_ops);

UPDATE tmdb_movies
SET normalized_title = trim(regexp_replace(lower(unaccent(original_title)), '[^a-z0-9]+', ' ', 'g'))
WHERE normalized_title IS NULL OR normalized_title = '';

UPDATE tmdb_series
SET normalized_title = trim(regexp_replace(lower(unaccent(original_title)), '[^a-z0-9]+', ' ', 'g'))
WHERE normalized_title IS NULL OR normalized_title = '';

UPDATE user_provider_vod
SET normalized_title = trim(regexp_replace(lower(unaccent(raw_title)), '[^a-z0-9]+', ' ', 'g'))
WHERE normalized_title IS NULL OR normalized_title = '';

UPDATE user_provider_vod
SET canonical_title = raw_title
WHERE canonical_title IS NULL OR canonical_title = '';

UPDATE user_provider_vod
SET canonical_normalized_title = normalized_title
WHERE canonical_normalized_title IS NULL OR canonical_normalized_title = '';

-- ─────────────────────────────────────────
-- Additional Performance Indexes
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_matched_content_raw_title_lower ON matched_content(LOWER(raw_title));
CREATE INDEX IF NOT EXISTS idx_upv_provider_vod_type ON user_provider_vod(provider_id, vod_type);
CREATE INDEX IF NOT EXISTS idx_upv_user_normalized ON user_provider_vod(user_id, normalized_title);
CREATE INDEX IF NOT EXISTS idx_upv_stream_lookup ON user_provider_vod(provider_id, stream_id, vod_type);
CREATE INDEX IF NOT EXISTS idx_upv_provider_type_normalized_raw ON user_provider_vod(provider_id, vod_type, normalized_title, raw_title);
CREATE INDEX IF NOT EXISTS idx_mc_tmdb_id ON matched_content(tmdb_id) WHERE tmdb_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_host_health_provider ON host_health(provider_id, status);

-- ─────────────────────────────────────────
-- Add EPG channel ID for live streams
-- ─────────────────────────────────────────
ALTER TABLE user_provider_vod
  ADD COLUMN IF NOT EXISTS epg_channel_id TEXT;

ALTER TABLE user_provider_vod
  DROP CONSTRAINT IF EXISTS user_provider_vod_vod_type_check;
ALTER TABLE user_provider_vod
  ADD CONSTRAINT user_provider_vod_vod_type_check
  CHECK (vod_type IN ('movie', 'series', 'live'));

-- ─────────────────────────────────────────
-- Watch History (for future use)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watch_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vod_id UUID REFERENCES user_provider_vod(id) ON DELETE SET NULL,
  raw_title TEXT,
  tmdb_id INTEGER,
  imdb_id TEXT,
  vod_type TEXT,
  progress_pct NUMERIC(5,2) DEFAULT 0,
  last_watched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, raw_title)
);
CREATE INDEX IF NOT EXISTS idx_watch_history_user ON watch_history(user_id, last_watched_at DESC);

-- manually_matched flag to prevent auto-job from overwriting user corrections
ALTER TABLE matched_content ADD COLUMN IF NOT EXISTS manually_matched BOOLEAN DEFAULT FALSE;
