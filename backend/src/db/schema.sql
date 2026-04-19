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
  password_hash VARCHAR,
  addon_token VARCHAR UNIQUE NOT NULL,
  preferred_languages TEXT[] DEFAULT ARRAY[]::TEXT[],
  excluded_languages TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN DEFAULT true,
  reset_token VARCHAR,
  reset_token_expires TIMESTAMP,
  oauth_provider VARCHAR,
  oauth_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_languages TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS excluded_languages TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_id VARCHAR;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_oauth_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_oauth_unique UNIQUE (oauth_provider, oauth_id);
  END IF;
END $$;

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
-- Blog Posts
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR UNIQUE NOT NULL,
  title VARCHAR NOT NULL,
  description TEXT NOT NULL,
  content TEXT NOT NULL,
  author VARCHAR NOT NULL DEFAULT 'StreamBridge Team',
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  featured BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT true,
  published_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS author VARCHAR NOT NULL DEFAULT 'StreamBridge Team';
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS published_at TIMESTAMP DEFAULT NOW();
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE INDEX IF NOT EXISTS blog_posts_published_at_idx ON blog_posts (published_at DESC);
CREATE INDEX IF NOT EXISTS blog_posts_is_published_idx ON blog_posts (is_published, published_at DESC);

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
  created_at TIMESTAMP DEFAULT NOW(),
  app_portal_config JSONB
);

CREATE TABLE IF NOT EXISTS provider_networks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  identity_key VARCHAR UNIQUE,
  legacy_provider_id UUID UNIQUE,
  reseller_portal_url TEXT,
  reseller_username TEXT,
  reseller_password TEXT,
  catalog_last_refreshed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS provider_network_hosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_network_id UUID NOT NULL REFERENCES provider_networks(id) ON DELETE CASCADE,
  host_url VARCHAR NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(provider_network_id, host_url)
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
  tmdb_id INTEGER,
  imdb_id TEXT,
  content_languages TEXT[] DEFAULT ARRAY[]::TEXT[],
  quality_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  poster_url VARCHAR,
  category VARCHAR,
  vod_type VARCHAR CONSTRAINT user_provider_vod_vod_type_check CHECK (vod_type IN ('movie', 'series', 'live')),
  container_extension VARCHAR DEFAULT 'mp4',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(provider_id, stream_id, vod_type)
);

CREATE TABLE IF NOT EXISTS canonical_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vod_type VARCHAR NOT NULL CHECK (vod_type IN ('movie', 'series', 'live')),
  canonical_title VARCHAR NOT NULL,
  canonical_normalized_title VARCHAR NOT NULL,
  title_year INTEGER,
  tmdb_id INTEGER,
  imdb_id VARCHAR,
  confidence_score FLOAT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(vod_type, canonical_normalized_title, title_year)
);

CREATE TABLE IF NOT EXISTS content_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_network_id UUID REFERENCES provider_networks(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES user_providers(id) ON DELETE CASCADE,
  raw_title VARCHAR NOT NULL,
  normalized_title VARCHAR,
  canonical_title VARCHAR,
  canonical_normalized_title VARCHAR,
  title_year INTEGER,
  vod_type VARCHAR NOT NULL CHECK (vod_type IN ('movie', 'series', 'live')),
  canonical_content_id UUID REFERENCES canonical_content(id) ON DELETE SET NULL,
  confidence_score FLOAT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(provider_network_id, raw_title, vod_type)
);

