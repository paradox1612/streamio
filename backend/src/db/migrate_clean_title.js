const pool = require('./pool');
const logger = require('../utils/logger');
const { normalizeTitle: cleanTitle } = require('../utils/releaseParser');

/**
 * clean_title migration.
 *
 * The bulk matcher (tmdbQueries.strictMatch*) looks up titles by the COLLAPSED,
 * space-less "clean title" form the release parser produces ("Widow's Bay" →
 * "widowsbay"), but the columns had historically only ever stored the SPACED
 * normalized form ("widow s bay"), so multi-word/possessive titles never matched.
 *
 * This backfills the dedicated tmdb_*.clean_title columns (kept separate from the
 * spaced normalized_title, which the on-demand exactMatch path still uses) and
 * re-derives content_aliases.normalized_alias into the same collapsed form. The
 * upsert paths in queries.js compute these going forward; this fixes existing rows.
 *
 * Idempotent and resumable: keyset-paginated by primary key, and each batch only
 * writes rows whose value actually changed (IS DISTINCT FROM), so re-runs are no-ops.
 */
const BATCH = 5000;

async function backfillTmdb(table) {
  let processed = 0;
  let updated = 0;
  let lastId = 0;
  for (;;) {
    // Only rows that still need a clean_title. After the first full backfill every row
    // is populated (the upserts keep it current), so a re-triggered migration finds zero
    // rows and returns immediately instead of re-scanning the whole TMDB export. The
    // idx_*_clean_title index serves this IS NULL lookup.
    const { rows } = await pool.query(
      `SELECT id, original_title FROM ${table} WHERE clean_title IS NULL AND id > $1 ORDER BY id ASC LIMIT $2`,
      [lastId, BATCH]
    );
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1].id;
    processed += rows.length;

    const ids = [];
    const cleans = [];
    for (const r of rows) {
      ids.push(r.id);
      cleans.push(cleanTitle(r.original_title || '') || '');
    }
    const res = await pool.query(
      `UPDATE ${table} AS t
       SET clean_title = data.ct
       FROM (SELECT unnest($1::int[]) AS id, unnest($2::text[]) AS ct) AS data
       WHERE t.id = data.id AND t.clean_title IS DISTINCT FROM data.ct`,
      [ids, cleans]
    );
    updated += res.rowCount;
    if (processed % (BATCH * 10) === 0) {
      logger.info(`clean_title: ${table} processed ${processed} (updated ${updated})`);
    }
    if (rows.length < BATCH) break;
  }
  logger.info(`clean_title: ${table} done — processed ${processed}, updated ${updated}`);
  return updated;
}

async function backfillAliases() {
  let processed = 0;
  let updated = 0;
  let lastId = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const { rows } = await pool.query(
      `SELECT id, raw_title, normalized_alias FROM content_aliases WHERE id > $1 ORDER BY id ASC LIMIT $2`,
      [lastId, BATCH]
    );
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1].id;
    processed += rows.length;

    const ids = [];
    const cleans = [];
    for (const r of rows) {
      const collapsed = cleanTitle(r.raw_title || '') || null;
      if (collapsed !== r.normalized_alias) {
        ids.push(r.id);
        cleans.push(collapsed);
      }
    }
    if (ids.length) {
      const res = await pool.query(
        `UPDATE content_aliases AS a
         SET normalized_alias = data.na
         FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::text[]) AS na) AS data
         WHERE a.id = data.id AND a.normalized_alias IS DISTINCT FROM data.na`,
        [ids, cleans]
      );
      updated += res.rowCount;
    }
    if (rows.length < BATCH) break;
  }
  logger.info(`clean_title: content_aliases done — processed ${processed}, updated ${updated}`);
  return updated;
}

async function migrate() {
  try {
    logger.info('clean_title: starting migration');
    // DDL is also in schema.sql for fresh installs; repeated here so the backfill is
    // self-contained and safe to run standalone. All idempotent.
    await pool.query('ALTER TABLE tmdb_movies ADD COLUMN IF NOT EXISTS clean_title VARCHAR');
    await pool.query('ALTER TABLE tmdb_series ADD COLUMN IF NOT EXISTS clean_title VARCHAR');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_tmdb_movies_clean_title ON tmdb_movies(clean_title)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_tmdb_series_clean_title ON tmdb_series(clean_title)');

    await backfillTmdb('tmdb_movies');
    await backfillTmdb('tmdb_series');
    await backfillAliases();

    logger.info('clean_title: migration complete');
  } catch (err) {
    logger.error('clean_title migration failed:', err.message);
    throw err;
  }
}

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = migrate;
