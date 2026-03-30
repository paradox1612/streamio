const fetch = require('node-fetch');
const { userQueries, providerQueries, vodQueries, watchHistoryQueries, tmdbQueries, matchQueries, pool } = require('../db/queries');
const providerService = require('../services/providerService');
const epgService = require('../services/epgService');
const hostHealthService = require('../services/hostHealthService');
const cache = require('../utils/cache');
const logger = require('../utils/logger');
const { touchUserLastSeen } = require('../utils/userActivity');
const { normalizeTitle, extractContentLanguages, parseMovieTitle, parseReleaseTitle, parseSeriesTitle } = require('../utils/titleNormalization');
const { beginAddonRequest, endAddonRequest } = require('../utils/loadManager');

const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const pendingOnDemandMatches = new Map();

function normalizeCategoryName(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function recordWatchStart(userId, vodItem) {
  if (!userId || !vodItem?.raw_title) return;

  watchHistoryQueries.upsertFromVod({
    userId,
    vodId: vodItem.id,
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
  let user = cache.get('userByToken', token);
  if (!user) {
    user = await userQueries.findByToken(token);
    if (!user) return null;
    // Cache user for 5 minutes
    cache.set('userByToken', token, user);
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
  let user = cache.get('userByToken', token);
  if (!user) {
    user = await userQueries.findByToken(token);
    if (!user) return { metas: [] };
    cache.set('userByToken', token, user);
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
  if (baseId.startsWith('sb_')) {
    return vodQueries.findByInternalIdForUser(userId, baseId.slice(3));
  }

  if (baseId.startsWith('tt')) {
    const { rows } = await pool.query(
      `SELECT v.*, p.active_host, p.username, p.password
       FROM user_provider_vod v
       JOIN matched_content m ON m.raw_title = v.raw_title AND m.imdb_id = $1
       JOIN user_providers p ON p.id = v.provider_id AND p.status = 'online'
       WHERE v.user_id = $2
       LIMIT 1`,
      [baseId, userId]
    );
    return rows[0] || null;
  }

  if (baseId.startsWith('tmdb:')) {
    return vodQueries.findByTmdbIdForUser(userId, parseInt(baseId.slice(5)));
  }

  return null;
}

async function resolveVodItemsForStream(userId, baseId) {
  if (baseId.startsWith('sb_')) {
    const item = await vodQueries.findByInternalIdForUser(userId, baseId.slice(3));
    return item ? [item] : [];
  }

  if (baseId.startsWith('tt')) {
    const { rows } = await pool.query(
      `SELECT v.*, p.active_host, p.username, p.password
       FROM user_provider_vod v
       JOIN matched_content m ON m.raw_title = v.raw_title AND m.imdb_id = $1
       JOIN user_providers p ON p.id = v.provider_id AND p.user_id = $2 AND p.status = 'online'
       WHERE v.user_id = $2
       ORDER BY v.raw_title ASC, v.provider_id ASC`,
      [baseId, userId]
    );
    return rows;
  }

  if (baseId.startsWith('tmdb:')) {
    const tmdbId = parseInt(baseId.slice(5), 10);
    const { rows } = await pool.query(
      `SELECT v.*, p.active_host, p.username, p.password
       FROM user_provider_vod v
       JOIN matched_content m ON m.raw_title = v.raw_title AND m.tmdb_id = $2
       JOIN user_providers p ON p.id = v.provider_id AND p.user_id = $1 AND p.status = 'online'
       WHERE v.user_id = $1
       ORDER BY v.raw_title ASC, v.provider_id ASC`,
      [userId, tmdbId]
    );
    return rows;
  }

  return [];
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
    try {
      health = await hostHealthService.checkSingleProvider(providerId, userId);
      cache.del('providerById', `${userId}:${providerId}`);
      provider = await getCachedProviderForUser(providerId, userId) || provider;
      onlineHosts = health.filter(h => h.status === 'online').slice(0, 3);
    } catch (err) {
      logger.warn(`On-demand host recheck failed for provider ${providerId}: ${err.message}`);
    }
  }

  const fallbackHost = provider.active_host || onlineHosts[0]?.host_url || provider.hosts?.[0] || null;
  return { provider, onlineHosts, fallbackHost };
}

async function getCachedProviderForUser(providerId, userId) {
  const cacheKey = `${userId}:${providerId}`;
  const cached = cache.get('providerById', cacheKey);
  if (cached) return cached;

  const provider = await providerQueries.findByIdAndUser(providerId, userId);
  if (provider) {
    cache.set('providerById', cacheKey, provider);
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
    return rows[0] || null;
  }

  if (baseId.startsWith('tt')) {
    const { rows } = await pool.query(
      'SELECT id, original_title, normalized_title, release_year AS year, imdb_id, \'movie\' AS tmdb_type FROM tmdb_movies WHERE imdb_id = $1 LIMIT 1',
      [baseId]
    );
    if (rows[0]) return rows[0];

    if (!TMDB_API_KEY) return null;

    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/find/${baseId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`
      );
      if (!res.ok) return null;
      const data = await res.json();

      if (type === 'series' && Array.isArray(data.tv_results) && data.tv_results[0]) {
        const item = data.tv_results[0];
        return {
          id: item.id,
          original_title: item.name || item.original_name || '',
          normalized_title: normalizeTitle(item.name || item.original_name || ''),
          year: item.first_air_date ? parseInt(item.first_air_date.split('-')[0], 10) : null,
          imdb_id: baseId,
          tmdb_type: 'series',
        };
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

        return {
          id: movie.id,
          original_title: movie.original_title,
          normalized_title: movie.normalized_title,
          year: movie.release_year,
          imdb_id: movie.imdb_id,
          tmdb_type: 'movie',
        };
      }
    } catch (err) {
      logger.warn(`TMDB find fallback failed for ${baseId}: ${err.message}`);
    }
  }

  return null;
}

async function resolveCandidateMatch(candidate, target) {
  if (candidate.tmdb_id === target.id || (target.imdb_id && candidate.imdb_id === target.imdb_id)) {
    return {
      id: target.id,
      score: candidate.confidence_score || 1,
    };
  }

  const parsedCandidate = target.tmdb_type === 'series'
    ? parseSeriesTitle(candidate.raw_title || '')
    : parseMovieTitle(candidate.raw_title || '');
  const candidateTitle = candidate.canonical_normalized_title
    || parsedCandidate.canonicalNormalizedTitle
    || candidate.normalized_title
    || normalizeTitle(candidate.raw_title || '');
  if (!candidateTitle) return null;

  const targetType = target.tmdb_type === 'series' ? 'series' : 'movie';
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
    const exactResult = await (targetType === 'series'
      ? tmdbQueries.exactMatchSeries(titleVariant, target.year)
      : tmdbQueries.exactMatchMovie(titleVariant, target.year));
    const result = exactResult || await (targetType === 'series'
      ? tmdbQueries.fuzzyMatchSeries(titleVariant, target.year)
      : tmdbQueries.fuzzyMatchMovie(titleVariant, target.year));

    if (result && result.id === target.id && result.score >= 0.6) {
      return result;
    }
  }

  return null;
}

async function tryOnDemandMatch(userId, baseId, type) {
  const target = await getTargetTmdbRecord(baseId, type);
  if (!target) return null;

  const candidates = await vodQueries.findOnDemandCandidateForUser(userId, {
    vodType: target.tmdb_type,
    normalizedTitle: target.normalized_title || normalizeTitle(target.original_title || ''),
    year: target.year || null,
    tmdbId: target.id,
    imdbId: target.imdb_id || (baseId.startsWith('tt') ? baseId : null),
  });

  if (!candidates.length) return null;

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
    if (!result) continue;

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
  }

  if (matchedAny) {
    const resolvedItem = await resolveVodItem(userId, baseId);
    return resolvedItem || firstMatchedCandidate;
  }

  logger.info(`On-demand match found no candidate for ${baseId} (${targetNormalized})`);
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
    let user = cache.get('userByToken', token);
    if (!user) {
      user = await userQueries.findByToken(token);
      if (!user) return { meta: null };
      cache.set('userByToken', token, user);
    }
    touchUserLastSeen(user.id).catch(() => {});

    const { baseId } = parseStremioId(id);
    let vodItem = await resolveVodItem(user.id, baseId);
    if (!vodItem && (baseId.startsWith('tt') || baseId.startsWith('tmdb:'))) {
      vodItem = await resolveOnDemandMatchShared(user.id, baseId, type);
    }
    if (!vodItem) return { meta: null };

    const meta = {
      id: baseId,
      type: vodItem.vod_type === 'series' ? 'series' : vodItem.vod_type === 'live' ? 'tv' : 'movie',
      name: vodItem.raw_title,
      poster: vodItem.poster_url,
      genres: vodItem.category ? [vodItem.category] : [],
    };

    // For series: fetch episode list with caching
    if (vodItem.vod_type === 'series' && vodItem.provider_id && vodItem.stream_id) {
      try {
        const { fallbackHost } = await resolveProviderPlaybackHosts(user.id, vodItem.provider_id);
        if (!fallbackHost) return { meta };

        // Check cache first
        let episodesObj = cache.get('seriesEpisodes', vodItem.stream_id);
        if (!episodesObj) {
          episodesObj = await providerService.getSeriesEpisodes(
            fallbackHost,
            vodItem.username,
            vodItem.password,
            vodItem.stream_id
          );
          // Cache episodes for 10 minutes
          cache.set('seriesEpisodes', vodItem.stream_id, episodesObj);
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

    return { meta };
  } finally {
    endAddonRequest();
  }
}

// ─── Stream ───────────────────────────────────────────────────────────────────

async function handleStream(token, type, id) {
  beginAddonRequest();
  try {
    // Check user cache
    let user = cache.get('userByToken', token);
    if (!user) {
      user = await userQueries.findByToken(token);
      if (!user) return { streams: [] };
      cache.set('userByToken', token, user);
    }
    touchUserLastSeen(user.id).catch(() => {});

    const { baseId, season, episode } = parseStremioId(id);

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

    vodItems = applyLanguagePreferences(vodItems, user);

    if (!vodItems.length) return { streams: [] };

    const vodItem = vodItems[0];
    const { username, password, stream_id, vod_type, container_extension, provider_id } = vodItem;

    // ── Movie stream ───────────────────────────────────────────────────────────
    if (vod_type === 'movie') {
      recordWatchStart(user.id, vodItem);
      const providerIds = [...new Set(vodItems
        .map(item => item.provider_id)
        .filter(Boolean))];
      const providerHosts = new Map(
        await Promise.all(providerIds.map(async (itemProviderId) => ([
          itemProviderId,
          await resolveProviderPlaybackHosts(user.id, itemProviderId, null, { recheckOnMiss: false }),
        ])))
      );
      const streams = [];

      for (const item of vodItems) {
        if (!item.provider_id) continue;

        const hostData = providerHosts.get(item.provider_id);
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

      return { streams };
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
        let episodesObj = cache.get('seriesEpisodes', stream_id);
        if (!episodesObj) {
          const { onlineHosts, fallbackHost } = await resolveProviderPlaybackHosts(
            user.id,
            provider_id,
            null,
            { recheckOnMiss: false }
          );
          const hostToUse = onlineHosts[0]?.host_url || fallbackHost;
          if (!hostToUse) return { streams: [] };
          episodesObj = await providerService.getSeriesEpisodes(
            hostToUse, username, password, stream_id
          );
          cache.set('seriesEpisodes', stream_id, episodesObj);
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
        const { onlineHosts, fallbackHost } = await resolveProviderPlaybackHosts(
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

        return { streams };
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
    let user = cache.get('userByToken', token);
    if (!user) {
      user = await userQueries.findByToken(token);
      if (!user) return { streams: [] };
      cache.set('userByToken', token, user);
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
  },
};