CREATE TABLE IF NOT EXISTS network_vod (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_network_id UUID NOT NULL REFERENCES provider_networks(id) ON DELETE CASCADE,
  stream_id VARCHAR NOT NULL,
  raw_title VARCHAR NOT NULL,
  normalized_title VARCHAR,
  canonical_title VARCHAR,
  canonical_normalized_title VARCHAR,
  title_year INTEGER,
  tmdb_id INTEGER,
  imdb_id TEXT,
  content_languages TEXT[] DEFAULT ARRAY[]::TEXT[],
  quality_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  poster_url VARCHAR,
  category VARCHAR,
  vod_type VARCHAR NOT NULL CHECK (vod_type IN ('movie', 'series', 'live')),
  container_extension VARCHAR DEFAULT 'mp4',
  epg_channel_id TEXT,
  canonical_content_id UUID REFERENCES canonical_content(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(provider_network_id, stream_id, vod_type)
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
  overview TEXT,
  imdb_id VARCHAR
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
-- Free Access Provider Groups
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS free_access_provider_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  is_active BOOLEAN DEFAULT true,
  trial_days INTEGER DEFAULT 7,
  allow_live BOOLEAN DEFAULT false,
  notes TEXT,
  catalog_last_refreshed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- Free Access Provider Hosts
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS free_access_provider_hosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_group_id UUID REFERENCES free_access_provider_groups(id) ON DELETE CASCADE,
  host VARCHAR NOT NULL,
  priority INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  last_checked_at TIMESTAMP,
  last_status VARCHAR DEFAULT 'unknown',
  last_response_ms INTEGER,
  UNIQUE(provider_group_id, host)
);

-- ─────────────────────────────────────────
-- Free Access Provider Accounts
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS free_access_provider_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_group_id UUID REFERENCES free_access_provider_groups(id) ON DELETE CASCADE,
  username VARCHAR NOT NULL,
  password VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'available'
    CHECK (status IN ('available', 'assigned', 'suspended', 'expired', 'invalid')),
  max_connections INTEGER,
  last_active_connections INTEGER,
  last_expiration_at TIMESTAMP,
  last_checked_at TIMESTAMP,
  last_assigned_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(provider_group_id, username)
);

-- ─────────────────────────────────────────
-- User Free Access Assignments
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_free_access_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider_group_id UUID REFERENCES free_access_provider_groups(id) ON DELETE CASCADE,
  account_id UUID REFERENCES free_access_provider_accounts(id) ON DELETE CASCADE,
  status VARCHAR DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'revoked', 'renewed')),
  started_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  expired_at TIMESTAMP,
  last_stream_at TIMESTAMP,
  renewal_number INTEGER DEFAULT 0
);

-- ─────────────────────────────────────────
-- Shared Free Access Catalog
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS free_access_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_group_id UUID REFERENCES free_access_provider_groups(id) ON DELETE CASCADE,
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
  vod_type VARCHAR CHECK (vod_type IN ('movie', 'series')),
  container_extension VARCHAR DEFAULT 'mp4',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(provider_group_id, stream_id, vod_type)
);

-- ─────────────────────────────────────────
-- Incremental migrations (safe to re-run)
-- ─────────────────────────────────────────
ALTER TABLE user_provider_vod
  ADD COLUMN IF NOT EXISTS tmdb_id INTEGER;
ALTER TABLE user_provider_vod
  ADD COLUMN IF NOT EXISTS imdb_id TEXT;
ALTER TABLE network_vod
  ADD COLUMN IF NOT EXISTS tmdb_id INTEGER;
ALTER TABLE network_vod
  ADD COLUMN IF NOT EXISTS imdb_id TEXT;

