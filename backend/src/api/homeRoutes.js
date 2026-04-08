/**
 * Home API Routes
 *
 * Powers the Netflix-style home page and Live TV favorites.
 * TMDB trending data is fetched once and cached for 6 hours to avoid
 * hammering the TMDB API on every page load.
 *
 * Endpoints:
 *   GET  /api/home/sections   – all home page data in one request
 *   GET  /api/home/trending   – TMDB trending movies + series (cached 6h)
 *   GET  /api/home/favorites  – user's saved favorites
 *   POST /api/home/favorites  – add a favorite
 *   DELETE /api/home/favorites/:id – remove a favorite
 */

const { Router } = require('express');
const fetch = require('node-fetch');
const { pool } = require('../db/queries');
const { requireAuth } = require('../middleware/auth');
const cache = require('../utils/cache');
const logger = require('../utils/logger');

const router = Router();

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/';
const TMDB_TRENDING_TTL = 6 * 60 * 60; // 6 hours in seconds

// ─── TMDB Helpers ─────────────────────────────────────────────────────────────

async function fetchTmdbTrending(mediaType) {
  // mediaType: 'movie' | 'tv'
  if (!TMDB_API_KEY) return [];

  const cacheKey = `trending_${mediaType}`;
  const cached = cache.get('tmdbTrending', cacheKey);
  if (cached) return cached;

  try {
    const url = `https://api.themoviedb.org/3/trending/${mediaType}/week?api_key=${TMDB_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn(`[Home] TMDB trending fetch failed: ${res.status} for ${mediaType}`);
      return [];
    }
    const data = await res.json();
    const results = (data.results || []).slice(0, 20).map(item => ({
      tmdb_id: item.id,
      title: item.title || item.name,
      overview: item.overview || null,
      poster_url: item.poster_path ? `${TMDB_IMAGE_BASE}w500${item.poster_path}` : null,
      backdrop_url: item.backdrop_path ? `${TMDB_IMAGE_BASE}w1280${item.backdrop_path}` : null,
      year: (item.release_date || item.first_air_date || '').slice(0, 4) || null,
      rating: item.vote_average ? Math.round(item.vote_average * 10) / 10 : null,
      type: mediaType === 'tv' ? 'series' : 'movie',
    }));

    cache.set('tmdbTrending', cacheKey, results, TMDB_TRENDING_TTL);
    return results;
  } catch (err) {
    logger.error('[Home] TMDB trending error:', err);
    return [];
  }
}

async function fetchTmdbFeatured() {
  // Returns one item for the hero banner — pick the top trending movie with a backdrop
  const movies = await fetchTmdbTrending('movie');
  return movies.find(m => m.backdrop_url) || movies[0] || null;
}

// ─── Favorites DB helpers ──────────────────────────────────────────────────────

async function getFavorites(userId, itemType = null) {
  let query = `
    SELECT id, item_type, item_id, item_name, poster_url, provider_id, metadata, created_at
    FROM user_favorites
    WHERE user_id = $1
  `;
  const params = [userId];
  if (itemType) {
    query += ` AND item_type = $2`;
    params.push(itemType);
  }
  query += ` ORDER BY created_at DESC`;
  const { rows } = await pool.query(query, params);
  return rows;
}

async function addFavorite(userId, { itemType, itemId, itemName, posterUrl, providerId, metadata }) {
  const { rows } = await pool.query(
    `INSERT INTO user_favorites (user_id, item_type, item_id, item_name, poster_url, provider_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, item_type, item_id) DO UPDATE SET
       item_name = EXCLUDED.item_name,
       poster_url = COALESCE(EXCLUDED.poster_url, user_favorites.poster_url),
       metadata = EXCLUDED.metadata
     RETURNING *`,
    [userId, itemType, itemId, itemName, posterUrl || null, providerId || null, JSON.stringify(metadata || {})]
  );
  return rows[0];
}

async function removeFavorite(userId, favoriteId) {
  const { rowCount } = await pool.query(
    `DELETE FROM user_favorites WHERE id = $1 AND user_id = $2`,
    [favoriteId, userId]
  );
  return rowCount > 0;
}

// ─── GET /api/home/sections ───────────────────────────────────────────────────

/**
 * Single endpoint that returns everything the home page needs.
 * Response:
 * {
 *   featured: TmdbItem | null,
 *   trending_movies: TmdbItem[],
 *   trending_series: TmdbItem[],
 *   continue_watching: WatchHistoryItem[],
 *   favorite_channels: FavoriteItem[],
 * }
 */
router.get('/sections', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [
      trendingMovies,
      trendingSeries,
      continueWatching,
      favoriteChannels,
    ] = await Promise.all([
      fetchTmdbTrending('movie'),
      fetchTmdbTrending('tv'),
      pool.query(
        `SELECT
           wh.id, wh.raw_title, wh.tmdb_id, wh.imdb_id, wh.vod_type,
           wh.progress_pct, wh.last_watched_at,
           v.poster_url, v.category,
           p.name AS provider_name
         FROM watch_history wh
         LEFT JOIN LATERAL (
           SELECT v.id, v.poster_url, v.category, v.provider_id
           FROM user_provider_vod v
           WHERE v.user_id = wh.user_id AND v.raw_title = wh.raw_title
           ORDER BY CASE WHEN wh.vod_id IS NOT NULL AND v.id = wh.vod_id THEN 0 ELSE 1 END, v.created_at DESC
           LIMIT 1
         ) v ON true
         LEFT JOIN user_providers p ON p.id = v.provider_id
         WHERE wh.user_id = $1 AND wh.progress_pct > 0
         ORDER BY wh.last_watched_at DESC
         LIMIT 20`,
        [userId]
      ).then(r => r.rows),
      getFavorites(userId, 'channel'),
    ]);

    const featured = trendingMovies.find(m => m.backdrop_url) || trendingMovies[0] || null;

    res.json({
      featured,
      trending_movies: trendingMovies,
      trending_series: trendingSeries,
      continue_watching: continueWatching,
      favorite_channels: favoriteChannels,
    });
  } catch (err) {
    logger.error('[Home] sections error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── GET /api/home/trending ───────────────────────────────────────────────────

router.get('/trending', requireAuth, async (req, res) => {
  try {
    const type = req.query.type === 'tv' ? 'tv' : 'movie';
    const results = await fetchTmdbTrending(type);
    res.json({ results });
  } catch (err) {
    logger.error('[Home] trending error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── GET /api/home/favorites ──────────────────────────────────────────────────

router.get('/favorites', requireAuth, async (req, res) => {
  try {
    const itemType = req.query.type || null;
    const favorites = await getFavorites(req.user.id, itemType);
    res.json({ favorites });
  } catch (err) {
    logger.error('[Home] favorites get error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── POST /api/home/favorites ─────────────────────────────────────────────────

router.post('/favorites', requireAuth, async (req, res) => {
  try {
    const { itemType, itemId, itemName, posterUrl, providerId, metadata } = req.body;
    if (!itemType || !itemId || !itemName) {
      return res.status(400).json({ error: 'itemType, itemId, and itemName are required' });
    }
    const allowed = ['channel', 'category', 'movie', 'series'];
    if (!allowed.includes(itemType)) {
      return res.status(400).json({ error: `itemType must be one of: ${allowed.join(', ')}` });
    }
    const favorite = await addFavorite(req.user.id, {
      itemType, itemId, itemName, posterUrl, providerId, metadata,
    });
    res.status(201).json({ favorite });
  } catch (err) {
    logger.error('[Home] favorites add error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── DELETE /api/home/favorites/:id ──────────────────────────────────────────

router.delete('/favorites/:id', requireAuth, async (req, res) => {
  try {
    const removed = await removeFavorite(req.user.id, req.params.id);
    if (!removed) return res.status(404).json({ error: 'Favorite not found' });
    res.json({ success: true });
  } catch (err) {
    logger.error('[Home] favorites delete error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
