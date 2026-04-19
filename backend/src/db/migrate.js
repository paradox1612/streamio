require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

const MIGRATION_LOCK_KEY = 'streambridge-schema-migration';

function getSchemaHash(schemaSQL) {
  return crypto.createHash('sha256').update(schemaSQL).digest('hex');
}

async function migrate() {
  const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const schemaHash = getSchemaHash(schemaSQL);
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [MIGRATION_LOCK_KEY]);
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migration_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        schema_hash TEXT NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await client.query(
      'SELECT schema_hash FROM schema_migration_meta WHERE id = 1'
    );
    const currentHash = rows[0]?.schema_hash || null;

    if (currentHash === schemaHash) {
      console.log('Schema unchanged; skipping migrations.');
      await client.query('COMMIT');
      return;
    }

    console.log('Running migrations...');
    await client.query(schemaSQL);
    await client.query(
      `
        INSERT INTO schema_migration_meta (id, schema_hash, applied_at)
        VALUES (1, $1, NOW())
        ON CONFLICT (id)
        DO UPDATE SET schema_hash = EXCLUDED.schema_hash, applied_at = EXCLUDED.applied_at
      `,
      [schemaHash]
    );
    await client.query('COMMIT');
    console.log('Schema migrations complete.');

    // Run performance backfill migration
    const migratePerf = require('./migrate_perf_indexes');
    await migratePerf();

    console.log('All migrations complete.');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK_KEY]);
    } catch (_) {}
    client.release();
    await pool.end();
  }
}

migrate();
