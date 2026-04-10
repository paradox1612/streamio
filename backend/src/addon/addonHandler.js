const fetch = require('node-fetch');
const { userQueries, providerQueries, vodQueries, watchHistoryQueries, tmdbQueries, matchQueries, pool } = require('../db/queries');
const providerService = require('../services/providerService');
const freeAccessService = require('../services/freeAccessService');
const epgService = require('../services/epgService');
const hostHealthService = require('../services/hostHealthService');
const cache = require('../utils/cache');
const logger = require('../utils/logger');
const { touchUserLastSeen } = require('../utils/userActivity');
const { normalizeTitle, extractContentLanguages, parseMovieTitle, parseReleaseTitle, parseSeriesTitle } = require('../utils/titleNormalization');
const { beginAddonRequest, endAddonRequest } = require('../utils/loadManager');

const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const RESOLVER_DEBUG = ['1', 'true', 'yes', 'on'].includes(String(process.env.RESOLVER_DEBUG || '').toLowerCase());
const pendingOnDemandMatches = new Map();
const lookupMetrics = {
  cacheHits: 0,
  cacheMisses: 0,
  slowPathCount: 0,
  slowPathMs: 0,
  hostRechecks: 0,
};

function recordLookupMetric(metric, amount = 1) {
  lookupMetrics[metric] = (lookupMetrics[metric] || 0) + amount;
}

function logResolverDebug(message, details = null) {
  if (!RESOLVER_DEBUG) return;
  if (details) {
    logger.debug(`[ResolverDebug] ${message} ${JSON.stringify(details)}`);
    return;
  }
  logger.debug(`[ResolverDebug] ${message}`);
}

function buildLookupCacheKey(userId, baseId, mode = 'single') {
  return `${userId}:${mode}:${baseId}`;
}

async function getCachedLookupResult(cacheKey) {
  const hit = await cache.get('resolvedVodLookup', cacheKey);
  if (hit) {
    recordLookupMetric('cacheHits');
    return hit;
  }
  const miss = await cache.get('resolvedVodLookupMiss', cacheKey);
  if (miss) {
    recordLookupMetric('cacheHits');
    return miss;
  }
  recordLookupMetric('cacheMisses');
  return undefined;
}

async function setCachedLookupResult(cacheKey, value, { miss = false } = {}) {
  await cache.set(miss ? 'resolvedVodLookupMiss' : 'resolvedVodLookup', cacheKey, miss ? { missing: true } : value);
}

