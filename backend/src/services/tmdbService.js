const https = require('https');
const zlib = require('zlib');
const fetch = require('node-fetch');
const { tmdbQueries, matchQueries, vodQueries, jobQueries } = require('../db/queries');
const logger = require('../utils/logger');
const { cleanTitle, normalizeTitle, parseMovieTitle, parseSeriesTitle } = require('../utils/titleNormalization');
const { parseRelease, normalizeTitle: normalizeTitleStrict } = require('../utils/releaseParser');
const { waitForAddonCapacity, getActiveAddonRequests } = require('../utils/loadManager');
const { getJobRunnerMetadata } = require('../utils/runtimeInfo');

// parse-torrent-name may not be available — graceful fallback
let ptn;
try { ptn = require('parse-torrent-title'); } catch (_) { ptn = null; }

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const CONFIDENCE_THRESHOLD = 0.6;
// Matcher v2 is strict: exact normalized_title + type + year. Fuzzy scoring is
// the thing that caused "The Pitt" to be linked to tt31938062 ("The Regime").
// Leave MATCHER_FUZZY_FALLBACK=true only to fall back to the legacy loose
// matcher when v2 returns no result — never to override a v2 rejection.
const MATCHER_FUZZY_FALLBACK = process.env.MATCHER_FUZZY_FALLBACK === 'true';
const MATCH_CONCURRENCY = parseInt(process.env.TMDB_MATCH_CONCURRENCY || '2', 10);
const MATCH_BATCH_SIZE = parseInt(process.env.TMDB_MATCH_BATCH_SIZE || '1000', 10);
const MATCH_BATCH_PAUSE_MS = parseInt(process.env.TMDB_MATCH_BATCH_PAUSE_MS || '250', 10);

