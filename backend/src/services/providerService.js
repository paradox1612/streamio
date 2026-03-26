const fetch = require('node-fetch');
const { providerQueries, vodQueries } = require('../db/queries');
const logger = require('../utils/logger');
const { normalizeTitle } = require('../utils/titleNormalization');

const FETCH_TIMEOUT = 20000; // 20s — some providers are slow

function isTruthyAuth(value) {
  return value === 1 || value === '1' || value === true;
}

function normalizeAccountInfo(data) {
  const user = data?.user_info || {};
  const server = data?.server_info || {};
  const expDate = user.exp_date ? new Date(Number(user.exp_date) * 1000).toISOString() : null;
  const createdAt = user.created_at ? new Date(Number(user.created_at) * 1000).toISOString() : null;

  return {
    status: user.status || null,
    isTrial: user.is_trial === 1 || user.is_trial === '1' || user.is_trial === true,
    expiresAt: expDate,
    createdAt,
    maxConnections: user.max_connections != null ? parseInt(user.max_connections, 10) : null,
    activeConnections: user.active_cons != null ? parseInt(user.active_cons, 10) : null,
    allowedOutputFormats: Array.isArray(user.allowed_output_formats) ? user.allowed_output_formats : [],
    serverTimeNow: server.time_now || null,
    serverTimezone: server.timezone || null,
    url: server.url || null,
    port: server.port || null,
    httpsPort: server.https_port || null,
  };
}

