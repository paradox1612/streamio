/**
 * CloudStream Plugin API Routes
 *
 * Exposes a lightweight JSON API consumed by the StreamBridge CloudStream plugin.
 * Auth is via ?token= (the same addon_token used by the Stremio addon), so no
 * separate credential system is needed.
 *
 * Endpoints:
 *   GET /cloudstream/providers  – list user's providers
 *   GET /cloudstream/catalog    – paginated content list
 *   GET /cloudstream/search     – search across providers
 *   GET /cloudstream/detail     – full detail + episodes for a single item
 *   GET /cloudstream/stream     – playable stream URLs
 */

const { Router } = require('express');
const { userQueries, providerQueries, vodQueries, pool } = require('../db/queries');
const { handleStream, handleMeta } = require('../addon/addonHandler');
const providerService = require('../services/providerService');
const cache = require('../utils/cache');
const logger = require('../utils/logger');
const { touchUserLastSeen } = require('../utils/userActivity');

const router = Router();

const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w500';

// ─── Auth Helper ──────────────────────────────────────────────────────────────

/**
 * Resolve a user from an addon token.
 * Reuses the same 'userByToken' cache namespace as addonHandler so a shared
 * cache hit benefits both the Stremio and CloudStream code paths.
 */
async function resolveUserByToken(token) {
  if (!token) return null;

  let user = cache.get('userByToken', token);
  if (!user) {
    user = await userQueries.findByToken(token);
    if (!user) return null;
    cache.set('userByToken', token, user);
  }

  if (user.is_active === false) return null;

  touchUserLastSeen(user.id).catch(() => {});
  return user;
}

// ─── Format Helpers ───────────────────────────────────────────────────────────

/**
 * Map an internal vod_type to the CloudStream TvType name.
 * CloudStream uses these exact strings as TvType enum names.
 */
function toCSType(vodType) {
  if (vodType === 'series') return 'TvSeries';
  if (vodType === 'live') return 'Live';
  return 'Movie';
}

/**
 * Map a CloudStream type string (from the plugin) back to an internal vod_type.
 */
function fromCSType(csType) {
  if (csType === 'TvSeries' || csType === 'series') return 'series';
  if (csType === 'Live' || csType === 'live') return 'live';
  return 'movie';
}

/**
 * Map a CloudStream type to the Stremio type string expected by handleMeta /
 * handleStream (which we delegate to for detail + stream resolution).
 */
function toStremioType(csType) {
  if (csType === 'TvSeries' || csType === 'series') return 'series';
  if (csType === 'Live' || csType === 'live') return 'tv';
  return 'movie';
}

/**
 * Build a lightweight CloudStream search/catalog result item from a VOD row.
 * Mirrors the ID logic in addonHandler's buildMetaPreview().
 */
function buildCSItem(item) {
  const hasMatch = item.tmdb_id != null;

  const url = hasMatch
    ? (item.imdb_id || `tmdb:${item.tmdb_id}`)
    : `sb_${item.id}`;

  const posterUrl = hasMatch && item.poster_path
    ? `${TMDB_POSTER_BASE}${item.poster_path}`
    : (item.poster_url || null);

  return {
    name: item.raw_title || 'Unknown',
    url,
    posterUrl,
    type: toCSType(item.vod_type),
    year: item.title_year || null,
    tags: item.category ? [item.category] : [],
  };
}

// ─── GET /cloudstream/providers ───────────────────────────────────────────────

/**
 * Returns the list of providers for the authenticated user.
 * The CloudStream plugin uses this to populate homepage sections per provider.
 *
 * Response:
 *   { providers: [{ id, name }] }
 */
