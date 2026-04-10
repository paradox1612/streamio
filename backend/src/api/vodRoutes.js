const express = require('express');
const router = express.Router();
const tmdbService = require('../services/tmdbService');
const { vodQueries } = require('../db/queries');
const auth = require('../middleware/auth');
const logger = require('../utils/logger');

// GET /api/vod/similar?tmdbId=X&type=movie|tv
router.get('/similar', auth.requireAuth, async (req, res) => {
  try {
    const { tmdbId, type } = req.query;
    if (!tmdbId) return res.status(400).json({ error: 'tmdbId is required' });

    const similar = await tmdbService.getSimilar(tmdbId, type);
    
    // Check if each item exists in user's library
    const results = await Promise.all(similar.map(async (item) => {
      const inLibrary = await vodQueries.findByTmdbIdForUser(req.user.id, item.id);
      return {
        ...item,
        in_library: !!inLibrary,
        library_item: inLibrary || null
      };
    }));

    res.json(results);
  } catch (err) {
    logger.error('Error fetching similar titles:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/vod/details?tmdbId=X&type=movie|tv
router.get('/details', auth.requireAuth, async (req, res) => {
  try {
    const { tmdbId, type } = req.query;
    if (!tmdbId) return res.status(400).json({ error: 'tmdbId is required' });

    let details;
    if (type === 'series' || type === 'tv') {
      details = await tmdbService.getSeriesDetails(tmdbId);
    } else {
      details = await tmdbService.getMovieDetails(tmdbId);
    }

    if (!details) return res.status(404).json({ error: 'Details not found' });

    res.json(details);
  } catch (err) {
    logger.error('Error fetching TMDB details:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/vod/browse?providerId=X
// Fetches multiple sections (newest, movies, series, rating) in one go
router.get('/browse', auth.requireAuth, async (req, res) => {
  try {
    const { providerId } = req.query;
    if (!providerId) return res.status(400).json({ error: 'providerId is required' });

    const provider = await vodQueries.getProviderCatalogContext(providerId);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const host = provider.active_host || provider.hosts?.[0] || null;
    const username = encodeURIComponent(provider.username);
    const password = encodeURIComponent(provider.password);

    const mapItem = (item) => {
      const ext = item.container_extension || (item.vod_type === 'series' ? 'mkv' : 'mp4');
      const streamUrl = host && item.vod_type !== 'series'
        ? `${host}/${item.vod_type === 'movie' ? 'movie' : 'live'}/${username}/${password}/${item.stream_id}.${ext}`
        : null;
      return { ...item, streamUrl };
    };

    const [newest, movies, series, rating] = await Promise.all([
      vodQueries.getByProvider(providerId, { userId: req.user.id, limit: 20, sort: 'newest' }),
      vodQueries.getByProvider(providerId, { userId: req.user.id, limit: 20, type: 'movie' }),
      vodQueries.getByProvider(providerId, { userId: req.user.id, limit: 20, type: 'series' }),
      vodQueries.getByProvider(providerId, { userId: req.user.id, limit: 20, sort: 'rating' }),
    ]);

    res.json({
      newest: newest.map(mapItem),
      movies: movies.map(mapItem),
      series: series.map(mapItem),
      rating: rating.map(mapItem),
    });
  } catch (err) {
    logger.error('Error in VOD browse:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