async function fetchAccountInfoForHost(host, username, password) {
  const url = `${host}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    if (data?.user_info?.auth === 0 || data?.user_info?.auth === '0' || data?.user_info?.auth === false) {
      return { ok: false, error: 'Invalid credentials' };
    }
    if (isTruthyAuth(data?.user_info?.auth) || data?.user_info) {
      return { ok: true, host, accountInfo: normalizeAccountInfo(data) };
    }
    return { ok: false, error: 'Unexpected response' };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, error: err.message };
  }
}

/**
 * Retry logic for xtream requests with exponential backoff.
 * Retries up to 3 times on network errors or 5xx responses.
 * Does NOT retry on 401/403 (auth errors).
 */
async function xtreamRequest(host, username, password, action, extraParams = '') {
  const url = `${host}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=${action}${extraParams}`;
  const maxRetries = 3;
  const backoffs = [1000, 2000, 4000]; // exponential backoff: 1s, 2s, 4s

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      // Don't retry auth errors
      if (res.status === 401 || res.status === 403) {
        throw new Error(`HTTP ${res.status}`);
      }

      // Retry on 5xx errors
      if (!res.ok && res.status >= 500) {
        if (attempt < maxRetries - 1) {
          const delay = backoffs[attempt];
          logger.warn(`xtreamRequest: HTTP ${res.status}, retrying in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data;
    } catch (err) {
      clearTimeout(timer);

      // Retry on network errors
      if (attempt < maxRetries - 1) {
        const delay = backoffs[attempt];
        logger.warn(`xtreamRequest: ${err.message}, retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      throw err;
    }
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
    return fetchAccountInfoForHost(host, username, password);
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

  async getLiveStreams(providerId, userId) {
    const provider = await providerQueries.findByIdAndUser(providerId, userId);
    if (!provider) throw Object.assign(new Error('Provider not found'), { status: 404 });

    const host = provider.active_host || provider.hosts[0];
    if (!host) throw new Error('No host available');

    try {
      // Fetch live categories and channels in parallel
      const [liveCategoryMap, liveChannels] = await Promise.all([
        fetchCategoryMap(host, provider.username, provider.password, 'get_live_categories'),
        xtreamRequest(host, provider.username, provider.password, 'get_live_streams').catch(() => []),
      ]);

      if (!Array.isArray(liveChannels)) return [];

      const liveStreams = liveChannels.map(ch => ({
        userId: provider.user_id,
        providerId,
        streamId: String(ch.stream_id),
        rawTitle: ch.name || String(ch.stream_id),
        normalizedTitle: normalizeTitle(ch.name || String(ch.stream_id)),
        posterUrl: ch.stream_icon || null,
        category: liveCategoryMap[String(ch.category_id)] || 'Unknown',
        vodType: 'live',
        containerExtension: ch.container_extension || 'ts',
        epgChannelId: ch.epg_channel_id || null,
      }));

      return liveStreams;
    } catch (err) {
      logger.warn(`Failed to fetch live streams for provider ${providerId}: ${err.message}`);
      return [];
    }
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

    // ── 2. Fetch VOD movies and series in parallel ─────────────────────────────
    const [vodMoviesResult, vodSeriesResult] = await Promise.allSettled([
      xtreamRequest(host, provider.username, provider.password, 'get_vod_streams'),
      xtreamRequest(host, provider.username, provider.password, 'get_series'),
    ]);

    let vodMovies = [];
    if (vodMoviesResult.status === 'fulfilled' && Array.isArray(vodMoviesResult.value)) {
      vodMovies = vodMoviesResult.value.map(m => ({
        userId: provider.user_id,
        providerId,
        streamId: String(m.stream_id),
        rawTitle: m.name || String(m.stream_id),
        normalizedTitle: normalizeTitle(m.name || String(m.stream_id)),
        posterUrl: m.stream_icon || null,
        category: vodCategoryMap[String(m.category_id)] || m.category_name || 'Unknown',
        vodType: 'movie',
        containerExtension: m.container_extension || 'mp4',
      }));
      logger.info(`Fetched ${vodMovies.length} movies`);
    } else if (vodMoviesResult.status === 'rejected') {
      logger.warn(`Failed to fetch VOD movies: ${vodMoviesResult.reason?.message}`);
    }

    let vodSeries = [];
    if (vodSeriesResult.status === 'fulfilled' && Array.isArray(vodSeriesResult.value)) {
      vodSeries = vodSeriesResult.value.map(s => ({
        userId: provider.user_id,
        providerId,
        streamId: String(s.series_id),
        rawTitle: s.name || String(s.series_id),
        normalizedTitle: normalizeTitle(s.name || String(s.series_id)),
        posterUrl: s.cover || null,
        category: seriesCategoryMap[String(s.category_id)] || s.genre?.split(',')[0]?.trim() || 'Unknown',
        vodType: 'series',
        containerExtension: null,
      }));
      logger.info(`Fetched ${vodSeries.length} series`);
    } else if (vodSeriesResult.status === 'rejected') {
      logger.warn(`Failed to fetch series: ${vodSeriesResult.reason?.message}`);
    }

    // ── 3. Fetch live streams ──────────────────────────────────────────────────
    let liveStreams = [];
    try {
      liveStreams = await providerService.getLiveStreams(providerId, userId);
      logger.info(`Fetched ${liveStreams.length} live channels`);
    } catch (err) {
      logger.warn(`Failed to fetch live streams: ${err.message}`);
    }

    // ── 4. Upsert everything in chunks ────────────────────────────────────────
    const all = [...vodMovies, ...vodSeries, ...liveStreams];
    if (all.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < all.length; i += CHUNK) {
        await vodQueries.upsertBatch(all.slice(i, i + CHUNK));
      }
    }

    logger.info(`Catalog refreshed: ${vodMovies.length} movies, ${vodSeries.length} series, ${liveStreams.length} live channels`);
    return { movies: vodMovies.length, series: vodSeries.length, live: liveStreams.length, total: all.length };
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

    const hostToCheck = provider.active_host || provider.hosts?.[0];
    const [vodStats, matchStats, categories, accountResult] = await Promise.all([
      vodQueries.getStats(providerId),
      vodQueries.getMatchStats(providerId),
      vodQueries.getCategoryBreakdown(providerId),
      hostToCheck
        ? fetchAccountInfoForHost(hostToCheck, provider.username, provider.password)
        : Promise.resolve({ ok: false, error: 'No host available' }),
    ]);

    return {
      provider,
      vodStats,
      matchStats,
      categories,
      accountInfo: accountResult.ok ? accountResult.accountInfo : null,
      accountInfoError: accountResult.ok ? null : accountResult.error,
    };
  },
};

module.exports = providerService;