router.get('/providers', async (req, res) => {
  try {
    const user = await resolveUserByToken(req.query.token);
    if (!user) return res.status(401).json({ error: 'Invalid or missing token' });

    const providers = await providerQueries.findByUser(user.id);
    res.json({
      providers: providers.map(p => ({ id: p.id, name: p.name })),
    });
  } catch (err) {
    logger.error('[CloudStream] providers error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── GET /cloudstream/catalog ─────────────────────────────────────────────────

/**
 * Returns a paginated list of content for a given type (and optional provider).
 *
 * Query params:
 *   token      – addon token (required)
 *   type       – 'Movie' | 'TvSeries' | 'Live'  (default: 'Movie')
 *   providerId – UUID of a specific provider (optional; defaults to first provider)
 *   page       – page number, 1-based (default: 1)
 *   pageSize   – items per page (default: 50, max: 100)
 *
 * Response:
 *   { results: [CSItem], hasNextPage: bool }
 */
router.get('/catalog', async (req, res) => {
  try {
    const user = await resolveUserByToken(req.query.token);
    if (!user) return res.status(401).json({ error: 'Invalid or missing token' });

    const csType = req.query.type || 'Movie';
    const vodType = fromCSType(csType);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 50));

    // Resolve provider
    let providerId = req.query.providerId;
    if (providerId) {
      const provider = await providerQueries.findByIdAndUser(providerId, user.id);
      if (!provider) return res.status(404).json({ error: 'Provider not found' });
    } else {
      const providers = await providerQueries.findByUser(user.id);
      if (!providers.length) return res.json({ results: [], hasNextPage: false });
      providerId = providers[0].id;
    }

    const [items, total] = await Promise.all([
      vodQueries.getByProvider(providerId, { type: vodType, page, limit: pageSize }),
      vodQueries.countByProvider(providerId, { type: vodType }),
    ]);

    res.json({
      results: items.map(buildCSItem),
      hasNextPage: page * pageSize < total,
    });
  } catch (err) {
    logger.error('[CloudStream] catalog error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── GET /cloudstream/search ──────────────────────────────────────────────────

/**
 * Searches across all of the user's providers and merges results.
 *
 * Query params:
 *   token    – addon token (required)
 *   query    – search string (required)
 *   type     – 'Movie' | 'TvSeries' | 'Live' (optional; searches all types if omitted)
 *   page     – page number (default: 1)
 *   pageSize – items per page (default: 50)
 *
 * Response:
 *   { results: [CSItem], hasNextPage: bool }
 */
router.get('/search', async (req, res) => {
  try {
    const user = await resolveUserByToken(req.query.token);
    if (!user) return res.status(401).json({ error: 'Invalid or missing token' });

    const query = (req.query.query || '').trim();
    if (!query) return res.json({ results: [], hasNextPage: false });

    const csType = req.query.type || null;
    const vodType = csType ? fromCSType(csType) : null;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 50));

    const providers = await providerQueries.findByUser(user.id);
    if (!providers.length) return res.json({ results: [], hasNextPage: false });

    // Search across all providers in parallel, then merge + deduplicate by url
    const perProviderResults = await Promise.all(
      providers.map(p =>
        vodQueries.getByProvider(p.id, {
          type: vodType,
          page: 1,
          limit: pageSize,
          search: query,
        }).catch(() => [])
      )
    );

    const seen = new Set();
    const merged = [];
    for (const items of perProviderResults) {
      for (const item of items) {
        const csItem = buildCSItem(item);
        if (!seen.has(csItem.url)) {
          seen.add(csItem.url);
          merged.push(csItem);
        }
        if (merged.length >= pageSize * page) break;
      }
    }

    const start = (page - 1) * pageSize;
    const paged = merged.slice(start, start + pageSize);

    res.json({
      results: paged,
      hasNextPage: merged.length > start + pageSize,
    });
  } catch (err) {
    logger.error('[CloudStream] search error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── GET /cloudstream/detail ──────────────────────────────────────────────────

/**
 * Returns full detail for a single item, including the episode list for series.
 * Delegates to addonHandler.handleMeta() so it reuses all caching, TMDB
 * enrichment, and EPG logic already in place.
 *
 * Query params:
 *   token – addon token (required)
 *   url   – content ID from a catalog/search result (required)
 *   type  – 'Movie' | 'TvSeries' | 'Live' (required for correct TMDB lookup)
 *
 * Response:
 *   { name, url, posterUrl, type, year, plot, tags, episodes? }
 *
 * Each episode (series only):
 *   { name, season, episode, url, posterUrl }
 */
router.get('/detail', async (req, res) => {
  try {
    const user = await resolveUserByToken(req.query.token);
    if (!user) return res.status(401).json({ error: 'Invalid or missing token' });

    const url = (req.query.url || '').trim();
    if (!url) return res.status(400).json({ error: 'url is required' });

    const csType = req.query.type || 'Movie';
    const stremioType = toStremioType(csType);

    // Delegate to the existing Stremio meta handler — reuses all its caching.
    const { meta } = await handleMeta(req.query.token, stremioType, url);
    if (!meta) return res.status(404).json({ error: 'Content not found' });

    const detail = {
      name: meta.name,
      url,
      posterUrl: meta.poster || null,
      type: csType,
      year: meta.year || null,
      plot: meta.description || meta.overview || null,
      tags: Array.isArray(meta.genres) ? meta.genres : [],
    };

    // Map Stremio episode videos → CloudStream episode objects
    if (Array.isArray(meta.videos) && meta.videos.length > 0) {
      detail.episodes = meta.videos.map(v => ({
        name: v.title || `Episode ${v.episode}`,
        season: v.season,
        episode: v.episode,
        // Use the Stremio episode ID format: {baseId}:{season}:{episode}
        url: v.id,
        posterUrl: v.thumbnail || null,
        plot: v.overview || null,
      }));
    }

    res.json(detail);
  } catch (err) {
    logger.error('[CloudStream] detail error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── GET /cloudstream/stream ──────────────────────────────────────────────────

/**
 * Returns playable stream URLs for a content item or series episode.
 * Delegates to addonHandler.handleStream() so host health, failover, language
 * preferences, and free-access logic are all reused automatically.
 *
 * Query params:
 *   token – addon token (required)
 *   url   – content ID (for movies/live) or episode ID (for series, format: baseId:S:E)
 *   type  – 'Movie' | 'TvSeries' | 'Live' (required)
 *
 * Response:
 *   { streams: [{ url, name, quality }] }
 */
router.get('/stream', async (req, res) => {
  try {
    const user = await resolveUserByToken(req.query.token);
    if (!user) return res.status(401).json({ error: 'Invalid or missing token' });

    const url = (req.query.url || '').trim();
    if (!url) return res.status(400).json({ error: 'url is required' });

    const csType = req.query.type || 'Movie';
    const stremioType = toStremioType(csType);

    // Delegate to the existing Stremio stream handler — reuses all its logic.
    const { streams: stremioStreams } = await handleStream(req.query.token, stremioType, url);

    // Transform Stremio stream objects → CloudStream stream objects.
    // CloudStream displays name + url; quality is shown as a badge.
    const streams = (stremioStreams || []).map(s => {
      // Extract the host timing label from Stremio's title if present
      const qualityMatch = s.title ? s.title.match(/\(([^)]+ms)\)/) : null;
      return {
        url: s.url,
        name: s.name || 'StreamBridge',
        quality: qualityMatch ? qualityMatch[1] : null,
      };
    });

    res.json({ streams });
  } catch (err) {
    logger.error('[CloudStream] stream error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
