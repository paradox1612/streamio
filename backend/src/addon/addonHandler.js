const { userQueries, providerQueries, vodQueries, pool } = require('../db/queries');
const providerService = require('../services/providerService');
const logger = require('../utils/logger');

const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w500';

// ─── Manifest ─────────────────────────────────────────────────────────────────

async function buildManifest(token) {
  const user = await userQueries.findByToken(token);
  if (!user) return null;

  const providers = await providerQueries.findByUser(user.id);

  const catalogs = [];
  for (const provider of providers) {
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
  }

  return {
    id: `com.streambridge.user.${token}`,
    version: '1.0.0',
    name: 'StreamBridge',
    description: 'Your personalized IPTV catalog with TMDB metadata',
    logo: 'https://streambridge.io/logo.png',
    catalogs,
    resources: ['catalog', 'stream', 'meta'],
    types: ['movie', 'series'],
    behaviorHints: { configurable: false, configurationRequired: false },
    idPrefixes: ['tt', 'tmdb:', 'sb_'],
  };
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

async function handleCatalog(token, type, catalogId, extra = {}) {
  const user = await userQueries.findByToken(token);
  if (!user) return { metas: [] };

  // catalogId format: sb_{providerId}_{movies|series}
  const match = catalogId.match(/^sb_([a-f0-9-]+)_(movies|series)$/);
  if (!match) return { metas: [] };

  const [, providerId] = match;
  const provider = await providerQueries.findByIdAndUser(providerId, user.id);
  if (!provider) return { metas: [] };

  const skip = parseInt(extra.skip) || 0;
  const search = extra.search || '';
  const limit = 100;
  const vodType = type === 'series' ? 'series' : 'movie';

  const items = await vodQueries.getByProvider(providerId, {
    type: vodType,
    page: Math.floor(skip / limit) + 1,
    limit,
    search,
  });

  return { metas: items.map(item => buildMetaPreview(item)) };
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
    type: item.vod_type === 'series' ? 'series' : 'movie',
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

// ─── Meta ─────────────────────────────────────────────────────────────────────

async function handleMeta(token, type, id) {
  const user = await userQueries.findByToken(token);
  if (!user) return { meta: null };

  const { baseId } = parseStremioId(id);
  const vodItem = await resolveVodItem(user.id, baseId);
  if (!vodItem) return { meta: null };

  const meta = {
    id: baseId,
    type: vodItem.vod_type === 'series' ? 'series' : 'movie',
    name: vodItem.raw_title,
    poster: vodItem.poster_url,
    genres: vodItem.category ? [vodItem.category] : [],
  };

  // For series: fetch episode list so Stremio can show season/episode navigation
  if (vodItem.vod_type === 'series' && vodItem.active_host && vodItem.stream_id) {
    try {
      const episodesObj = await providerService.getSeriesEpisodes(
        vodItem.active_host,
        vodItem.username,
        vodItem.password,
        vodItem.stream_id
      );
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

  return { meta };
}

// ─── Stream ───────────────────────────────────────────────────────────────────

async function handleStream(token, type, id) {
  const user = await userQueries.findByToken(token);
  if (!user) return { streams: [] };

  const { baseId, season, episode } = parseStremioId(id);
  const vodItem = await resolveVodItem(user.id, baseId);

  if (!vodItem || !vodItem.active_host) return { streams: [] };

  const { active_host, username, password, stream_id, vod_type, container_extension } = vodItem;

  // ── Movie stream ───────────────────────────────────────────────────────────
  if (vod_type === 'movie') {
    const ext = container_extension || 'mp4';
    const url = `${active_host}/movie/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${stream_id}.${ext}`;
    return {
      streams: [{ url, title: 'StreamBridge', name: 'SB', behaviorHints: { notWebReady: false } }],
    };
  }

  // ── Series episode stream ──────────────────────────────────────────────────
  // stream_id on the VOD record is the *series* ID (show-level).
  // We must call get_series_info to resolve the individual episode stream_id.
  if (vod_type === 'series') {
    if (season == null || episode == null) {
      // Stremio always appends :S:E for series — if not present something is wrong
      logger.warn(`Series stream requested without episode info: ${id}`);
      return { streams: [] };
    }

    try {
      const episodesObj = await providerService.getSeriesEpisodes(
        active_host, username, password, stream_id
      );

      // Seasons are keyed by string number in the API response
      const seasonEps = episodesObj[String(season)];
      if (!Array.isArray(seasonEps) || seasonEps.length === 0) {
        logger.warn(`Season ${season} not found for series ${stream_id}`);
        return { streams: [] };
      }

      const ep = seasonEps.find(
        e => parseInt(e.episode_num) === episode
      );
      if (!ep) {
        logger.warn(`S${season}E${episode} not found in series ${stream_id}`);
        return { streams: [] };
      }

      // ep.id is the episode-level stream ID; ep.container_extension is the file format
      const epId = ep.id;
      const epExt = ep.container_extension || 'mkv';
      const url = `${active_host}/series/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${epId}.${epExt}`;

      const label = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
      return {
        streams: [{
          url,
          title: `${label} – StreamBridge`,
          name: 'SB',
          behaviorHints: { notWebReady: false },
        }],
      };
    } catch (err) {
      logger.warn(`Failed to resolve series stream for ${id}: ${err.message}`);
      return { streams: [] };
    }
  }

  return { streams: [] };
}

module.exports = { buildManifest, handleCatalog, handleMeta, handleStream };
