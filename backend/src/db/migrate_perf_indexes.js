const { pool } = require('./pool');
const logger = require('../utils/logger');

async function migrate() {
  const client = await pool.connect();
  try {
    logger.info('Starting performance indexing migration...');

    // 1. Add tmdb_id and imdb_id to user_provider_vod
    await client.query('ALTER TABLE user_provider_vod ADD COLUMN IF NOT EXISTS tmdb_id INTEGER');
    await client.query('ALTER TABLE user_provider_vod ADD COLUMN IF NOT EXISTS imdb_id TEXT');
    await client.query('CREATE INDEX IF NOT EXISTS idx_upv_tmdb_id ON user_provider_vod(tmdb_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_upv_imdb_id ON user_provider_vod(imdb_id)');

    // 2. Add tmdb_id and imdb_id to network_vod
    await client.query('ALTER TABLE network_vod ADD COLUMN IF NOT EXISTS tmdb_id INTEGER');
    await client.query('ALTER TABLE network_vod ADD COLUMN IF NOT EXISTS imdb_id TEXT');
    await client.query('CREATE INDEX IF NOT EXISTS idx_network_vod_tmdb_id ON network_vod(tmdb_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_network_vod_imdb_id ON network_vod(imdb_id)');

    // 3. User providers needs composite for the filter (user_id is usually where we start)
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_providers_user_id_id ON user_providers(user_id, id)');

    // 4. Backfill from canonical_content and matched_content
    logger.info('Backfilling tmdb_id and imdb_id in VOD tables...');
    
    // Backfill user_provider_vod
    await client.query(`
      UPDATE user_provider_vod v
      SET tmdb_id = cc.tmdb_id, imdb_id = cc.imdb_id
      FROM canonical_content cc
      WHERE v.canonical_content_id = cc.id AND v.tmdb_id IS NULL
    `);
    await client.query(`
      UPDATE user_provider_vod v
      SET tmdb_id = m.tmdb_id, imdb_id = m.imdb_id
      FROM matched_content m
      WHERE v.raw_title = m.raw_title AND v.tmdb_id IS NULL
    `);

    // Backfill network_vod
    await client.query(`
      UPDATE network_vod v
      SET tmdb_id = cc.tmdb_id, imdb_id = cc.imdb_id
      FROM canonical_content cc
      WHERE v.canonical_content_id = cc.id AND v.tmdb_id IS NULL
    `);
    
    logger.info('Performance indexing migration completed.');
  } catch (err) {
    logger.error('Migration failed:', err.message);
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrate().then(() => process.exit(0));
}

module.exports = migrate;
