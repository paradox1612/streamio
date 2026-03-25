const fetch = require('node-fetch');
const { providerQueries, vodQueries } = require('../db/queries');
const logger = require('../utils/logger');

const FETCH_TIMEOUT = 20000; // 20s — some providers are slow

async function xtreamRequest(host, username, password, action, extraParams = '') {
  const url = `${host}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=${action}${extraParams}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// Build a category_id → name map from a categories endpoint
async function fetchCategoryMap(host, username, password, action) {
  try {
    const cats = await xtreamRequest(host, username, password, action);
    if (!Array.isArray(cats)) return {};
    const map = {};
    cats.forEach(c => {
      if (c.category_id) map[String(c.category_id)] = c.category_name || String(c.category_id);
    });
    return map;
  } catch (_) {
    return {};
  }
}

const providerService = {
  async create(userId, { name, hosts, username, password }) {
    const cleanHosts = hosts.map(h => h.replace(/\/+$/, ''));
    return providerQueries.create({ userId, name, hosts: cleanHosts, username, password });
  },

  async testConnection(host, username, password) {
    try {
      // Test by fetching user/server info (no action param)
      const url = `${host}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      // Valid response has user_info.auth === 1
      if (data?.user_info?.auth === 1) return { ok: true, host };
      if (data?.user_info?.auth === 0) return { ok: false, error: 'Invalid credentials' };
      // Some providers return the info without auth field — still OK if user_info exists
      if (data?.user_info) return { ok: true, host };
      return { ok: false, error: 'Unexpected response' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  async testProvider(providerId, userId) {
    const provider = await providerQueries.findByIdAndUser(providerId, userId);
    if (!provider) throw Object.assign(new Error('Provider not found'), { status: 404 });

    const results = [];
    for (const host of provider.hosts) {
      const result = await providerService.testConnection(host, provider.username, provider.password);
      results.push({ host, ...result });
    }

    const working = results.find(r => r.ok);
    await providerQueries.updateHealth(providerId, {
      activeHost: working?.host || null,
      status: working ? 'online' : 'offline',
    });

    return results;
  },

  async refreshCatalog(providerId, userId) {
    const provider = await providerQueries.findByIdAndUser(providerId, userId);
    if (!provider) throw Object.assign(new Error('Provider not found'), { status: 404 });

    const host = provider.active_host || provider.hosts[0];
    if (!host) throw new Error('No host available');

    logger.info(`Refreshing catalog for provider "${provider.name}" (${providerId})`);

    // ── 1. Fetch category maps upfront ───────────────────────────────────────
    const [vodCategoryMap, seriesCategoryMap] = await Promise.all([
      fetchCategoryMap(host, provider.username, provider.password, 'get_vod_categories'),
      fetchCategoryMap(host, provider.username, provider.password, 'get_series_categories'),
    ]);
    logger.info(`Categories loaded: ${Object.keys(vodCategoryMap).length} VOD, ${Object.keys(seriesCategoryMap).length} series`);

    // ── 2. Fetch VOD movies ───────────────────────────────────────────────────
    let vodMovies = [];
    try {
      const raw = await xtreamRequest(host, provider.username, provider.password, 'get_vod_streams');
      if (Array.isArray(raw)) {
        vodMovies = raw.map(m => ({
          userId: provider.user_id,
          providerId,
          // stream_id is the unique ID for the movie stream
          streamId: String(m.stream_id),
          rawTitle: m.name || String(m.stream_id),
          posterUrl: m.stream_icon || null,
          // category_id is always present; category_name sometimes missing
          category: vodCategoryMap[String(m.category_id)] || m.category_name || 'Unknown',
          vodType: 'movie',
          // container_extension tells us the file format (mp4, mkv, avi…)
          containerExtension: m.container_extension || 'mp4',
        }));
        logger.info(`Fetched ${vodMovies.length} movies`);
      }
    } catch (err) {
      logger.warn(`Failed to fetch VOD movies: ${err.message}`);
    }

    // ── 3. Fetch series ───────────────────────────────────────────────────────
    // get_series returns series-level objects (not individual episodes).
    // Each has a series_id. To stream individual episodes you call
    // get_series_info&series_id=X which returns seasons+episodes.
    // For the catalog we just store series at the show level;
    // episodes are resolved at stream time.
    let vodSeries = [];
    try {
      const raw = await xtreamRequest(host, provider.username, provider.password, 'get_series');
      if (Array.isArray(raw)) {
        vodSeries = raw.map(s => ({
          userId: provider.user_id,
          providerId,
          // series_id is the unique ID for the whole series
          streamId: String(s.series_id),
          rawTitle: s.name || String(s.series_id),
          posterUrl: s.cover || null,
          // series response has category_id (number) but no category_name field
          // use the map first, then fall back to the genre string on the object
          category: seriesCategoryMap[String(s.category_id)] || s.genre?.split(',')[0]?.trim() || 'Unknown',
          vodType: 'series',
          containerExtension: null, // resolved per-episode at stream time
        }));
        logger.info(`Fetched ${vodSeries.length} series`);
      }
    } catch (err) {
      logger.warn(`Failed to fetch series: ${err.message}`);
    }

    // ── 4. Upsert everything in chunks ────────────────────────────────────────
    const all = [...vodMovies, ...vodSeries];
    if (all.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < all.length; i += CHUNK) {
        await vodQueries.upsertBatch(all.slice(i, i + CHUNK));
      }
    }

    logger.info(`Catalog refreshed: ${vodMovies.length} movies, ${vodSeries.length} series`);
    return { movies: vodMovies.length, series: vodSeries.length, total: all.length };
  },

  // Resolve individual episode stream URL at playback time
  async getSeriesEpisodes(host, username, password, seriesId) {
    try {
      const data = await xtreamRequest(host, username, password, 'get_series_info', `&series_id=${seriesId}`);
      // Response: { info: {...}, seasons: [...], episodes: { "1": [{...}], "2": [{...}] } }
      return data?.episodes || {};
    } catch (err) {
      logger.warn(`Failed to get series info for ${seriesId}: ${err.message}`);
      return {};
    }
  },

  async getStats(providerId, userId) {
    const provider = await providerQueries.findByIdAndUser(providerId, userId);
    if (!provider) throw Object.assign(new Error('Provider not found'), { status: 404 });

    const [vodStats, matchStats, categories] = await Promise.all([
      vodQueries.getStats(providerId),
      vodQueries.getMatchStats(providerId),
      vodQueries.getCategoryBreakdown(providerId),
    ]);

    return { provider, vodStats, matchStats, categories };
  },
};

module.exports = providerService;