function sleep(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractCleanTitle(rawTitle) {
  let title = cleanTitle(rawTitle);

  if (ptn) {
    try {
      const parsed = ptn(rawTitle);
      if (parsed.title && parsed.title.length > 2) {
        title = parsed.title;
      }
    } catch (_) {}
  }

  return title.trim();
}

function extractYear(rawTitle) {
  const match = rawTitle.match(/\b(19\d{2}|20\d{2})\b/);
  return match ? parseInt(match[1]) : null;
}

async function downloadTmdbExport(type) {
  // type: 'movie' | 'tv_series'
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const yyyy = now.getFullYear();

  // Try today first, then yesterday
  const dates = [
    `${mm}_${dd}_${yyyy}`,
    (() => {
      const d = new Date(now - 86400000);
      return `${String(d.getMonth()+1).padStart(2,'0')}_${String(d.getDate()).padStart(2,'0')}_${d.getFullYear()}`;
    })(),
  ];

  for (const dateStr of dates) {
    const url = `http://files.tmdb.org/p/exports/${type}_ids_${dateStr}.json.gz`;
    logger.info(`Attempting TMDB export download: ${url}`);
    try {
      const data = await new Promise((resolve, reject) => {
        https.get(url.replace('http://', 'https://'), (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          const chunks = [];
          const gunzip = zlib.createGunzip();
          res.pipe(gunzip);
          gunzip.on('data', chunk => chunks.push(chunk));
          gunzip.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
          gunzip.on('error', reject);
        }).on('error', reject);
      });
      return data;
    } catch (err) {
      logger.warn(`TMDB export download failed for ${dateStr}: ${err.message}`);
    }
  }
  throw new Error('Could not download TMDB export for any date');
}

async function enrichMovieFromApi(tmdbId) {
  if (!TMDB_API_KEY) return {};
  try {
    const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
    const res = await fetch(url);
    if (!res.ok) return {};
    const data = await res.json();
    return {
      imdb_id: data.imdb_id || data.external_ids?.imdb_id || null,
      poster_path: data.poster_path || null,
      overview: data.overview || null,
      popularity: data.popularity || 0,
    };
  } catch (_) { return {}; }
}

async function fetchImdbIdFromApi(tmdbType, tmdbId, fallbackImdbId = null) {
  if (fallbackImdbId) return fallbackImdbId;
  if (!TMDB_API_KEY || !tmdbId) return null;

  const path = tmdbType === 'series'
    ? `tv/${tmdbId}/external_ids`
    : `movie/${tmdbId}/external_ids`;

  try {
    const res = await fetch(`https://api.themoviedb.org/3/${path}?api_key=${TMDB_API_KEY}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.imdb_id || null;
  } catch (_) {
    return null;
  }
}

/**
 * Strict matcher (v2):
 *   1. Parse raw title with the Sonarr-style release parser.
 *   2. Require a non-empty normalized title.
 *   3. Try exact match on tmdb_movies/tmdb_series with type + year locked.
 *   4. If miss and we had a year, try alias table (localized / scene names).
 *   5. If still miss, try exact match with year dropped but mark lower
 *      confidence so downstream can reject if needed.
 *   6. No fuzzy. Ambiguous (>1 candidate) is treated as unmatched.
 *
 * This is what prevents "The Pitt" from resolving to "The Regime": both would
 * have to normalize to the same string AND share a year window AND be the
 * same type AND be the only candidate at that intersection. If any of those
 * fail, we return null and leave the row unmatched instead of guessing.
 */
async function findBestMatch(rawTitle, vodType) {
  const parsed = parseRelease(rawTitle);
  const normalized = parsed.normalizedTitle || normalizeTitleStrict(rawTitle);
  const year = parsed.year || extractYear(rawTitle);
  const resolvedType = vodType === 'series' ? 'series' : 'movie';

  if (!normalized) return null;

  // Parser should agree on type where it can. If parser detected episodes but
  // caller says movie (or vice versa), trust the parser — that's a signal the
  // row was miscategorized at ingest.
  const parserType = parsed.type !== 'unknown' ? parsed.type : null;
  const effectiveType = parserType || resolvedType;

  const strictFn = effectiveType === 'series'
    ? tmdbQueries.strictMatchSeries.bind(tmdbQueries)
    : tmdbQueries.strictMatchMovie.bind(tmdbQueries);

  // 1. Strict exact match (type + year + unique candidate)
  const strict = await strictFn(normalized, year);
  if (strict) return { ...strict, match_source: 'strict_exact' };

  // 2. Alias match (localized / AKA / scene)
  const alias = await tmdbQueries.aliasMatch(normalized, effectiveType, year);
  if (alias) return { ...alias, match_source: 'alias' };

  // 3. Retry without year if we had one — lower implicit confidence.
  //    Still requires uniqueness, so won't mass-collide.
  if (year) {
    const noYear = await strictFn(normalized, null);
    if (noYear) return { ...noYear, score: 0.85, match_source: 'strict_no_year' };
  }

  // 4. Optional legacy fuzzy fallback — OFF by default. Only here for a
  //    controlled rollout window; flip the flag to catch regressions.
  if (MATCHER_FUZZY_FALLBACK) {
    const legacyParsed = effectiveType === 'series'
      ? parseSeriesTitle(extractCleanTitle(rawTitle))
      : parseMovieTitle(extractCleanTitle(rawTitle));
    const legacyNormalized = legacyParsed.canonicalNormalizedTitle
      || normalizeTitle(legacyParsed.canonicalTitle || rawTitle);
    const legacyExact = effectiveType === 'series'
      ? tmdbQueries.exactMatchSeries.bind(tmdbQueries)
      : tmdbQueries.exactMatchMovie.bind(tmdbQueries);
    const legacy = await legacyExact(legacyNormalized, year) || await legacyExact(legacyNormalized, null);
    if (legacy) return { ...legacy, score: 0.7, match_source: 'legacy_fallback' };
  }

  return null;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

async function processMatchingBatch(unmatched, { imdbCache, concurrency, enrichMissingImdb }) {
  let matched = 0;
  let failed = 0;
  let enriched = 0;

  await mapWithConcurrency(unmatched, concurrency, async ({ raw_title, vod_type, tmdb_id, imdb_id, confidence_score }, index) => {
    await waitForAddonCapacity();

    if (tmdb_id && !imdb_id) {
      if (!enrichMissingImdb) {
        if ((index + 1) % 250 === 0 || index === unmatched.length - 1) {
          logger.info(`Matching progress: ${index + 1}/${unmatched.length} processed`);
        }
        return;
      }

      const cacheKey = `${vod_type}:${tmdb_id}`;
      let enrichedImdbId = imdbCache.get(cacheKey);
      if (enrichedImdbId === undefined) {
        enrichedImdbId = await fetchImdbIdFromApi(vod_type, tmdb_id);
        imdbCache.set(cacheKey, enrichedImdbId);
      }
      if (enrichedImdbId) {
        await matchQueries.upsert({
          rawTitle: raw_title,
          tmdbId: tmdb_id,
          tmdbType: vod_type === 'series' ? 'series' : 'movie',
          imdbId: enrichedImdbId,
          confidenceScore: confidence_score || 1,
        });
        enriched++;
      }
      if ((index + 1) % 250 === 0 || index === unmatched.length - 1) {
        logger.info(`Matching progress: ${index + 1}/${unmatched.length} processed`);
      }
      return;
    }

    try {
      const result = await findBestMatch(raw_title, vod_type);

      if (result && result.score >= CONFIDENCE_THRESHOLD) {
        const resolvedType = vod_type === 'series' ? 'series' : 'movie';
        const cacheKey = `${resolvedType}:${result.id}`;
        let resolvedImdbId = result.imdb_id || null;
        if (enrichMissingImdb) {
          resolvedImdbId = imdbCache.get(cacheKey);
          if (resolvedImdbId === undefined) {
            resolvedImdbId = await fetchImdbIdFromApi(
              resolvedType,
              result.id,
              result.imdb_id || null
            );
            imdbCache.set(cacheKey, resolvedImdbId);
          }
        }
        await matchQueries.upsert({
          rawTitle: raw_title,
          tmdbId: result.id,
          tmdbType: resolvedType,
          imdbId: resolvedImdbId,
          confidenceScore: result.score,
        });
        matched++;
      } else {
        await matchQueries.upsert({
          rawTitle: raw_title,
          tmdbId: null,
          tmdbType: vod_type === 'series' ? 'series' : 'movie',
          imdbId: null,
          confidenceScore: result?.score || 0,
        });
        failed++;
      }
    } catch (err) {
      logger.warn(`Match error for "${raw_title}": ${err.message}`);
      failed++;
    }

    if ((index + 1) % 250 === 0 || index === unmatched.length - 1) {
      logger.info(`Matching progress: ${index + 1}/${unmatched.length} processed`);
    }
  });

  return { matched, failed, enriched, total: unmatched.length };
}

const tmdbService = {
  async syncExports() {
    const jobId = await jobQueries.start('tmdbSync');
    try {
      logger.info('Starting TMDB export sync...');

      // Movies
      logger.info('Downloading movie export...');
      const movieData = await downloadTmdbExport('movie');
      let movieCount = 0;
      let movieBuffer = [];
      const BUFFER_SIZE = 500;

      for (const line of movieData.split('\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (!obj.id || !obj.original_title || obj.adult) continue;
          movieBuffer.push({
            id: obj.id,
            original_title: obj.original_title,
            normalized_title: normalizeTitle(obj.original_title),
            release_year: obj.release_date ? parseInt(obj.release_date.split('-')[0]) : null,
            popularity: obj.popularity || 0,
            poster_path: null,
            overview: null,
            imdb_id: null,
          });
          movieCount++;

          if (movieBuffer.length >= BUFFER_SIZE) {
            await tmdbQueries.upsertMovieBatch(movieBuffer);
            movieBuffer = [];
            logger.info(`[Movies] Processed ${movieCount} items...`);
          }
        } catch (_) {}
      }

      // Flush remaining movies
      if (movieBuffer.length > 0) {
        await tmdbQueries.upsertMovieBatch(movieBuffer);
      }
      logger.info(`Upserted ${movieCount} movies`);

      // TV Series
      logger.info('Downloading TV series export...');
      const tvData = await downloadTmdbExport('tv_series');
      let seriesCount = 0;
      let seriesBuffer = [];

      for (const line of tvData.split('\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (!obj.id || !obj.original_name) continue;
          seriesBuffer.push({
            id: obj.id,
            original_title: obj.original_name,
            normalized_title: normalizeTitle(obj.original_name),
            first_air_year: obj.first_air_date ? parseInt(obj.first_air_date.split('-')[0]) : null,
            popularity: obj.popularity || 0,
            poster_path: null,
            overview: null,
          });
          seriesCount++;

          if (seriesBuffer.length >= BUFFER_SIZE) {
            await tmdbQueries.upsertSeriesBatch(seriesBuffer);
            seriesBuffer = [];
            logger.info(`[Series] Processed ${seriesCount} items...`);
          }
        } catch (_) {}
      }

      // Flush remaining series
      if (seriesBuffer.length > 0) {
        await tmdbQueries.upsertSeriesBatch(seriesBuffer);
      }
      logger.info(`Upserted ${seriesCount} series`);

      await jobQueries.finish(jobId, {
        status: 'success',
        metadata: getJobRunnerMetadata({ movieCount, seriesCount }),
      });

      return { movieCount, seriesCount };
    } catch (err) {
      await jobQueries.finish(jobId, {
        status: 'failed',
        errorMessage: err.message,
        metadata: getJobRunnerMetadata(),
      });
      throw err;
    }
  },

  async runMatching(limit = MATCH_BATCH_SIZE, { enrichMissingImdb = true } = {}) {
    const jobId = await jobQueries.start('matching');
    try {
      logger.info('Starting TMDB matching...');
      const imdbCache = new Map();
      const concurrency = Math.max(1, Math.min(MATCH_CONCURRENCY, 16));
      let totalMatched = 0;
      let totalFailed = 0;
      let totalEnriched = 0;
      let totalProcessed = 0;
      let batchNumber = 0;

      while (true) {
        const unmatched = await vodQueries.getUnmatchedForMatching(limit, { enrichMissingImdb });
        if (!unmatched.length) break;

        batchNumber++;
        logger.info(`Starting matching batch ${batchNumber} with ${unmatched.length} titles`);
        const batchResult = await processMatchingBatch(unmatched, { imdbCache, concurrency, enrichMissingImdb });
        totalMatched += batchResult.matched;
        totalFailed += batchResult.failed;
        totalEnriched += batchResult.enriched;
        totalProcessed += batchResult.total;

        logger.info(
          `Batch ${batchNumber} complete: ${batchResult.matched} matched, ` +
          `${batchResult.enriched} IMDb-enriched, ${batchResult.failed} unmatched`
        );

        if (getActiveAddonRequests() > 0) {
          logger.info(`Background matching yielded to ${getActiveAddonRequests()} active addon request(s)`);
        }

        if (batchResult.matched === 0 && batchResult.enriched === 0) {
          logger.info(
            `Stopping matching after batch ${batchNumber}: no new matches or IMDb enrichments were produced`
          );
          break;
        }

        if (MATCH_BATCH_PAUSE_MS > 0) {
          await sleep(MATCH_BATCH_PAUSE_MS);
        }

        if (unmatched.length < limit) break;
      }

      logger.info(
        `Matching complete: ${totalMatched} matched, ${totalEnriched} IMDb-enriched, ` +
        `${totalFailed} unmatched across ${totalProcessed} processed`
      );
      await jobQueries.finish(jobId, {
        status: 'success',
        metadata: getJobRunnerMetadata({
          matched: totalMatched,
          enriched: totalEnriched,
          failed: totalFailed,
          totalProcessed,
          batches: batchNumber,
        }),
      });
      return {
        matched: totalMatched,
        enriched: totalEnriched,
        failed: totalFailed,
        total: totalProcessed,
        batches: batchNumber,
      };
    } catch (err) {
      await jobQueries.finish(jobId, {
        status: 'failed',
        errorMessage: err.message,
        metadata: getJobRunnerMetadata(),
      });
      throw err;
    }
  },

  cleanTitle: extractCleanTitle,
  extractYear,
  TMDB_POSTER_BASE,

  async getMovieDetails(tmdbId) {
    if (!TMDB_API_KEY) return null;
    try {
      const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=credits,external_ids,videos`;
      const res = await fetch(url);
      if (!res.ok) return null;
      return res.json();
    } catch (_) { return null; }
  },

  async getSeriesDetails(tmdbId) {
    if (!TMDB_API_KEY) return null;
    try {
      const url = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=credits,external_ids,videos`;
      const res = await fetch(url);
      if (!res.ok) return null;
      return res.json();
    } catch (_) { return null; }
  },

  async getSimilar(tmdbId, type) {
    if (!TMDB_API_KEY) return [];
    try {
      const path = type === 'series' || type === 'tv' ? 'tv' : 'movie';
      const url = `https://api.themoviedb.org/3/${path}/${tmdbId}/similar?api_key=${TMDB_API_KEY}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return data.results || [];
    } catch (_) { return []; }
  },

  async getSeasonDetails(tmdbId, seasonNum) {
    if (!TMDB_API_KEY) return null;
    try {
      const url = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}?api_key=${TMDB_API_KEY}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      return res.json();
    } catch (_) { return null; }
  },
};

module.exports = tmdbService;