function normalizeCategoryName(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function buildExpiredMeta(baseId, type) {
  return {
    meta: {
      id: baseId,
      type: type === 'series' ? 'series' : 'movie',
      name: 'Free access expired',
      description: 'Extend free access or add your own provider to keep watching.',
      posterShape: 'poster',
    },
  };
}

function buildExpiredStreamResponse() {
  const frontendUrl = process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000';
  return {
    streams: [{
      name: 'StreamBridge',
      title: 'Free access ended — extend free access or add your own provider',
      externalUrl: `${frontendUrl.replace(/\/+$/, '')}/dashboard?freeAccess=expired`,
      behaviorHints: { notWebReady: false },
    }],
  };
}

function recordWatchStart(userId, vodItem) {
  if (!userId || !vodItem?.raw_title) return;

  watchHistoryQueries.upsertFromVod({
    userId,
    vodId: vodItem.provider_id ? vodItem.id : null,
    rawTitle: vodItem.raw_title,
    tmdbId: vodItem.tmdb_id,
    imdbId: vodItem.imdb_id,
    vodType: vodItem.vod_type,
    progressPct: 0,
  }).catch((err) => {
    logger.warn(`Failed to record watch history for "${vodItem.raw_title}": ${err.message}`);
  });
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

async function buildManifest(token) {
  // Check user cache first
  let user = await cache.get('userByToken', token);
  if (!user) {
    user = await userQueries.findByToken(token);
    if (!user) return null;
    // Cache user for 5 minutes
    await cache.set('userByToken', token, user);
  }
  touchUserLastSeen(user.id).catch(() => {});

  const providers = await providerQueries.findByUser(user.id);

  const catalogs = [];
  for (const provider of providers) {
    const categoryBreakdown = await vodQueries.getCategoryBreakdown(provider.id);
    const liveCategories = Array.from(
      new Set(
        categoryBreakdown
          .filter(entry => entry.vod_type === 'live')
          .map(entry => normalizeCategoryName(entry.category))
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));

    catalogs.push({
      id: `sb_${provider.id}_movies`,
      type: 'movie',
      name: `${provider.name} – Movies`,
      extra: [{ name: 'search' }, { name: 'skip' }],
    });
    catalogs.push({
      id: `sb_${provider.id}_series`,
      type: 'series',
      name: `${provider.name} – Series`,
      extra: [{ name: 'search' }, { name: 'skip' }],
    });
    // Live TV catalog per provider
    catalogs.push({
      id: `sb_${provider.id}_live`,
      type: 'tv',
      name: `${provider.name} – Live TV`,
      extra: [
        { name: 'search' },
        { name: 'skip' },
        ...(liveCategories.length > 0 ? [{ name: 'genre', options: liveCategories }] : []),
      ],
    });
  }

  return {
    id: `com.streambridge.user.${token}`,
    version: '1.0.0',
    name: 'StreamBridge',
    description: 'Your personalized IPTV catalog with TMDB metadata',
    logo: 'https://streambridge.io/logo.png',
    catalogs,
    resources: ['catalog', 'stream', 'meta'],
    types: ['movie', 'series', 'tv'],
    behaviorHints: { configurable: false, configurationRequired: false },
    idPrefixes: ['tt', 'tmdb:', 'sb_', 'live_'],
  };
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

async function handleCatalog(token, type, catalogId, extra = {}) {
  // Check user cache
  let user = await cache.get('userByToken', token);
  if (!user) {
    user = await userQueries.findByToken(token);
    if (!user) return { metas: [] };
    await cache.set('userByToken', token, user);
  }
  touchUserLastSeen(user.id).catch(() => {});

  // catalogId format: sb_{providerId}_{movies|series|live}
  const match = catalogId.match(/^sb_([a-f0-9-]+)_(movies|series|live)$/);
  if (!match) return { metas: [] };

  const [, providerId, catalogType] = match;
  const provider = await getCachedProviderForUser(providerId, user.id);
  if (!provider) return { metas: [] };

  const skip = parseInt(extra.skip) || 0;
  const search = extra.search || '';
  const genre = normalizeCategoryName(extra.genre);
  const limit = 100;

  let vodType;
  if (catalogType === 'live') {
    vodType = 'live';
  } else {
    vodType = type === 'series' ? 'series' : 'movie';
  }

  const items = await vodQueries.getByProvider(providerId, {
    type: vodType,
    page: Math.floor(skip / limit) + 1,
    limit,
    search,
  });

  const filteredItems = genre
    ? items.filter(item => normalizeCategoryName(item.category) === genre)
    : items;

  return { metas: filteredItems.map(item => buildMetaPreview(item)) };
}

function buildMetaPreview(item) {
  const hasMatch = item.tmdb_id != null;
  let id, poster;

  if (hasMatch) {
    id = item.imdb_id || `tmdb:${item.tmdb_id}`;
    poster = item.poster_path
      ? `${TMDB_POSTER_BASE}${item.poster_path}`
      : item.poster_url;
  } else {
    id = `sb_${item.id}`;
    poster = item.poster_url;
  }

  return {
    id,
    type: item.vod_type === 'series' ? 'series' : item.vod_type === 'live' ? 'tv' : 'movie',
    name: item.raw_title,
    poster,
    posterShape: 'poster',
    background: poster,
    genres: item.category ? [item.category] : [],
    description: hasMatch
      ? `Confidence: ${Math.round((item.confidence_score || 0) * 100)}%`
      : 'Unmatched content',
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Stremio passes series stream IDs as "{seriesId}:{season}:{episode}".
 * Movies/unmatched content use just "{id}".
 * Returns { baseId, season, episode } — season/episode are null for movies.
 */
function parseStremioId(id) {
  const m = id.match(/^(.+):(\d+):(\d+)$/);
  if (m) {
    return { baseId: m[1], season: parseInt(m[2]), episode: parseInt(m[3]) };
  }
  return { baseId: id, season: null, episode: null };
}

/**
 * Look up a VOD item (joined with provider credentials) from the database.
 * Handles tt*, tmdb:*, and sb_* ID formats.
 */
async function resolveVodItem(userId, baseId) {
  const cacheKey = buildLookupCacheKey(userId, baseId, 'single');
  const cached = await getCachedLookupResult(cacheKey);
  if (cached !== undefined) return cached.missing ? null : cached;

  let result = null;
  if (baseId.startsWith('sb_')) {
    result = await vodQueries.findByInternalIdForUser(userId, baseId.slice(3));
  } else if (baseId.startsWith('tt') || baseId.startsWith('tmdb:')) {
    result = await vodQueries.resolveByExternalIdForUser(userId, baseId, { single: true, onlyOnline: true });
  }

  await setCachedLookupResult(cacheKey, result, { miss: !result });
  return result;
}

async function resolveVodItemsForStream(userId, baseId) {
  const cacheKey = buildLookupCacheKey(userId, baseId, 'all');
  const cached = await getCachedLookupResult(cacheKey);
  if (cached !== undefined) return cached.missing ? [] : cached;

  let result = [];
  if (baseId.startsWith('sb_')) {
    const item = await vodQueries.findByInternalIdForUser(userId, baseId.slice(3));
    result = item ? [item] : [];
  } else if (baseId.startsWith('tt') || baseId.startsWith('tmdb:')) {
    result = await vodQueries.resolveByExternalIdForUser(userId, baseId, { single: false, onlyOnline: true });
  }

  await setCachedLookupResult(cacheKey, result, { miss: result.length === 0 });
  return result;
}

async function resolveFallbackVodItem(user, baseId, type) {
  let item = await freeAccessService.resolveFallbackVodItem(user.id, baseId, type);
  if (item) return item;

  if (!(baseId.startsWith('tt') || baseId.startsWith('tmdb:'))) return null;

  const target = await getTargetTmdbRecord(baseId, type);
  if (!target) {
    logResolverDebug('fallback target not found', { userId: user.id, baseId, type });
    return null;
  }

  const candidates = await freeAccessService.resolveFallbackOnDemandCandidate(user.id, {
    vodType: target.tmdb_type === 'series' ? 'series' : 'movie',
    normalizedTitle: target.normalized_title || normalizeTitle(target.original_title || ''),
    year: target.year || null,
    tmdbId: target.id,
    imdbId: target.imdb_id || (baseId.startsWith('tt') ? baseId : null),
  });

  logResolverDebug('fallback candidates fetched', {
    userId: user.id,
    baseId,
    type,
    targetTmdbId: target.id,
    candidateCount: Array.isArray(candidates) ? candidates.length : 0,
  });

  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  let matchedAny = false;
  for (const candidate of candidates) {
    const result = await resolveCandidateMatch(candidate, target);
    if (!result?.matched) {
      logResolverDebug('fallback candidate rejected', {
        userId: user.id,
        baseId,
        type,
        candidateTitle: candidate.raw_title,
        candidateTmdbId: candidate.tmdb_id || null,
        candidateImdbId: candidate.imdb_id || null,
        reason: result?.reason || 'unknown',
        candidateNormalizedTitle: result?.candidateTitle || candidate.canonical_normalized_title || candidate.normalized_title || null,
        targetNormalizedTitle: result?.targetNormalized || target.normalized_title || null,
        matchedTmdbId: result?.matchedTmdbId || null,
        matchedScore: result?.matchedScore || null,
      });
      continue;
    }

    await matchQueries.upsert({
      rawTitle: candidate.raw_title,
      tmdbId: target.id,
      tmdbType: target.tmdb_type === 'series' ? 'series' : 'movie',
      imdbId: target.imdb_id || (baseId.startsWith('tt') ? baseId : null),
      confidenceScore: result.score,
    });
    matchedAny = true;
    logResolverDebug('fallback candidate matched', {
      userId: user.id,
      baseId,
      type,
      candidateTitle: candidate.raw_title,
      targetTmdbId: target.id,
      score: result.score,
      reason: result.reason || 'matched',
    });
  }

  if (!matchedAny) {
    logResolverDebug('fallback matching completed without a match', {
      userId: user.id,
      baseId,
      type,
      targetTmdbId: target.id,
      targetNormalizedTitle: target.normalized_title || normalizeTitle(target.original_title || ''),
    });
  }

  return freeAccessService.resolveFallbackVodItem(user.id, baseId, type);
}

async function resolveFallbackVodItemsForStream(user, baseId, type) {
  const items = await freeAccessService.resolveFallbackVodItemsForStream(user.id, baseId, type);
  return Array.isArray(items) ? items : [];
}

function applyLanguagePreferences(vodItems, user) {
  const preferred = Array.isArray(user?.preferred_languages) ? user.preferred_languages : [];
  const excluded = Array.isArray(user?.excluded_languages) ? user.excluded_languages : [];

  if (!preferred.length && !excluded.length) return vodItems;

  return vodItems.filter((item) => {
    const languages = Array.isArray(item.content_languages) && item.content_languages.length
      ? item.content_languages
      : extractContentLanguages(item.raw_title);

    if (preferred.length) {
      return languages.some(language => preferred.includes(language));
    }

    if (excluded.length) {
      return !languages.some(language => excluded.includes(language));
    }

    return true;
  });
}

async function resolveProviderPlaybackHosts(userId, providerId, providerSnapshot = null, options = {}) {
  const { recheckOnMiss = true } = options;
  let provider = providerSnapshot || await getCachedProviderForUser(providerId, userId);
  if (!provider) return { provider: null, onlineHosts: [], fallbackHost: null };

  let health = await hostHealthService.getProviderHealth(providerId);
  let onlineHosts = health.filter(h => h.status === 'online').slice(0, 3);

  if (recheckOnMiss && onlineHosts.length === 0) {
    const recheckKey = `${providerId}:${provider.last_checked || 'none'}`;
    const recentRecheck = await cache.get('providerHostRecheck', recheckKey);
    try {
      if (!recentRecheck) {
        recordLookupMetric('hostRechecks');
        await cache.set('providerHostRecheck', recheckKey, true);
        health = await hostHealthService.checkSingleProvider(providerId, userId);
        await cache.del('providerById', `${userId}:${providerId}`);
        provider = await getCachedProviderForUser(providerId, userId) || provider;
        onlineHosts = health.filter(h => h.status === 'online').slice(0, 3);
      }
    } catch (err) {
      logger.warn(`On-demand host recheck failed for provider ${providerId}: ${err.message}`);
    }
  }

  const fallbackHost = provider.active_host || onlineHosts[0]?.host_url || provider.hosts?.[0] || null;
  return { provider, onlineHosts, fallbackHost };
}

async function getCachedProviderForUser(providerId, userId) {
  const cacheKey = `${userId}:${providerId}`;
  const cached = await cache.get('providerById', cacheKey);
  if (cached) return cached;

  const provider = await providerQueries.findByIdAndUser(providerId, userId);
  if (provider) {
    await cache.set('providerById', cacheKey, provider);
  }
  return provider;
}

async function getTargetTmdbRecord(baseId, type) {
  if (baseId.startsWith('tmdb:')) {
    const tmdbId = parseInt(baseId.slice(5), 10);
    const { rows } = await pool.query(
      type === 'series'
        ? 'SELECT id, original_title, normalized_title, first_air_year AS year, NULL::varchar AS imdb_id, \'series\' AS tmdb_type FROM tmdb_series WHERE id = $1 LIMIT 1'
        : 'SELECT id, original_title, normalized_title, release_year AS year, imdb_id, \'movie\' AS tmdb_type FROM tmdb_movies WHERE id = $1 LIMIT 1',
      [tmdbId]
    );
    const result = rows[0] || null;
    logResolverDebug('target lookup by tmdb id', {
      baseId,
      type,
      found: Boolean(result),
      targetTmdbId: result?.id || null,
    });
    return result;
  }

  if (baseId.startsWith('tt')) {
    const { rows } = await pool.query(
      type === 'series'
        ? 'SELECT id, original_title, normalized_title, first_air_year AS year, imdb_id, \'series\' AS tmdb_type FROM tmdb_series WHERE imdb_id = $1 LIMIT 1'
        : 'SELECT id, original_title, normalized_title, release_year AS year, imdb_id, \'movie\' AS tmdb_type FROM tmdb_movies WHERE imdb_id = $1 LIMIT 1',
      [baseId]
    );
    if (rows[0]) {
      logResolverDebug('target lookup by imdb id from local tmdb table', {
        baseId,
        type,
        found: true,
        targetTmdbId: rows[0].id,
      });
      return rows[0];
    }

    if (!TMDB_API_KEY) {
      logResolverDebug('target lookup skipped because tmdb api key missing', { baseId, type });
      return null;
    }

    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/find/${baseId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`
      );
      if (!res.ok) return null;
      const data = await res.json();

      if (type === 'series' && Array.isArray(data.tv_results) && data.tv_results[0]) {
        const item = data.tv_results[0];
        const series = {
          id: item.id,
          original_title: item.name || item.original_name || '',
          normalized_title: normalizeTitle(item.name || item.original_name || ''),
          first_air_year: item.first_air_date ? parseInt(item.first_air_date.split('-')[0], 10) : null,
          popularity: item.popularity || 0,
          poster_path: item.poster_path || null,
          overview: item.overview || null,
          imdb_id: baseId,
        };
        await tmdbQueries.upsertSeries(series);
        const result = {
          id: series.id,
          original_title: series.original_title,
          normalized_title: series.normalized_title,
          year: series.first_air_year,
          imdb_id: series.imdb_id,
          tmdb_type: 'series',
        };
        logResolverDebug('target lookup by imdb id from tmdb api', {
          baseId,
          type,
          found: true,
          targetTmdbId: result.id,
          source: 'tmdb_api_tv',
        });
        return result;
      }

      if (Array.isArray(data.movie_results) && data.movie_results[0]) {
        const item = data.movie_results[0];
        const movie = {
          id: item.id,
          original_title: item.title || item.original_title || '',
          normalized_title: normalizeTitle(item.title || item.original_title || ''),
          release_year: item.release_date ? parseInt(item.release_date.split('-')[0], 10) : null,
          popularity: item.popularity || 0,
          poster_path: item.poster_path || null,
          overview: item.overview || null,
          imdb_id: baseId,
        };

        await tmdbQueries.upsertMovie(movie);

        const result = {
          id: movie.id,
          original_title: movie.original_title,
          normalized_title: movie.normalized_title,
          year: movie.release_year,
          imdb_id: movie.imdb_id,
          tmdb_type: 'movie',
        };
        logResolverDebug('target lookup by imdb id from tmdb api', {
          baseId,
          type,
          found: true,
          targetTmdbId: result.id,
          source: 'tmdb_api_movie',
        });
        return result;
      }
    } catch (err) {
      logger.warn(`TMDB find fallback failed for ${baseId}: ${err.message}`);
      logResolverDebug('target lookup via tmdb api failed', { baseId, type, error: err.message });
    }
  }

  logResolverDebug('target lookup not found', { baseId, type });
  return null;
}

async function resolveCandidateMatch(candidate, target) {
  const targetType = target.tmdb_type === 'series' ? 'series' : 'movie';
  const targetNormalized = target.normalized_title || normalizeTitle(target.original_title || '');
  const parsedCandidate = target.tmdb_type === 'series'
    ? parseSeriesTitle(candidate.raw_title || '')
    : parseMovieTitle(candidate.raw_title || '');
  const candidateTitle = candidate.canonical_normalized_title
    || parsedCandidate.canonicalNormalizedTitle
    || candidate.normalized_title
    || normalizeTitle(candidate.raw_title || '');
  const candidateYear = candidate.title_year || parsedCandidate.year || null;

  if (candidate.tmdb_id === target.id || (target.imdb_id && candidate.imdb_id === target.imdb_id)) {
    return {
      matched: true,
      id: target.id,
      score: candidate.confidence_score || 1,
      reason: 'existing_external_id_match',
    };
  }

  if (!candidateTitle) {
    return {
      matched: false,
      reason: 'missing_candidate_title',
      candidateTitle: null,
      targetNormalized,
    };
  }

  const titleVariants = [candidateTitle];

  if (target.year) {
    const strippedYearTitle = candidateTitle
      .replace(new RegExp(`(^|\\s)${target.year}(?=\\s|$)`, 'g'), ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (strippedYearTitle && strippedYearTitle !== candidateTitle) {
      titleVariants.push(strippedYearTitle);
    }
  }

  for (const titleVariant of titleVariants) {
    const result = await (targetType === 'series'
      ? tmdbQueries.exactMatchSeries(titleVariant, target.year)
      : tmdbQueries.exactMatchMovie(titleVariant, target.year));

    if (result && result.id === target.id && result.score >= 0.6) {
      return {
        matched: true,
        ...result,
        reason: 'tmdb_exact_match',
      };
    }

    if (result && result.id !== target.id) {
      return {
        matched: false,
        reason: 'matched_different_tmdb_record',
        candidateTitle,
        targetNormalized,
        candidateYear,
        matchedTmdbId: result.id,
        matchedScore: result.score,
        targetTmdbId: target.id,
      };
    }

    if (result && result.score < 0.6) {
      return {
        matched: false,
        reason: 'match_score_below_threshold',
        candidateTitle,
        targetNormalized,
        candidateYear,
        matchedTmdbId: result.id,
        matchedScore: result.score,
        targetTmdbId: target.id,
      };
    }
  }

  if (candidateTitle === targetNormalized) {
    const yearDelta = target.year && candidateYear ? Math.abs(candidateYear - target.year) : null;
    const yearCompatible = !target.year || !candidateYear || yearDelta <= (targetType === 'series' ? 2 : 1);
    if (yearCompatible) {
      return {
        matched: true,
        id: target.id,
        score: 0.99,
        reason: 'normalized_title_match',
      };
    }
  }

  return {
    matched: false,
    reason: 'no_tmdb_match',
    candidateTitle,
    targetNormalized,
    candidateYear,
    targetTmdbId: target.id,
  };
}

async function tryOnDemandMatch(userId, baseId, type) {
  const startedAt = Date.now();
  recordLookupMetric('slowPathCount');
  logResolverDebug('on-demand match start', { userId, baseId, type });
  const target = await getTargetTmdbRecord(baseId, type);
  if (!target) {
    logResolverDebug('on-demand match aborted because target missing', { userId, baseId, type });
    recordLookupMetric('slowPathMs', Date.now() - startedAt);
    return null;
  }

  const candidates = await vodQueries.findOnDemandCandidateForUser(userId, {
    vodType: target.tmdb_type,
    normalizedTitle: target.normalized_title || normalizeTitle(target.original_title || ''),
    year: target.year || null,
    tmdbId: target.id,
    imdbId: target.imdb_id || (baseId.startsWith('tt') ? baseId : null),
  });

  logResolverDebug('on-demand candidates fetched', {
    userId,
    baseId,
    type,
    targetTmdbId: target.id,
    targetNormalizedTitle: target.normalized_title || normalizeTitle(target.original_title || ''),
    candidateCount: candidates.length,
  });

  if (!candidates.length) {
    logResolverDebug('on-demand match aborted because no candidates found', {
      userId,
      baseId,
      type,
      targetTmdbId: target.id,
    });
    recordLookupMetric('slowPathMs', Date.now() - startedAt);
    return null;
  }

  const targetNormalized = target.normalized_title || normalizeTitle(target.original_title || '');
  const targetType = target.tmdb_type === 'series' ? 'series' : 'movie';
  const candidateMatchCache = new Map();
  let matchedAny = false;
  let firstMatchedCandidate = null;

  for (const candidate of candidates) {
    const cacheKey = [
      candidate.tmdb_id || '',
      candidate.imdb_id || '',
      candidate.normalized_title || normalizeTitle(candidate.raw_title || ''),
    ].join('|');

    if (!candidateMatchCache.has(cacheKey)) {
      candidateMatchCache.set(cacheKey, resolveCandidateMatch(candidate, target));
    }

    const result = await candidateMatchCache.get(cacheKey);
    if (!result?.matched) {
      logResolverDebug('candidate rejected', {
        userId,
        baseId,
        type,
        candidateTitle: candidate.raw_title,
        candidateTmdbId: candidate.tmdb_id || null,
        candidateImdbId: candidate.imdb_id || null,
        reason: result?.reason || 'unknown',
        candidateNormalizedTitle: result?.candidateTitle || candidate.canonical_normalized_title || candidate.normalized_title || null,
        targetNormalizedTitle: result?.targetNormalized || targetNormalized,
        matchedTmdbId: result?.matchedTmdbId || null,
        matchedScore: result?.matchedScore || null,
      });
      continue;
    }

    await matchQueries.upsert({
      rawTitle: candidate.raw_title,
      tmdbId: target.id,
      tmdbType: targetType,
      imdbId: target.imdb_id || (baseId.startsWith('tt') ? baseId : null),
      confidenceScore: result.score,
    });
    matchedAny = true;
    if (!firstMatchedCandidate) firstMatchedCandidate = candidate;
    logger.info(`On-demand match resolved "${candidate.raw_title}" to ${baseId}`);
    logResolverDebug('candidate matched', {
      userId,
      baseId,
      type,
      candidateTitle: candidate.raw_title,
      targetTmdbId: target.id,
      score: result.score,
      reason: result.reason || 'matched',
    });
  }
async clearResolvedCache(userId, baseId) {
  await cache.del('resolvedVodLookup', buildLookupCacheKey(userId, baseId, 'single'));
  await cache.del('resolvedVodLookupMiss', buildLookupCacheKey(userId, baseId, 'single'));
  await cache.del('resolvedVodLookup', buildLookupCacheKey(userId, baseId, 'all'));
  await cache.del('resolvedVodLookupMiss', buildLookupCacheKey(userId, baseId, 'all'));
},
    const resolvedItem = await resolveVodItem(userId, baseId);
    recordLookupMetric('slowPathMs', Date.now() - startedAt);
    return resolvedItem || firstMatchedCandidate;
  }

  logger.info(`On-demand match found no candidate for ${baseId} (${targetNormalized})`);
  logResolverDebug('on-demand match completed without a match', {
    userId,
    baseId,
    type,
    targetTmdbId: target.id,
    targetNormalized,
  });
  recordLookupMetric('slowPathMs', Date.now() - startedAt);
  return null;
}

async function resolveOnDemandMatchShared(userId, baseId, type) {
  const key = `${userId}:${type}:${baseId}`;
  const pending = pendingOnDemandMatches.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      return await tryOnDemandMatch(userId, baseId, type);
    } finally {
      pendingOnDemandMatches.delete(key);
    }
  })();

  pendingOnDemandMatches.set(key, promise);
  return promise;
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

async function handleMeta(token, type, id) {
  beginAddonRequest();
  try {
    // Check user cache
    let user = await cache.get('userByToken', token);
    if (!user) {
      user = await userQueries.findByToken(token);
      if (!user) return { meta: null };
      await cache.set('userByToken', token, user);
    }
    touchUserLastSeen(user.id).catch(() => {});

    const { baseId } = parseStremioId(id);
    const metaCacheKey = `${token}:${type}:${id}`;
    const cachedMeta = await cache.get('resolvedMeta', metaCacheKey);
    if (cachedMeta) {
      recordLookupMetric('cacheHits');
      return cachedMeta;
    }
    if (await cache.get('resolvedMetaMiss', metaCacheKey)) {
      recordLookupMetric('cacheHits');
      return { meta: null };
    }

    let vodItem = await resolveVodItem(user.id, baseId);
    if (!vodItem && (baseId.startsWith('tt') || baseId.startsWith('tmdb:'))) {
      vodItem = await resolveOnDemandMatchShared(user.id, baseId, type);
    }
    if (!vodItem && type !== 'tv') {
      vodItem = await resolveFallbackVodItem(user, baseId, type);
    }
    if (!vodItem) {
      logResolverDebug('meta lookup returned no item', { userId: user.id, baseId, type, id });
      if (user.free_access_status === 'expired' && type !== 'tv') {
        return buildExpiredMeta(baseId, type);
      }
      await cache.set('resolvedMetaMiss', metaCacheKey, true);
      return { meta: null };
    }

    const meta = {
      id: baseId,
      type: vodItem.vod_type === 'series' ? 'series' : vodItem.vod_type === 'live' ? 'tv' : 'movie',
      name: vodItem.raw_title,
      poster: vodItem.poster_url,
      genres: vodItem.category ? [vodItem.category] : [],
    };

    // For series: fetch episode list with caching
    if (vodItem.vod_type === 'series' && vodItem.stream_id) {
      try {
        const fallbackHost = vodItem.access_source === 'free_access'
          ? vodItem.playback_hosts?.[0]?.host
          : (await resolveProviderPlaybackHosts(user.id, vodItem.provider_id)).fallbackHost;
        if (!fallbackHost) return { meta };

        // Check cache first
        const episodeCacheKey = vodItem.access_source === 'free_access'
          ? `free:${vodItem.provider_group_id}:${vodItem.stream_id}`
          : vodItem.stream_id;
        let episodesObj = await cache.get('seriesEpisodes', episodeCacheKey);
        if (!episodesObj) {
          episodesObj = await providerService.getSeriesEpisodes(
            fallbackHost,
            vodItem.username,
            vodItem.password,
            vodItem.stream_id
          );
          // Cache episodes for 10 minutes
          await cache.set('seriesEpisodes', episodeCacheKey, episodesObj);
        }

        const videos = [];
        for (const [seasonNum, episodes] of Object.entries(episodesObj)) {
          if (!Array.isArray(episodes)) continue;
          for (const ep of episodes) {
            videos.push({
              id: `${baseId}:${seasonNum}:${ep.episode_num}`,
              title: ep.title || `Episode ${ep.episode_num}`,
              season: parseInt(seasonNum),
              episode: parseInt(ep.episode_num),
              released: ep.info?.releasedate ? new Date(ep.info.releasedate) : undefined,
              thumbnail: ep.info?.movie_image || undefined,
              overview: ep.info?.plot || undefined,
            });
          }
        }
        if (videos.length > 0) {
          meta.videos = videos;
        }
      } catch (err) {
        logger.warn(`Could not fetch episode list for meta ${baseId}: ${err.message}`);
      }
    }

    // For live streams: fetch EPG if available
    if (vodItem.vod_type === 'live' && vodItem.provider_id && vodItem.epg_channel_id) {
      try {
        const epgMap = await epgService.getEpgForProvider(vodItem.provider_id, user.id);
        const programme = epgService.getCurrentProgramme(epgMap, vodItem.epg_channel_id);
        if (programme && programme.now) {
          const nowTitle = programme.now.title || 'Unknown';
          const nextTitle = programme.next ? programme.next.title : '';
          meta.description = `Now: ${nowTitle}${nextTitle ? ` | Next: ${nextTitle}` : ''}`;
        }
      } catch (err) {
        logger.debug(`Could not fetch EPG for live stream: ${err.message}`);
      }
    }

    const payload = { meta };
    await cache.set('resolvedMeta', metaCacheKey, payload);
    logger.info(`Lookup metrics: ${JSON.stringify(lookupMetrics)}`);
    return payload;
  } finally {
    endAddonRequest();
  }
}

// ─── Stream ───────────────────────────────────────────────────────────────────

async function handleStream(token, type, id) {
  beginAddonRequest();
  try {
    // Check user cache
    let user = await cache.get('userByToken', token);
    if (!user) {
      user = await userQueries.findByToken(token);
      if (!user) return { streams: [] };
      await cache.set('userByToken', token, user);
    }
    touchUserLastSeen(user.id).catch(() => {});

    const { baseId, season, episode } = parseStremioId(id);
    const streamCacheKey = `${token}:${type}:${id}`;
    const cachedStream = await cache.get('resolvedStreams', streamCacheKey);
    if (cachedStream) {
      recordLookupMetric('cacheHits');
      return cachedStream;
    }
    if (await cache.get('resolvedStreamsMiss', streamCacheKey)) {
      recordLookupMetric('cacheHits');
      return { streams: [] };
    }

    // Handle live streams (prefixed with "live_")
    if (baseId.startsWith('live_')) {
      return await handleLiveStream(token, baseId);
    }

    let vodItems = await resolveVodItemsForStream(user.id, baseId);
    if (!vodItems.length && (baseId.startsWith('tt') || baseId.startsWith('tmdb:'))) {
      const matchedItem = await resolveOnDemandMatchShared(user.id, baseId, type);
      if (matchedItem) {
        vodItems = await resolveVodItemsForStream(user.id, baseId);
        if (!vodItems.length) vodItems = [matchedItem];
      }
    }

    if (!vodItems.length && type !== 'tv') {
      vodItems = await resolveFallbackVodItemsForStream(user, baseId, type);
      if (!vodItems.length) {
        const fallbackItem = await resolveFallbackVodItem(user, baseId, type);
        if (fallbackItem) {
          vodItems = [fallbackItem];
        }
      }
    }

    vodItems = applyLanguagePreferences(vodItems, user);

    if (!vodItems.length) {
      logResolverDebug('stream lookup returned no items', { userId: user.id, baseId, type, id });
      if (type !== 'tv' && user.free_access_status === 'expired') {
        return buildExpiredStreamResponse();
      }
      await cache.set('resolvedStreamsMiss', streamCacheKey, true);
      return { streams: [] };
    }

    const vodItem = vodItems[0];
    const { username, password, stream_id, vod_type, container_extension, provider_id } = vodItem;

    // ── Movie stream ───────────────────────────────────────────────────────────
    if (vod_type === 'movie') {
      recordWatchStart(user.id, vodItem);
      const streams = [];

      for (const item of vodItems) {
        const isFreeAccess = item.access_source === 'free_access';
        const hostData = isFreeAccess
          ? {
            onlineHosts: (item.playback_hosts || []).map(host => ({
              host_url: host.host,
              response_time_ms: host.responseTimeMs,
            })),
            fallbackHost: item.playback_hosts?.[0]?.host || null,
          }
          : await resolveProviderPlaybackHosts(user.id, item.provider_id, null, { recheckOnMiss: false });
        const { onlineHosts, fallbackHost } = hostData;
        const ext = item.container_extension || 'mp4';
        const streamLabel = item.raw_title || item.name || 'Stream';

        if (onlineHosts.length === 0 && fallbackHost) {
          const url = `${fallbackHost}/movie/${encodeURIComponent(item.username)}/${encodeURIComponent(item.password)}/${item.stream_id}.${ext}`;
          streams.push({
            url,
            title: `${streamLabel} — StreamBridge`,
            name: streamLabel,
            behaviorHints: { notWebReady: false },
          });
          continue;
        }

        streams.push(...onlineHosts.map((host, idx) => {
          const url = `${host.host_url}/movie/${encodeURIComponent(item.username)}/${encodeURIComponent(item.password)}/${item.stream_id}.${ext}`;
          const timeLabel = host.response_time_ms ? `${host.response_time_ms}ms` : '?';
          return {
            url,
            title: `${streamLabel} — StreamBridge (Host ${idx + 1}, ${timeLabel})`,
            name: streamLabel,
            behaviorHints: { notWebReady: false },
          };
        }));
      }

      if (vodItem.access_source === 'free_access') {
        await freeAccessService.recordResolvedStream(vodItem.assignment_id);
      }
      const payload = { streams };
      await cache.set('resolvedStreams', streamCacheKey, payload);
      logger.info(`Lookup metrics: ${JSON.stringify(lookupMetrics)}`);
      return payload;
    }

    // ── Series episode stream ──────────────────────────────────────────────────
    if (vod_type === 'series') {
      if (season == null || episode == null) {
        logger.warn(`Series stream requested without episode info: ${id}`);
        return { streams: [] };
      }

      recordWatchStart(user.id, vodItem);

      try {
        // Check cache first for episodes
        const episodeCacheKey = vodItem.access_source === 'free_access'
          ? `free:${vodItem.provider_group_id}:${stream_id}`
          : stream_id;
        let episodesObj = await cache.get('seriesEpisodes', episodeCacheKey);
        if (!episodesObj) {
          const hostData = vodItem.access_source === 'free_access'
            ? {
              onlineHosts: (vodItem.playback_hosts || []).map(host => ({ host_url: host.host })),
              fallbackHost: vodItem.playback_hosts?.[0]?.host || null,
            }
            : await resolveProviderPlaybackHosts(
              user.id,
              provider_id,
              null,
              { recheckOnMiss: false }
            );
          const hostToUse = hostData.onlineHosts[0]?.host_url || hostData.fallbackHost;
          if (!hostToUse) return { streams: [] };
          episodesObj = await providerService.getSeriesEpisodes(
            hostToUse, username, password, stream_id
          );
          await cache.set('seriesEpisodes', episodeCacheKey, episodesObj);
        }

        const seasonEps = episodesObj[String(season)];
        if (!Array.isArray(seasonEps) || seasonEps.length === 0) {
          logger.warn(`Season ${season} not found for series ${stream_id}`);
          return { streams: [] };
        }

        const ep = seasonEps.find(e => parseInt(e.episode_num) === episode);
        if (!ep) {
          logger.warn(`S${season}E${episode} not found in series ${stream_id}`);
          return { streams: [] };
        }

        // Get online hosts for multi-host failover
        const { onlineHosts, fallbackHost } = vodItem.access_source === 'free_access'
          ? {
            onlineHosts: (vodItem.playback_hosts || []).map(host => ({
              host_url: host.host,
              response_time_ms: host.responseTimeMs,
            })),
            fallbackHost: vodItem.playback_hosts?.[0]?.host || null,
          }
          : await resolveProviderPlaybackHosts(
            user.id,
            provider_id,
            null,
            { recheckOnMiss: false }
          );

        const epId = ep.id;
        const epExt = ep.container_extension || 'mkv';
        const label = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;

        // Return streams for each host
        let streams = onlineHosts.map((host, idx) => {
          const url = `${host.host_url}/series/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${epId}.${epExt}`;
          const timeLabel = host.response_time_ms ? `${host.response_time_ms}ms` : '?';
          return {
            url,
            title: `${label} – StreamBridge (Host ${idx + 1}, ${timeLabel})`,
            name: `SB-${idx + 1}`,
            behaviorHints: { notWebReady: false },
          };
        });

        // Fallback if no health data
        if (streams.length === 0 && fallbackHost) {
          const url = `${fallbackHost}/series/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${epId}.${epExt}`;
          streams = [{
            url,
            title: `${label} – StreamBridge`,
            name: 'SB',
            behaviorHints: { notWebReady: false },
          }];
        }

        if (vodItem.access_source === 'free_access') {
          await freeAccessService.recordResolvedStream(vodItem.assignment_id);
        }
        const payload = { streams };
        await cache.set('resolvedStreams', streamCacheKey, payload);
        logger.info(`Lookup metrics: ${JSON.stringify(lookupMetrics)}`);
        return payload;
      } catch (err) {
        logger.warn(`Failed to resolve series stream for ${id}: ${err.message}`);
        return { streams: [] };
      }
    }

    return { streams: [] };
  } finally {
    endAddonRequest();
  }
}

/**
 * Handle live stream requests.
 * Live stream IDs are prefixed "live_" followed by the stream_id.
 */
async function handleLiveStream(token, baseId) {
  try {
    let user = await cache.get('userByToken', token);
    if (!user) {
      user = await userQueries.findByToken(token);
      if (!user) return { streams: [] };
      await cache.set('userByToken', token, user);
    }
    touchUserLastSeen(user.id).catch(() => {});

    // baseId format: live_{providerId}_{streamId}
    const match = baseId.match(/^live_([a-f0-9-]+)_(.+)$/);
    if (!match) return { streams: [] };

    const [, providerId, streamId] = match;
    const provider = await getCachedProviderForUser(providerId, user.id);
    if (!provider) return { streams: [] };

    // Get live stream details from VOD table
    const { rows } = await pool.query(
      'SELECT * FROM user_provider_vod WHERE provider_id = $1 AND stream_id = $2 AND vod_type = $3',
      [providerId, streamId, 'live']
    );
    const vodItem = rows[0];

    if (!vodItem) return { streams: [] };

    const { provider: resolvedProvider, onlineHosts, fallbackHost } = await resolveProviderPlaybackHosts(
      user.id,
      providerId,
      provider,
      { recheckOnMiss: false }
    );
    if (onlineHosts.length === 0 && !fallbackHost) {
      return { streams: [] };
    }

    const username = resolvedProvider.username;
    const password = resolvedProvider.password;
    const ext = vodItem.container_extension || 'ts';
    const title = vodItem.raw_title;

    const streams = onlineHosts.map((host, idx) => {
      const url = `${host.host_url}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${ext}`;
      const timeLabel = host.response_time_ms ? `${host.response_time_ms}ms` : '?';
      return {
        url,
        title: `📺 ${title} — Host ${idx + 1} (${timeLabel}) (Live)`,
        name: `LIVE-${idx + 1}`,
        behaviorHints: { notWebReady: false },
      };
    });

    // Fallback if no health data
    if (streams.length === 0 && fallbackHost) {
      const url = `${fallbackHost}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${ext}`;
      streams.push({
        url,
        title: `📺 ${title} (Live)`,
        name: 'LIVE',
        behaviorHints: { notWebReady: false },
      });
    }

    return { streams };
  } catch (err) {
    logger.warn(`Failed to resolve live stream for ${baseId}: ${err.message}`);
    return { streams: [] };
  }
}

module.exports = {
  buildManifest,
  handleCatalog,
  handleMeta,
  handleStream,
  handleLiveStream,
  __test__: {
    applyLanguagePreferences,
    getTargetTmdbRecord,
    resolveProviderPlaybackHosts,
    resolveVodItemsForStream,
    tryOnDemandMatch,
    resolveOnDemandMatchShared,
    lookupMetrics,
  },
};
