const fetch = require('node-fetch');
const crypto = require('crypto');
const { providerQueries, providerNetworkQueries, canonicalContentQueries, vodQueries, pool } = require('../db/queries');
const logger = require('../utils/logger');
const cache = require('../utils/cache');
const { normalizeTitle, parseMovieTitle, parseReleaseTitle, parseSeriesTitle } = require('../utils/titleNormalization');

const FETCH_TIMEOUT = 20000; // 20s — some providers are slow
const ACCOUNT_LOOKUP_SUCCESS_TTL_SECONDS = parseInt(process.env.ACCOUNT_LOOKUP_SUCCESS_TTL_SECONDS || '600', 10);
const ACCOUNT_LOOKUP_FAILURE_TTL_SECONDS = parseInt(process.env.ACCOUNT_LOOKUP_FAILURE_TTL_SECONDS || '300', 10);

function buildAccountLookupCacheKey(host, username, password) {
  return crypto
    .createHash('sha256')
    .update(`${host}|${username}|${password}`)
    .digest('hex');
}

function isTruthyAuth(value) {
  return value === 1 || value === '1' || value === true;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value != null && typeof value !== 'string') return String(value);
  }
  return null;
}

function normalizeCategory(value, fallback = 'Unknown') {
  return firstNonEmpty(value) || fallback;
}

function normalizeHostList(hosts = []) {
  return Array.from(new Set(
    hosts
      .map(host => String(host || '').trim())
      .filter(Boolean)
      .map(host => host.replace(/\/+$/, ''))
  ));
}

