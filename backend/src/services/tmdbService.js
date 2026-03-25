const https = require('https');
const zlib = require('zlib');
const fetch = require('node-fetch');
const { tmdbQueries, matchQueries, vodQueries, jobQueries } = require('../db/queries');
const logger = require('../utils/logger');

// parse-torrent-name may not be available — graceful fallback
let ptn;
try { ptn = require('parse-torrent-title'); } catch (_) { ptn = null; }

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const CONFIDENCE_THRESHOLD = 0.6;

const STRIP_PATTERNS = [
  /\b(arabic|hindi|dubbed|multi|english|french|german|spanish|italian|turkish|persian|urdu)\b/gi,
  /\b(hd|fhd|uhd|4k|1080p|720p|480p|bluray|blu-ray|webrip|web-dl|hdtv|dvdrip|xvid|x264|x265|hevc|avc)\b/gi,
  /\b(s\d{2}e\d{2}|season\s*\d+|episode\s*\d+)\b/gi,
  /[\[\](){}|_]/g,
  /\s{2,}/g,
];

function cleanTitle(rawTitle) {
  let title = rawTitle;
  for (const pattern of STRIP_PATTERNS) {
    title = title.replace(pattern, ' ');
  }
  title = title.trim();

  // Try parse-torrent-name for better extraction
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

  async runMatching(limit = 5000) {
    const jobId = await jobQueries.start('matching');
    try {
      logger.info('Starting TMDB matching...');
      const unmatched = await vodQueries.getUnmatchedForMatching(limit);
      logger.info(`Found ${unmatched.length} unmatched titles`);

      let matched = 0;
      let failed = 0;

      for (const { raw_title, vod_type } of unmatched) {
        // Skip if already in cache
        const existing = await matchQueries.findByRawTitle(raw_title);
        if (existing) continue;

        const clean = cleanTitle(raw_title);
        const year = extractYear(raw_title);

        try {
          let result = null;
          if (vod_type === 'series') {
            result = await tmdbQueries.fuzzyMatchSeries(clean, year);
          } else {
            result = await tmdbQueries.fuzzyMatchMovie(clean, year);
          }

          if (result && result.score >= CONFIDENCE_THRESHOLD) {
            await matchQueries.upsert({
              rawTitle: raw_title,
              tmdbId: result.id,
              tmdbType: vod_type === 'series' ? 'series' : 'movie',
              imdbId: result.imdb_id || null,
              confidenceScore: result.score,
            });
            matched++;
          } else {
            // Record as unmatched in cache so we don't retry
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
      }

      logger.info(`Matching complete: ${matched} matched, ${failed} unmatched`);
      await jobQueries.finish(jobId, { status: 'success', metadata: { matched, failed } });
      return { matched, failed, total: unmatched.length };
    } catch (err) {
      await jobQueries.finish(jobId, { status: 'failed', errorMessage: err.message });
      throw err;
    }
  },

  cleanTitle,
  extractYear,
  TMDB_POSTER_BASE,
};

module.exports = tmdbService;