CREATE INDEX IF NOT EXISTS idx_upv_tmdb_id ON user_provider_vod(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_upv_imdb_id ON user_provider_vod(imdb_id);
CREATE INDEX IF NOT EXISTS idx_network_vod_tmdb_id ON network_vod(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_network_vod_imdb_id ON network_vod(imdb_id);
CREATE INDEX IF NOT EXISTS idx_user_providers_user_id_id ON user_providers(user_id, id);

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
ALTER TABLE user_provider_vod
  ADD COLUMN IF NOT EXISTS canonical_content_id UUID REFERENCES canonical_content(id) ON DELETE SET NULL;
ALTER TABLE user_providers
  ADD COLUMN IF NOT EXISTS network_id UUID REFERENCES provider_networks(id) ON DELETE SET NULL;
ALTER TABLE user_providers
  ADD COLUMN IF NOT EXISTS catalog_variant BOOLEAN DEFAULT false;
ALTER TABLE user_providers
  ADD COLUMN IF NOT EXISTS network_attached_at TIMESTAMP;
ALTER TABLE provider_networks
  ADD COLUMN IF NOT EXISTS twenty_company_id TEXT;
ALTER TABLE user_providers
  ADD COLUMN IF NOT EXISTS twenty_provider_access_id TEXT;
ALTER TABLE user_providers
  ADD COLUMN IF NOT EXISTS account_status VARCHAR;
ALTER TABLE user_providers
  ADD COLUMN IF NOT EXISTS account_expires_at TIMESTAMP;
ALTER TABLE user_providers
  ADD COLUMN IF NOT EXISTS account_is_trial BOOLEAN;
ALTER TABLE user_providers
  ADD COLUMN IF NOT EXISTS account_max_connections INTEGER;
ALTER TABLE user_providers
  ADD COLUMN IF NOT EXISTS account_active_connections INTEGER;
ALTER TABLE user_providers
  ADD COLUMN IF NOT EXISTS account_last_synced_at TIMESTAMP;
ALTER TABLE user_providers
  ADD COLUMN IF NOT EXISTS app_portal_config JSONB;
ALTER TABLE tmdb_movies
  ADD COLUMN IF NOT EXISTS normalized_title VARCHAR;
ALTER TABLE tmdb_series
  ADD COLUMN IF NOT EXISTS normalized_title VARCHAR;
ALTER TABLE tmdb_series
  ADD COLUMN IF NOT EXISTS imdb_id VARCHAR;
ALTER TABLE free_access_provider_groups
  ADD COLUMN IF NOT EXISTS catalog_last_refreshed_at TIMESTAMP;
ALTER TABLE provider_networks
  ADD COLUMN IF NOT EXISTS reseller_portal_url TEXT;

ALTER TABLE provider_networks
  ADD COLUMN IF NOT EXISTS reseller_username TEXT;
ALTER TABLE provider_networks
  ADD COLUMN IF NOT EXISTS reseller_password TEXT;
ALTER TABLE provider_networks
  ADD COLUMN IF NOT EXISTS reseller_api_key TEXT;
ALTER TABLE provider_networks
  ADD COLUMN IF NOT EXISTS xtream_ui_scraped BOOLEAN DEFAULT false;
ALTER TABLE provider_networks
  ADD COLUMN IF NOT EXISTS reseller_session_cookie TEXT;

-- ─────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_addon_token ON users(addon_token);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_providers_user_id ON user_providers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_providers_network_id ON user_providers(network_id);
CREATE INDEX IF NOT EXISTS idx_user_provider_vod_provider_id ON user_provider_vod(provider_id);
CREATE INDEX IF NOT EXISTS idx_user_provider_vod_user_id ON user_provider_vod(user_id);
CREATE INDEX IF NOT EXISTS idx_user_provider_vod_user_raw_title ON user_provider_vod(user_id, raw_title);
CREATE INDEX IF NOT EXISTS idx_user_provider_vod_type ON user_provider_vod(vod_type);
CREATE INDEX IF NOT EXISTS idx_user_provider_vod_normalized_title ON user_provider_vod(normalized_title);
CREATE INDEX IF NOT EXISTS idx_user_provider_vod_canonical_normalized_title ON user_provider_vod(canonical_normalized_title);
CREATE INDEX IF NOT EXISTS idx_user_provider_vod_canonical_content_id ON user_provider_vod(canonical_content_id);
CREATE INDEX IF NOT EXISTS idx_user_provider_vod_user_type_normalized ON user_provider_vod(user_id, vod_type, normalized_title);
CREATE INDEX IF NOT EXISTS idx_upv_user_type_canonical ON user_provider_vod(user_id, vod_type, canonical_normalized_title);
CREATE INDEX IF NOT EXISTS user_provider_vod_normalized_title_trgm_gist ON user_provider_vod
  USING gist(normalized_title gist_trgm_ops);
CREATE INDEX IF NOT EXISTS user_provider_vod_canonical_title_trgm_gist ON user_provider_vod
  USING gist(canonical_normalized_title gist_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_matched_content_raw_title ON matched_content(raw_title);
CREATE INDEX IF NOT EXISTS idx_matched_content_tmdb_id ON matched_content(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_matched_content_imdb_id ON matched_content(imdb_id) WHERE imdb_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tmdb_series_imdb_id ON tmdb_series(imdb_id) WHERE imdb_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_host_health_provider_id ON host_health(provider_id);
CREATE INDEX IF NOT EXISTS idx_job_runs_job_name ON job_runs(job_name);
CREATE INDEX IF NOT EXISTS idx_provider_network_hosts_network_id ON provider_network_hosts(provider_network_id);
CREATE INDEX IF NOT EXISTS idx_provider_network_hosts_host_url ON provider_network_hosts(host_url);
CREATE INDEX IF NOT EXISTS idx_network_vod_network_id ON network_vod(provider_network_id);
CREATE INDEX IF NOT EXISTS idx_network_vod_network_type ON network_vod(provider_network_id, vod_type);
CREATE INDEX IF NOT EXISTS idx_network_vod_raw_title ON network_vod(provider_network_id, raw_title);
CREATE INDEX IF NOT EXISTS idx_network_vod_normalized_title ON network_vod(canonical_normalized_title);
CREATE INDEX IF NOT EXISTS idx_network_vod_canonical_content_id ON network_vod(canonical_content_id);
CREATE INDEX IF NOT EXISTS idx_canonical_content_lookup ON canonical_content(vod_type, canonical_normalized_title, title_year);
CREATE INDEX IF NOT EXISTS idx_canonical_content_tmdb_id ON canonical_content(tmdb_id) WHERE tmdb_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_canonical_content_imdb_id ON canonical_content(imdb_id) WHERE imdb_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_aliases_network_raw_title ON content_aliases(provider_network_id, raw_title, vod_type);
CREATE INDEX IF NOT EXISTS idx_content_aliases_canonical_content_id ON content_aliases(canonical_content_id);
CREATE INDEX IF NOT EXISTS idx_free_access_groups_active ON free_access_provider_groups(is_active);
CREATE INDEX IF NOT EXISTS idx_free_access_hosts_group_id ON free_access_provider_hosts(provider_group_id);
CREATE INDEX IF NOT EXISTS idx_free_access_accounts_group_id ON free_access_provider_accounts(provider_group_id);
CREATE INDEX IF NOT EXISTS idx_free_access_accounts_status ON free_access_provider_accounts(status);
CREATE INDEX IF NOT EXISTS idx_user_free_access_assignments_user_id ON user_free_access_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_free_access_assignments_status ON user_free_access_assignments(status);
CREATE INDEX IF NOT EXISTS idx_free_access_catalog_group_id ON free_access_catalog(provider_group_id);
CREATE INDEX IF NOT EXISTS idx_free_access_catalog_vod_type ON free_access_catalog(vod_type);
CREATE INDEX IF NOT EXISTS idx_free_access_catalog_normalized_title ON free_access_catalog(normalized_title);
CREATE INDEX IF NOT EXISTS idx_free_access_catalog_canonical_normalized_title ON free_access_catalog(canonical_normalized_title);
CREATE INDEX IF NOT EXISTS free_access_catalog_normalized_title_trgm_gist ON free_access_catalog
  USING gist(normalized_title gist_trgm_ops);
CREATE INDEX IF NOT EXISTS free_access_catalog_canonical_title_trgm_gist ON free_access_catalog
  USING gist(canonical_normalized_title gist_trgm_ops);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_free_access_active_assignment
  ON user_free_access_assignments(user_id)
  WHERE status = 'active';

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

UPDATE free_access_catalog
SET normalized_title = trim(regexp_replace(lower(unaccent(raw_title)), '[^a-z0-9]+', ' ', 'g'))
WHERE normalized_title IS NULL OR normalized_title = '';

UPDATE free_access_catalog
SET canonical_title = raw_title
WHERE canonical_title IS NULL OR canonical_title = '';

UPDATE free_access_catalog
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

INSERT INTO provider_networks (name, legacy_provider_id)
SELECT CONCAT('Migrated network: ', p.name), p.id
FROM user_providers p
WHERE NOT EXISTS (
  SELECT 1
  FROM provider_networks pn
  WHERE pn.legacy_provider_id = p.id
);

UPDATE user_providers p
SET network_id = pn.id,
    network_attached_at = COALESCE(p.network_attached_at, NOW())
FROM provider_networks pn
WHERE pn.legacy_provider_id = p.id
  AND p.network_id IS NULL;

INSERT INTO provider_network_hosts (provider_network_id, host_url)
SELECT DISTINCT p.network_id, host
FROM user_providers p
CROSS JOIN LATERAL unnest(p.hosts) AS host
WHERE p.network_id IS NOT NULL
ON CONFLICT (provider_network_id, host_url) DO NOTHING;

INSERT INTO canonical_content (vod_type, canonical_title, canonical_normalized_title, title_year)
SELECT DISTINCT
  v.vod_type,
  COALESCE(v.canonical_title, v.raw_title),
  COALESCE(v.canonical_normalized_title, v.normalized_title),
  v.title_year
FROM user_provider_vod v
WHERE COALESCE(v.canonical_normalized_title, v.normalized_title) IS NOT NULL
ON CONFLICT (vod_type, canonical_normalized_title, title_year) DO NOTHING;

UPDATE user_provider_vod v
SET canonical_content_id = cc.id
FROM canonical_content cc
WHERE v.canonical_content_id IS NULL
  AND cc.vod_type = v.vod_type
  AND cc.canonical_normalized_title = COALESCE(v.canonical_normalized_title, v.normalized_title)
  AND cc.title_year IS NOT DISTINCT FROM v.title_year;

INSERT INTO network_vod (
  provider_network_id,
  stream_id,
  raw_title,
  normalized_title,
  canonical_title,
  canonical_normalized_title,
  title_year,
  content_languages,
  quality_tags,
  poster_url,
  category,
  vod_type,
  container_extension,
  epg_channel_id,
  canonical_content_id
)
SELECT DISTINCT ON (p.network_id, v.stream_id, v.vod_type)
  p.network_id,
  v.stream_id,
  v.raw_title,
  v.normalized_title,
  v.canonical_title,
  v.canonical_normalized_title,
  v.title_year,
  v.content_languages,
  v.quality_tags,
  v.poster_url,
  v.category,
  v.vod_type,
  v.container_extension,
  v.epg_channel_id,
  v.canonical_content_id
FROM user_provider_vod v
JOIN user_providers p ON p.id = v.provider_id
WHERE p.network_id IS NOT NULL
ON CONFLICT (provider_network_id, stream_id, vod_type) DO NOTHING;

INSERT INTO content_aliases (
  provider_network_id,
  provider_id,
  raw_title,
  normalized_title,
  canonical_title,
  canonical_normalized_title,
  title_year,
  vod_type,
  canonical_content_id
)
SELECT DISTINCT
  p.network_id,
  v.provider_id,
  v.raw_title,
  v.normalized_title,
  v.canonical_title,
  v.canonical_normalized_title,
  v.title_year,
  v.vod_type,
  v.canonical_content_id
FROM user_provider_vod v
JOIN user_providers p ON p.id = v.provider_id
WHERE p.network_id IS NOT NULL
ON CONFLICT (provider_network_id, raw_title, vod_type) DO NOTHING;

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

-- ─────────────────────────────────────────
-- User Favorites (channels, categories, VOD)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type VARCHAR NOT NULL,   -- 'channel' | 'category' | 'movie' | 'series'
  item_id TEXT NOT NULL,        -- stream_id for channels, tmdb_id for VOD, category name for category
  item_name TEXT NOT NULL,
  poster_url TEXT,
  provider_id UUID REFERENCES user_providers(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON user_favorites(user_id, item_type);

-- manually_matched flag to prevent auto-job from overwriting user corrections
ALTER TABLE matched_content ADD COLUMN IF NOT EXISTS manually_matched BOOLEAN DEFAULT FALSE;

-- ─────────────────────────────────────────
-- Error Reports
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS error_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_kind VARCHAR NOT NULL DEFAULT 'error',
  ticket_category VARCHAR,
  source VARCHAR NOT NULL DEFAULT 'frontend',
  status VARCHAR NOT NULL DEFAULT 'open',
  severity VARCHAR NOT NULL DEFAULT 'error',
  message TEXT NOT NULL,
  error_type VARCHAR,
  stack TEXT,
  component_stack TEXT,
  fingerprint VARCHAR,
  page_url TEXT,
  route_path TEXT,
  request_method VARCHAR,
  request_path TEXT,
  user_agent TEXT,
  reporter_email TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_context BOOLEAN DEFAULT FALSE,
  context JSONB DEFAULT '{}'::jsonb,
  reviewed_at TIMESTAMP,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE error_reports ADD COLUMN IF NOT EXISTS report_kind VARCHAR NOT NULL DEFAULT 'error';
ALTER TABLE error_reports ADD COLUMN IF NOT EXISTS ticket_category VARCHAR;

CREATE INDEX IF NOT EXISTS idx_error_reports_created_at ON error_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_reports_status ON error_reports(status);
CREATE INDEX IF NOT EXISTS idx_error_reports_source ON error_reports(source);
CREATE INDEX IF NOT EXISTS idx_error_reports_report_kind ON error_reports(report_kind);

CREATE TABLE IF NOT EXISTS support_report_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES error_reports(id) ON DELETE CASCADE,
  author_type VARCHAR NOT NULL,
  author_email TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_report_messages_report_id ON support_report_messages(report_id, created_at ASC);

-- ─────────────────────────────────────────
-- Marketplace: Stripe + Twenty CRM columns
-- ─────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS twenty_person_id TEXT;

-- ─────────────────────────────────────────
-- Provider Offerings (Marketplace Catalog)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_offerings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  description         TEXT,
  price_cents         INTEGER NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'usd',
  billing_period      TEXT NOT NULL DEFAULT 'month',
  billing_interval_count INTEGER NOT NULL DEFAULT 1,
  trial_days          INTEGER NOT NULL DEFAULT 0,
  max_connections     INTEGER NOT NULL DEFAULT 1,
  features            JSONB DEFAULT '[]',
  plan_options        JSONB DEFAULT '[]',
  catalog_tags        TEXT[] DEFAULT ARRAY[]::TEXT[],
  country_codes       TEXT[] DEFAULT ARRAY[]::TEXT[],
  provider_stats      JSONB DEFAULT '{}'::jsonb,
  provisioning_mode   TEXT NOT NULL DEFAULT 'pooled_account',
  reseller_bouquet_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  reseller_notes      TEXT,
  stripe_price_id     TEXT UNIQUE,
  stripe_product_id   TEXT,
  provider_network_id UUID REFERENCES provider_networks(id) ON DELETE SET NULL,
  is_featured         BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  group_id            TEXT,
  is_trial            BOOLEAN NOT NULL DEFAULT false,
  trial_ticket_enabled BOOLEAN NOT NULL DEFAULT false,
  trial_ticket_message TEXT,
  countries           TEXT[] DEFAULT ARRAY[]::TEXT[],
  tags                TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_offerings_active  ON provider_offerings(is_active);
CREATE INDEX IF NOT EXISTS idx_provider_offerings_network ON provider_offerings(provider_network_id);

ALTER TABLE provider_offerings
  ADD COLUMN IF NOT EXISTS billing_interval_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE provider_offerings
  ADD COLUMN IF NOT EXISTS plan_options JSONB DEFAULT '[]';
ALTER TABLE provider_offerings
  ADD COLUMN IF NOT EXISTS catalog_tags TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE provider_offerings
  ADD COLUMN IF NOT EXISTS country_codes TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE provider_offerings
  ADD COLUMN IF NOT EXISTS provider_stats JSONB DEFAULT '{}'::jsonb;
ALTER TABLE provider_offerings
  ADD COLUMN IF NOT EXISTS provisioning_mode TEXT NOT NULL DEFAULT 'pooled_account';
ALTER TABLE provider_offerings
  ALTER COLUMN billing_interval_count SET DEFAULT 1;
ALTER TABLE provider_offerings
  ADD COLUMN IF NOT EXISTS reseller_bouquet_ids TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE provider_offerings
  ADD COLUMN IF NOT EXISTS reseller_notes TEXT;
ALTER TABLE provider_offerings
  ADD COLUMN IF NOT EXISTS trial_ticket_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE provider_offerings
  ADD COLUMN IF NOT EXISTS trial_ticket_message TEXT;

-- ─────────────────────────────────────────
-- Provider Subscriptions (User Purchases)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offering_id             UUID REFERENCES provider_offerings(id) ON DELETE SET NULL,
  user_provider_id        UUID REFERENCES user_providers(id) ON DELETE SET NULL,
  stripe_customer_id      TEXT NOT NULL,
  stripe_subscription_id  TEXT UNIQUE NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'active',
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN NOT NULL DEFAULT false,
  auto_renew              BOOLEAN NOT NULL DEFAULT true,
  cancelled_at            TIMESTAMPTZ,
  trial_end               TIMESTAMPTZ,
  selected_plan_code      TEXT,
  selected_plan_name      TEXT,
  selected_price_cents    INTEGER,
  selected_currency       TEXT,
  selected_billing_period TEXT,
  selected_interval_count INTEGER,
  twenty_subscription_id  TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_subs_user       ON provider_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_subs_status     ON provider_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_provider_subs_stripe_sub ON provider_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_provider_subs_period_end ON provider_subscriptions(current_period_end);

-- ─────────────────────────────────────────
-- Payment Transactions (Audit Trail)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_transactions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id           UUID REFERENCES provider_subscriptions(id),
  amount_cents              INTEGER NOT NULL,
  currency                  TEXT NOT NULL DEFAULT 'usd',
  status                    TEXT NOT NULL,
  stripe_payment_intent_id  TEXT UNIQUE,
  stripe_invoice_id         TEXT,
  failure_reason            TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_tx_user         ON payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_subscription ON payment_transactions(subscription_id);

-- ─────────────────────────────────────────
-- PayGate + Credits migrations (idempotent)
-- ─────────────────────────────────────────

-- Make stripe fields nullable so PayGate/credits subscriptions can be stored
ALTER TABLE provider_subscriptions ALTER COLUMN stripe_customer_id DROP NOT NULL;
ALTER TABLE provider_subscriptions ALTER COLUMN stripe_subscription_id DROP NOT NULL;

-- Payment provider tracking on subscriptions and transactions
ALTER TABLE provider_subscriptions ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'stripe';
ALTER TABLE provider_subscriptions ADD COLUMN IF NOT EXISTS paygate_address_in TEXT UNIQUE;
ALTER TABLE provider_subscriptions ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE provider_subscriptions ADD COLUMN IF NOT EXISTS selected_plan_code TEXT;
ALTER TABLE provider_subscriptions ADD COLUMN IF NOT EXISTS selected_plan_name TEXT;
ALTER TABLE provider_subscriptions ADD COLUMN IF NOT EXISTS selected_price_cents INTEGER;
ALTER TABLE provider_subscriptions ADD COLUMN IF NOT EXISTS selected_currency TEXT;
ALTER TABLE provider_subscriptions ADD COLUMN IF NOT EXISTS selected_billing_period TEXT;
ALTER TABLE provider_subscriptions ADD COLUMN IF NOT EXISTS selected_interval_count INTEGER;

ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'stripe';
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS paygate_address_in TEXT;

-- ─────────────────────────────────────────
-- Helcim migrations (idempotent)
-- ─────────────────────────────────────────
ALTER TABLE provider_subscriptions ADD COLUMN IF NOT EXISTS helcim_checkout_token TEXT;
ALTER TABLE provider_subscriptions ADD COLUMN IF NOT EXISTS helcim_transaction_id TEXT UNIQUE;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS helcim_transaction_id TEXT UNIQUE;

-- ─────────────────────────────────────────
-- Square migrations (idempotent)
-- ─────────────────────────────────────────
ALTER TABLE provider_subscriptions ADD COLUMN IF NOT EXISTS square_order_id TEXT UNIQUE;
ALTER TABLE provider_subscriptions ADD COLUMN IF NOT EXISTS square_payment_link_id TEXT;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS square_payment_id TEXT UNIQUE;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS square_order_id TEXT UNIQUE;

-- ─────────────────────────────────────────
-- Credits System
-- ─────────────────────────────────────────

-- Denormalized balance for fast reads; source-of-truth is credit_transactions
ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_balance_cents INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS credit_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents    INTEGER NOT NULL,  -- positive = credit added, negative = credit spent
  type            TEXT NOT NULL,     -- 'topup_paygate' | 'topup_stripe' | 'spend_subscription' | 'admin_grant' | 'refund'
  description     TEXT,
  reference_id    TEXT,              -- paygate address_in or stripe payment_intent_id
  subscription_id UUID REFERENCES provider_subscriptions(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'completed' | 'failed'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user      ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_tx_reference ON credit_transactions(reference_id);
CREATE INDEX IF NOT EXISTS idx_credit_tx_status    ON credit_transactions(status);

-- ─────────────────────────────────────────
-- System Settings
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- Provider Network Adapter Type
-- ─────────────────────────────────────────
ALTER TABLE provider_networks
  ADD COLUMN IF NOT EXISTS adapter_type TEXT NOT NULL DEFAULT 'xtream_ui_scraper';

-- ─────────────────────────────────────────
-- Provisioning Status on Subscriptions
-- ─────────────────────────────────────────
ALTER TABLE provider_subscriptions
  ADD COLUMN IF NOT EXISTS provisioning_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE provider_subscriptions
  ADD COLUMN IF NOT EXISTS provisioning_error TEXT;

CREATE INDEX IF NOT EXISTS idx_provider_subs_provisioning
  ON provider_subscriptions(provisioning_status);

-- Default credit settings
INSERT INTO system_settings (key, value)
VALUES (
  'credits_config',
  '{
    "min_topup_cents": 500,
    "max_topup_cents": 100000,
    "presets": [
      {"label": "$10", "cents": 1000},
      {"label": "$25", "cents": 2500},
      {"label": "$50", "cents": 5000},
      {"label": "$100", "cents": 10000}
    ],
    "allow_custom_amount": true
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- Fix offering_id nullable and foreign key for deletions
DO $$ 
DECLARE
  cons_name TEXT;
BEGIN
  -- 1. DROP NOT NULL
  ALTER TABLE provider_subscriptions ALTER COLUMN offering_id DROP NOT NULL;

  -- 2. Update foreign key to SET NULL
  SELECT conname INTO cons_name
  FROM pg_constraint
  WHERE conrelid = 'provider_subscriptions'::regclass
    AND confrelid = 'provider_offerings'::regclass
    AND contype = 'f';
    
  IF cons_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE provider_subscriptions DROP CONSTRAINT ' || cons_name;
  END IF;
  
  -- Add it back with ON DELETE SET NULL
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'provider_subscriptions_offering_id_fkey'
  ) THEN
    ALTER TABLE provider_subscriptions 
      ADD CONSTRAINT provider_subscriptions_offering_id_fkey 
      FOREIGN KEY (offering_id) 
      REFERENCES provider_offerings(id) 
      ON DELETE SET NULL;
  END IF;
END $$;