function buildCatalogOverlapSignature(entry) {
  return [
    entry.vodType || entry.vod_type || '',
    entry.canonicalNormalizedTitle || entry.canonical_normalized_title || entry.normalizedTitle || entry.normalized_title || '',
    entry.titleYear || entry.title_year || '',
  ].join('|');
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
  const cacheKey = buildAccountLookupCacheKey(host, username, password);
  const cached = cache.get('providerAccountInfo', cacheKey);
  if (cached) return cached;

  const url = `${host}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      const result = { ok: false, error: `HTTP ${res.status}` };
      cache.set('providerAccountInfo', cacheKey, result, ACCOUNT_LOOKUP_FAILURE_TTL_SECONDS);
      return result;
    }
    const data = await res.json();
    if (data?.user_info?.auth === 0 || data?.user_info?.auth === '0' || data?.user_info?.auth === false) {
      const result = { ok: false, error: 'Invalid credentials' };
      cache.set('providerAccountInfo', cacheKey, result, ACCOUNT_LOOKUP_FAILURE_TTL_SECONDS);
      return result;
    }
    if (isTruthyAuth(data?.user_info?.auth) || data?.user_info) {
      const result = { ok: true, host, accountInfo: normalizeAccountInfo(data) };
      cache.set('providerAccountInfo', cacheKey, result, ACCOUNT_LOOKUP_SUCCESS_TTL_SECONDS);
      return result;
    }
    const result = { ok: false, error: 'Unexpected response' };
    cache.set('providerAccountInfo', cacheKey, result, ACCOUNT_LOOKUP_FAILURE_TTL_SECONDS);
    return result;
  } catch (err) {
    clearTimeout(timer);
    const result = { ok: false, error: err.message };
    cache.set('providerAccountInfo', cacheKey, result, ACCOUNT_LOOKUP_FAILURE_TTL_SECONDS);
    return result;
  }
}

async function getProviderAccountInfo(provider, { forceRefresh = false } = {}) {
  const hostToCheck = provider.active_host || provider.hosts?.[0];
  if (!hostToCheck) {
    return { ok: false, error: 'No host available' };
  }

  const cacheKey = `${provider.id}:${hostToCheck}`;
  if (!forceRefresh) {
    const cached = cache.get('providerAccountInfo', cacheKey);
    if (cached) return cached;
  } else {
    cache.del('providerAccountInfo', buildAccountLookupCacheKey(hostToCheck, provider.username, provider.password));
  }

  const result = await fetchAccountInfoForHost(hostToCheck, provider.username, provider.password);
  cache.set('providerAccountInfo', cacheKey, result, result.ok ? ACCOUNT_LOOKUP_SUCCESS_TTL_SECONDS : ACCOUNT_LOOKUP_FAILURE_TTL_SECONDS);
  return result;
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
      const categoryId = firstNonEmpty(c.category_id, c.id);
      const categoryName = normalizeCategory(
        firstNonEmpty(c.category_name, c.name, c.category, c.title),
        categoryId || 'Unknown'
      );

      if (categoryId) {
        map[String(categoryId)] = categoryName;
      }
    });
    return map;
  } catch (_) {
    return {};
  }
}

const providerService = {
  async create(userId, { name, hosts, username, password }) {
    const cleanHosts = normalizeHostList(hosts);
    let network = null;

    const knownHosts = await providerNetworkQueries.listAllHosts();
    for (const candidate of knownHosts) {
      const result = await fetchAccountInfoForHost(candidate.host_url, username, password);
      if (result.ok) {
        network = await providerNetworkQueries.findById(candidate.provider_network_id);
        break;
      }
    }

    if (!network) {
      network = await providerNetworkQueries.create({
        name: `${name} Network`,
        identityKey: cleanHosts[0] || null,
      });
    }

    await providerNetworkQueries.addHosts(network.id, cleanHosts);

    return providerQueries.create({
      userId,
      name,
      hosts: cleanHosts,
      username,
      password,
      networkId: network.id,
      catalogVariant: false,
    });
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
        ...parseReleaseTitle(ch.name || String(ch.stream_id)),
        userId: provider.user_id,
        providerId,
        streamId: String(ch.stream_id),
        rawTitle: ch.name || String(ch.stream_id),
        normalizedTitle: normalizeTitle(ch.name || String(ch.stream_id)),
        posterUrl: ch.stream_icon || null,
        category: normalizeCategory(
          liveCategoryMap[String(ch.category_id)] ||
          firstNonEmpty(ch.category_name, ch.category, ch.group, ch.genre),
          'Live TV'
        ),
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

  async refreshCatalog(providerId, userId, { onProgress } = {}) {
    const provider = await providerQueries.findByIdAndUser(providerId, userId);
    if (!provider) throw Object.assign(new Error('Provider not found'), { status: 404 });

    const host = provider.active_host || provider.hosts[0];
    if (!host) throw new Error('No host available');

    const progress = async (patch) => {
      if (!onProgress) return;
      await onProgress({
        providerId,
        providerName: provider.name,
        userId,
        ...patch,
      });
    };

    logger.info(`Refreshing catalog for provider "${provider.name}" (${providerId})`);
    await progress({
      stage: 'fetching_categories',
      progressPct: 5,
      message: 'Loading provider categories',
    });

    // ── 1. Fetch category maps upfront ───────────────────────────────────────
    const [vodCategoryMap, seriesCategoryMap] = await Promise.all([
      fetchCategoryMap(host, provider.username, provider.password, 'get_vod_categories'),
      fetchCategoryMap(host, provider.username, provider.password, 'get_series_categories'),
    ]);
    logger.info(`Categories loaded: ${Object.keys(vodCategoryMap).length} VOD, ${Object.keys(seriesCategoryMap).length} series`);
    await progress({
      stage: 'fetching_vod',
      progressPct: 12,
      message: 'Fetching movies and series',
      categoryCounts: {
        vod: Object.keys(vodCategoryMap).length,
        series: Object.keys(seriesCategoryMap).length,
      },
    });

    // ── 2. Fetch VOD movies and series in parallel ─────────────────────────────
    const [vodMoviesResult, vodSeriesResult] = await Promise.allSettled([
      xtreamRequest(host, provider.username, provider.password, 'get_vod_streams'),
      xtreamRequest(host, provider.username, provider.password, 'get_series'),
    ]);

    let vodMovies = [];
    if (vodMoviesResult.status === 'fulfilled' && Array.isArray(vodMoviesResult.value)) {
      vodMovies = vodMoviesResult.value.map(m => ({
        ...parseMovieTitle(m.name || String(m.stream_id)),
        userId: provider.user_id,
        providerId,
        streamId: String(m.stream_id),
        rawTitle: m.name || String(m.stream_id),
        normalizedTitle: normalizeTitle(m.name || String(m.stream_id)),
        posterUrl: m.stream_icon || null,
        category: normalizeCategory(vodCategoryMap[String(m.category_id)] || m.category_name),
        vodType: 'movie',
        containerExtension: m.container_extension || 'mp4',
      }));
      logger.info(`Fetched ${vodMovies.length} movies`);
      await progress({
        stage: 'fetching_series',
        progressPct: 28,
        message: 'Movies fetched, fetching series',
        counts: {
          movies: vodMovies.length,
        },
      });
    } else if (vodMoviesResult.status === 'rejected') {
      logger.warn(`Failed to fetch VOD movies: ${vodMoviesResult.reason?.message}`);
    }

    let vodSeries = [];
    if (vodSeriesResult.status === 'fulfilled' && Array.isArray(vodSeriesResult.value)) {
      vodSeries = vodSeriesResult.value.map(s => ({
        ...parseSeriesTitle(s.name || String(s.series_id)),
        userId: provider.user_id,
        providerId,
        streamId: String(s.series_id),
        rawTitle: s.name || String(s.series_id),
        normalizedTitle: normalizeTitle(s.name || String(s.series_id)),
        posterUrl: s.cover || null,
        category: normalizeCategory(seriesCategoryMap[String(s.category_id)] || s.genre?.split(',')[0]),
        vodType: 'series',
        containerExtension: null,
      }));
      logger.info(`Fetched ${vodSeries.length} series`);
      await progress({
        stage: 'fetching_live',
        progressPct: 44,
        message: 'Movies and series fetched, fetching live channels',
        counts: {
          movies: vodMovies.length,
          series: vodSeries.length,
        },
      });
    } else if (vodSeriesResult.status === 'rejected') {
      logger.warn(`Failed to fetch series: ${vodSeriesResult.reason?.message}`);
    }

    // ── 3. Fetch live streams ──────────────────────────────────────────────────
    let liveStreams = [];
    try {
      liveStreams = await providerService.getLiveStreams(providerId, userId);
      logger.info(`Fetched ${liveStreams.length} live channels`);
      await progress({
        stage: 'persisting_catalog',
        progressPct: 58,
        message: 'Fetched source data, saving catalog',
        counts: {
          movies: vodMovies.length,
          series: vodSeries.length,
          live: liveStreams.length,
          total: vodMovies.length + vodSeries.length + liveStreams.length,
        },
      });
    } catch (err) {
      logger.warn(`Failed to fetch live streams: ${err.message}`);
    }

    // ── 4. Upsert everything in chunks ────────────────────────────────────────
    const all = [...vodMovies, ...vodSeries, ...liveStreams];
    const resolvedEntries = provider.network_id
      ? await canonicalContentQueries.resolveEntries(all, {
        providerNetworkId: provider.network_id,
        providerId,
      })
      : all;

    let catalogVariant = Boolean(provider.catalog_variant);
    if (provider.network_id && resolvedEntries.length > 0) {
      const { rows: existingNetworkRows } = await pool.query(
        `SELECT vod_type, canonical_normalized_title, title_year
         FROM network_vod
         WHERE provider_network_id = $1
         LIMIT 250`,
        [provider.network_id]
      );

      if (existingNetworkRows.length > 0) {
        const existingSignatures = new Set(existingNetworkRows.map(buildCatalogOverlapSignature));
        const incomingSignatures = new Set(resolvedEntries.map(buildCatalogOverlapSignature));
        let overlap = 0;
        for (const signature of incomingSignatures) {
          if (existingSignatures.has(signature)) overlap += 1;
        }
        const overlapRatio = incomingSignatures.size === 0 ? 1 : overlap / incomingSignatures.size;
        catalogVariant = overlapRatio < 0.6;
        await providerQueries.update(providerId, userId, { catalog_variant: catalogVariant });
      }
    }

    if (all.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < resolvedEntries.length; i += CHUNK) {
        const chunk = resolvedEntries.slice(i, i + CHUNK);
        await vodQueries.upsertBatch(chunk);
        if (provider.network_id && !catalogVariant) {
          await vodQueries.upsertNetworkBatch(chunk.map(entry => ({
            ...entry,
            providerNetworkId: provider.network_id,
          })));
        }
        const persisted = Math.min(i + chunk.length, resolvedEntries.length);
        const persistRatio = resolvedEntries.length === 0 ? 1 : persisted / resolvedEntries.length;
        await progress({
          stage: 'persisting_catalog',
          progressPct: Math.min(96, Math.round(58 + persistRatio * 36)),
          message: `Saving catalog entries ${persisted.toLocaleString()} / ${resolvedEntries.length.toLocaleString()}`,
          counts: {
            movies: vodMovies.length,
            series: vodSeries.length,
            live: liveStreams.length,
            total: all.length,
            persisted,
          },
        });
      }
    }

    if (provider.network_id && !catalogVariant) {
      await providerNetworkQueries.touchCatalogRefresh(provider.network_id);
    }

    logger.info(`Catalog refreshed: ${vodMovies.length} movies, ${vodSeries.length} series, ${liveStreams.length} live channels`);
    await progress({
      stage: 'completed',
      progressPct: 100,
      message: 'Catalog refresh complete',
      counts: {
        movies: vodMovies.length,
        series: vodSeries.length,
        live: liveStreams.length,
        total: all.length,
        persisted: resolvedEntries.length,
      },
    });
    return {
      movies: vodMovies.length,
      series: vodSeries.length,
      live: liveStreams.length,
      total: all.length,
      providerNetworkId: provider.network_id || null,
      catalogVariant,
    };
  },

  async fetchManagedCatalog(host, username, password, providerGroupId) {
    const [vodCategoryMap, seriesCategoryMap] = await Promise.all([
      fetchCategoryMap(host, username, password, 'get_vod_categories'),
      fetchCategoryMap(host, username, password, 'get_series_categories'),
    ]);

    const [vodMoviesResult, vodSeriesResult] = await Promise.allSettled([
      xtreamRequest(host, username, password, 'get_vod_streams'),
      xtreamRequest(host, username, password, 'get_series'),
    ]);

    let vodMovies = [];
    if (vodMoviesResult.status === 'fulfilled' && Array.isArray(vodMoviesResult.value)) {
      vodMovies = vodMoviesResult.value.map(m => ({
        ...parseMovieTitle(m.name || String(m.stream_id)),
        providerGroupId,
        streamId: String(m.stream_id),
        rawTitle: m.name || String(m.stream_id),
        normalizedTitle: normalizeTitle(m.name || String(m.stream_id)),
        posterUrl: m.stream_icon || null,
        category: normalizeCategory(vodCategoryMap[String(m.category_id)] || m.category_name),
        vodType: 'movie',
        containerExtension: m.container_extension || 'mp4',
      }));
    }

    let vodSeries = [];
    if (vodSeriesResult.status === 'fulfilled' && Array.isArray(vodSeriesResult.value)) {
      vodSeries = vodSeriesResult.value.map(s => ({
        ...parseSeriesTitle(s.name || String(s.series_id)),
        providerGroupId,
        streamId: String(s.series_id),
        rawTitle: s.name || String(s.series_id),
        normalizedTitle: normalizeTitle(s.name || String(s.series_id)),
        posterUrl: s.cover || null,
        category: normalizeCategory(seriesCategoryMap[String(s.category_id)] || s.genre?.split(',')[0]),
        vodType: 'series',
        containerExtension: null,
      }));
    }

    return {
      movies: vodMovies,
      series: vodSeries,
    };
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

  async getStats(providerId, userId, { includeAccountInfo = false, forceAccountInfoRefresh = false } = {}) {
    const provider = await providerQueries.findByIdAndUser(providerId, userId);
    if (!provider) throw Object.assign(new Error('Provider not found'), { status: 404 });

    const [vodStats, matchStats, categories] = await Promise.all([
      vodQueries.getStats(providerId),
      vodQueries.getMatchStats(providerId),
      vodQueries.getCategoryBreakdown(providerId),
    ]);

    const accountResult = includeAccountInfo
      ? await getProviderAccountInfo(provider, { forceRefresh: forceAccountInfoRefresh })
      : null;

    return {
      provider,
      vodStats,
      matchStats,
      categories,
      accountInfo: accountResult?.ok ? accountResult.accountInfo : null,
      accountInfoError: accountResult ? (accountResult.ok ? null : accountResult.error) : null,
      canonicalCoverage: await canonicalContentQueries.getCoverage(),
    };
  },
};

module.exports = providerService;
