const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const providerService = require('../services/providerService');
const hostHealthService = require('../services/hostHealthService');
const epgService = require('../services/epgService');
const { providerQueries, vodQueries } = require('../db/queries');
const cache = require('../utils/cache');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// POST /api/providers
router.post('/',
  requireAuth,
  body('name').notEmpty().trim(),
  body('hosts').isArray({ min: 1 }),
  body('username').notEmpty(),
  body('password').notEmpty(),
  validate,
  async (req, res) => {
    try {
      const { name, hosts, username, password } = req.body;
      const provider = await providerService.create(req.user.id, { name, hosts, username, password });
      res.status(201).json(provider);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  }
);

// GET /api/providers
router.get('/', requireAuth, async (req, res) => {
  const providers = await providerQueries.findByUser(req.user.id);
  res.json(providers);
});

// GET /api/providers/:id
router.get('/:id', requireAuth, async (req, res) => {
  const provider = await providerQueries.findByIdAndUser(req.params.id, req.user.id);
  if (!provider) return res.status(404).json({ error: 'Provider not found' });
  res.json(provider);
});

// PATCH /api/providers/:id
router.patch('/:id',
  requireAuth,
  async (req, res) => {
    try {
      const updated = await providerQueries.update(req.params.id, req.user.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Provider not found' });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// DELETE /api/providers/:id
router.delete('/:id', requireAuth, async (req, res) => {
  await providerQueries.delete(req.params.id, req.user.id);
  res.json({ message: 'Provider deleted' });
});

// POST /api/providers/:id/test
router.post('/:id/test', requireAuth, async (req, res) => {
  try {
    const results = await providerService.testProvider(req.params.id, req.user.id);
    res.json(results);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/providers/:id/refresh
router.post('/:id/refresh', requireAuth, async (req, res) => {
  try {
    const result = await providerService.refreshCatalog(req.params.id, req.user.id);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/providers/:id/health
router.get('/:id/health', requireAuth, async (req, res) => {
  try {
    // Verify ownership
    const provider = await providerQueries.findByIdAndUser(req.params.id, req.user.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });
    const health = await hostHealthService.getProviderHealth(req.params.id);
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/providers/:id/health/recheck
router.post('/:id/health/recheck', requireAuth, async (req, res) => {
  try {
    const health = await hostHealthService.checkSingleProvider(req.params.id, req.user.id);
    res.json(health);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/providers/:id/stats
router.get('/:id/stats', requireAuth, async (req, res) => {
  try {
    const stats = await providerService.getStats(req.params.id, req.user.id, {
      includeAccountInfo: req.query.includeAccountInfo === 'true',
      forceAccountInfoRefresh: req.query.refreshAccountInfo === 'true',
    });
    res.json(stats);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/providers/:id/vod
router.get('/:id/vod', requireAuth, async (req, res) => {
  try {
    const provider = await providerQueries.findByIdAndUser(req.params.id, req.user.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const { type, page, limit, search, matched } = req.query;
    const items = await vodQueries.getByProvider(req.params.id, {
      userId: req.user.id,
      type,
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 50, 200),
      search,
      matched: matched === 'true' ? true : matched === 'false' ? false : undefined,
    });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/providers/:id/unmatched
router.get('/:id/unmatched', requireAuth, async (req, res) => {
  try {
    const provider = await providerQueries.findByIdAndUser(req.params.id, req.user.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });
    const items = await vodQueries.getUnmatchedTitles(req.params.id);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/providers/:id/live
router.get('/:id/live', requireAuth, async (req, res) => {
  try {
    const provider = await providerQueries.findByIdAndUser(req.params.id, req.user.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const { page, limit, search } = req.query;
    const requestedLimit = parseInt(limit, 10);
    const liveLimit = Number.isFinite(requestedLimit)
      ? Math.min(requestedLimit, 20000)
      : 20000;
    const items = await vodQueries.getByProvider(req.params.id, {
      type: 'live',
      page: parseInt(page) || 1,
      limit: liveLimit,
      search,
    });

    const host = provider.active_host || provider.hosts?.[0] || null;
    const username = encodeURIComponent(provider.username);
    const password = encodeURIComponent(provider.password);

    res.json(items.map(item => {
      const ext = item.container_extension || 'ts';
      const streamUrl = host
        ? `${host}/live/${username}/${password}/${item.stream_id}.${ext}`
        : null;

      return {
        ...item,
        name: item.raw_title,
        logo: item.poster_url,
        streamUrl,
      };
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/providers/:id/epg/refresh
router.post('/:id/epg/refresh', requireAuth, async (req, res) => {
  try {
    const provider = await providerQueries.findByIdAndUser(req.params.id, req.user.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const epgMap = await epgService.getEpgForProvider(req.params.id, req.user.id);
    res.json({ message: 'EPG refreshed', channels: epgMap.size });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/providers/:id/epg
router.get('/:id/epg', requireAuth, async (req, res) => {
  try {
    const provider = await providerQueries.findByIdAndUser(req.params.id, req.user.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const epgMap = await epgService.getEpgForProvider(req.params.id, req.user.id);

    // Convert Map to JSON-serializable format
    const epgData = {};
    for (const [channelId, programmes] of epgMap.entries()) {
      epgData[channelId] = {
        now: programmes.now ? {
          title: programmes.now.title,
          start: programmes.now.start?.toISOString(),
          stop: programmes.now.stop?.toISOString(),
        } : null,
        next: programmes.next ? {
          title: programmes.next.title,
          start: programmes.next.start?.toISOString(),
          stop: programmes.next.stop?.toISOString(),
        } : null,
      };
    }

    res.json(epgData);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Manual Match Override ─────────────────────────────────────────────────────

// GET /api/providers/:id/tmdb-search?q=title&type=movie|series
// Searches TMDB for a title so the user can pick the correct match
router.get('/:id/tmdb-search', requireAuth, async (req, res) => {
  try {
    const provider = await providerQueries.findByIdAndUser(req.params.id, req.user.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const { q, type = 'movie' } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing search query' });

    const TMDB_API_KEY = process.env.TMDB_API_KEY;
    if (!TMDB_API_KEY) return res.status(503).json({ error: 'TMDB not configured' });

    const endpoint = type === 'series' ? 'tv' : 'movie';
    const url = `https://api.themoviedb.org/3/search/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&page=1`;
    const fetch = require('node-fetch');
    const response = await fetch(url);
    if (!response.ok) return res.status(502).json({ error: 'TMDB search failed' });
    const data = await response.json();

    const results = (data.results || []).slice(0, 8).map(item => ({
      tmdbId: item.id,
      title: item.title || item.name,
      year: (item.release_date || item.first_air_date || '').slice(0, 4),
      poster: item.poster_path ? `https://image.tmdb.org/t/p/w185${item.poster_path}` : null,
      overview: item.overview,
      type,
    }));

    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/providers/:id/manual-match
// Body: { rawTitle, tmdbId, tmdbType }
// Saves a manual TMDB match for a VOD title (overrides auto-matching)
router.post('/:id/manual-match',
  requireAuth,
  body('rawTitle').notEmpty().trim(),
  body('tmdbId').isInt({ min: 1 }),
  body('tmdbType').isIn(['movie', 'series']),
  validate,
  async (req, res) => {
    try {
      const provider = await providerQueries.findByIdAndUser(req.params.id, req.user.id);
      if (!provider) return res.status(404).json({ error: 'Provider not found' });

      const { rawTitle, tmdbId, tmdbType } = req.body;
      const { matchQueries } = require('../db/queries');
      const fetch = require('node-fetch');
      const TMDB_API_KEY = process.env.TMDB_API_KEY;

      // Fetch imdb_id from TMDB for the selected item
      let imdbId = null;
      if (TMDB_API_KEY) {
        try {
          const path = tmdbType === 'series' ? `tv/${tmdbId}/external_ids` : `movie/${tmdbId}/external_ids`;
          const r = await fetch(`https://api.themoviedb.org/3/${path}?api_key=${TMDB_API_KEY}`);
          if (r.ok) {
            const d = await r.json();
            imdbId = d.imdb_id || null;
          }
        } catch (_) {}
      }

      await matchQueries.upsert({
        rawTitle,
        tmdbId,
        tmdbType,
        imdbId,
        confidenceScore: 1.0, // Manual = 100% confidence
      });

      // Mark as manually matched so auto-job won't overwrite
      const { pool } = require('../db/queries');
      await pool.query(
        `UPDATE matched_content SET manually_matched = true WHERE raw_title = $1`,
        [rawTitle]
      );

      // Flush any cached streams for this user
      const { vodQueries: vq } = require('../db/queries');
      res.json({ success: true, rawTitle, tmdbId, tmdbType, imdbId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
