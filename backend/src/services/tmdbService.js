const https = require('https');
const zlib = require('zlib');
const fetch = require('node-fetch');
const { tmdbQueries, matchQueries, vodQueries, jobQueries } = require('../db/queries');
const logger = require('../utils/logger');
const { cleanTitle, normalizeTitle } = require('../utils/titleNormalization');
const { waitForAddonCapacity, getActiveAddonRequests } = require('../utils/loadManager');

// parse-torrent-name may not be available — graceful fallback
let ptn;
try { ptn = require('parse-torrent-title'); } catch (_) { ptn = null; }

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const CONFIDENCE_THRESHOLD = 0.6;
const MATCH_CONCURRENCY = parseInt(process.env.TMDB_MATCH_CONCURRENCY || '4', 10);
const MATCH_BATCH_SIZE = parseInt(process.env.TMDB_MATCH_BATCH_SIZE || '10000', 10);

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

async function findBestMatch(rawTitle, vodType) {
  const clean = extractCleanTitle(rawTitle);
  const normalized = normalizeTitle(clean);
  const year = extractYear(rawTitle);

  if (!normalized) return null;

  if (vodType === 'series') {
    const exact = await tmdbQueries.exactMatchSeries(normalized, year);
    return exact || tmdbQueries.fuzzyMatchSeries(normalized, year);
  }

  const exact = await tmdbQueries.exactMatchMovie(normalized, year);
  return exact || tmdbQueries.fuzzyMatchMovie(normalized, year);
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

async function processMatchingBatch(unmatched, { imdbCache, concurrency }) {
  let matched = 0;
  let failed = 0;
  let enriched = 0;

  await mapWithConcurrency(unmatched, concurrency, async ({ raw_title, vod_type, tmdb_id, imdb_id, confidence_score }, index) => {
    await waitForAddonCapacity();

    if (tmdb_id && !imdb_id) {
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
        let resolvedImdbId = imdbCache.get(cacheKey);
        if (resolvedImdbId === undefined) {
          resolvedImdbId = await fetchImdbIdFromApi(
            resolvedType,
            result.id,
            result.imdb_id || null
          );
          imdbCache.set(cacheKey, resolvedImdbId);
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
      for (const line of movieData.split('\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (!obj.id || !obj.original_title || obj.adult) continue;
          await tmdbQueries.upsertMovie({
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
        } catch (_) {}
      }
      logger.info(`Upserted ${movieCount} movies`);

      // TV Series
      logger.info('Downloading TV series export...');
      const tvData = await downloadTmdbExport('tv_series');
      let seriesCount = 0;
      for (const line of tvData.split('\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (!obj.id || !obj.original_name) continue;
          await tmdbQueries.upsertSeries({
            id: obj.id,
            original_title: obj.original_name,
            normalized_title: normalizeTitle(obj.original_name),
            first_air_year: obj.first_air_date ? parseInt(obj.first_air_date.split('-')[0]) : null,
            popularity: obj.popularity || 0,
            poster_path: null,
            overview: null,
          });
          seriesCount++;
        } catch (_) {}
      }
      logger.info(`Upserted ${seriesCount} series`);

      await jobQueries.finish(jobId, {
        status: 'success',
        metadata: { movieCount, seriesCount },
      });

      return { movieCount, seriesCount };
    } catch (err) {
      await jobQueries.finish(jobId, { status: 'failed', errorMessage: err.message });
      throw err;
    }
  },

  async runMatching(limit = MATCH_BATCH_SIZE) {
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
        const unmatched = await vodQueries.getUnmatchedForMatching(limit);
        if (!unmatched.length) break;

        batchNumber++;
        logger.info(`Starting matching batch ${batchNumber} with ${unmatched.length} titles`);
        const batchResult = await processMatchingBatch(unmatched, { imdbCache, concurrency });
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

        if (unmatched.length < limit) break;
      }

      logger.info(
        `Matching complete: ${totalMatched} matched, ${totalEnriched} IMDb-enriched, ` +
        `${totalFailed} unmatched across ${totalProcessed} processed`
      );
      await jobQueries.finish(jobId, {
        status: 'success',
        metadata: {
          matched: totalMatched,
          enriched: totalEnriched,
          failed: totalFailed,
          totalProcessed,
          batches: batchNumber,
        },
      });
      return {
        matched: totalMatched,
        enriched: totalEnriched,
        failed: totalFailed,
        total: totalProcessed,
        batches: batchNumber,
      };
    } catch (err) {
      await jobQueries.finish(jobId, { status: 'failed', errorMessage: err.message });
      throw err;
    }
  },

  cleanTitle: extractCleanTitle,
  extractYear,
  TMDB_POSTER_BASE,
};

module.exports = tmdbService;
