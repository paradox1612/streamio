const { pool } = require('./pool');
const logger = require('../utils/logger');

/**
 * Matcher v2: exact + alias matching with strict type/year enforcement.
 *
 *   - content_aliases: alternate titles (local/AKA) from TMDb, scene maps,
 *     manual overrides. Keyed by normalized alias → canonical_content.
 *   - content_match_overrides: user-facing corrections ("this is the wrong
 *     show"). Raw title → canonical id, per user.
 *   - Extra indexes to support the new strict lookup path and the rewritten
 *     stream-resolve query.
 */
async function migrate() {
  const client = await pool.connect();
  try {
    logger.info('matcher_v2: starting migration');

    // Alias table
    await client.query(`
      CREATE TABLE IF NOT EXISTS content_aliases (
        canonical_content_id INTEGER NOT NULL REFERENCES canonical_content(id) ON DELETE CASCADE,
        normalized_alias TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'tmdb_alt_titles',
        year INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (canonical_content_id, normalized_alias)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_content_aliases_normalized ON content_aliases(normalized_alias)`);

    // Per-user manual overrides
    await client.query(`
      CREATE TABLE IF NOT EXISTS content_match_overrides (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        raw_title TEXT NOT NULL,
        canonical_content_id INTEGER REFERENCES canonical_content(id) ON DELETE SET NULL,
        reject BOOLEAN NOT NULL DEFAULT FALSE,
        reason TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, raw_title)
      )
    `);

    // Match-status tracking on VOD rows so we can surface "needs manual match"
    await client.query(`ALTER TABLE user_provider_vod ADD COLUMN IF NOT EXISTS match_status TEXT`);
    await client.query(`ALTER TABLE network_vod ADD COLUMN IF NOT EXISTS match_status TEXT`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_upv_match_status ON user_provider_vod(match_status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_nv_match_status ON network_vod(match_status)`);

    // Composite indexes to accelerate the rewritten stream-resolve query.
    // (imdb/tmdb is selective, so single-column is fine, but the composite
    // lets PG avoid a lookup into user_providers for online-only filtering.)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_upv_imdb_provider ON user_provider_vod(imdb_id, provider_id) WHERE imdb_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_upv_tmdb_provider ON user_provider_vod(tmdb_id, provider_id) WHERE tmdb_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_nv_imdb_network ON network_vod(imdb_id, provider_network_id) WHERE imdb_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_nv_tmdb_network ON network_vod(tmdb_id, provider_network_id) WHERE tmdb_id IS NOT NULL`);

    logger.info('matcher_v2: migration complete');
  } catch (err) {
    logger.error('matcher_v2 migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = migrate;
