const { pool } = require('./pool');
const logger = require('../utils/logger');

/**
 * Matcher v2 compatibility migration.
 *
 * The production schema historically stored aliases in `normalized_title`,
 * while newer lookup code expects `normalized_alias`. Keep the table on the
 * UUID-based main schema and add the missing compatibility column/index.
 */
async function migrate() {
  const client = await pool.connect();
  try {
    logger.info('matcher_v2: starting migration');
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE content_aliases
      ADD COLUMN IF NOT EXISTS normalized_alias TEXT
    `);

    await client.query(`
      UPDATE content_aliases
      SET normalized_alias = COALESCE(normalized_alias, normalized_title, canonical_normalized_title)
      WHERE normalized_alias IS NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_content_aliases_normalized_alias
      ON content_aliases(normalized_alias)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS content_match_overrides (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        raw_title TEXT NOT NULL,
        canonical_content_id UUID REFERENCES canonical_content(id) ON DELETE SET NULL,
        reject BOOLEAN NOT NULL DEFAULT FALSE,
        reason TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, raw_title)
      )
    `);

    await client.query(`ALTER TABLE user_provider_vod ADD COLUMN IF NOT EXISTS match_status TEXT`);
    await client.query(`ALTER TABLE network_vod ADD COLUMN IF NOT EXISTS match_status TEXT`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_upv_match_status ON user_provider_vod(match_status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_nv_match_status ON network_vod(match_status)`);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_upv_imdb_provider ON user_provider_vod(imdb_id, provider_id) WHERE imdb_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_upv_tmdb_provider ON user_provider_vod(tmdb_id, provider_id) WHERE tmdb_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_nv_imdb_network ON network_vod(imdb_id, provider_network_id) WHERE imdb_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_nv_tmdb_network ON network_vod(tmdb_id, provider_network_id) WHERE tmdb_id IS NOT NULL`);

    await client.query('COMMIT');
    logger.info('matcher_v2: migration complete');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
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
