const { Pool } = require('pg');

function getSslConfig() {
  const sslMode = (process.env.PGSSLMODE || '').toLowerCase();
  const databaseUrl = process.env.DATABASE_URL || '';

  if (sslMode === 'disable') return false;
  if (sslMode === 'require' || sslMode === 'prefer' || sslMode === 'allow') {
    return { rejectUnauthorized: false };
  }

  if (databaseUrl.includes('sslmode=require')) {
    return { rejectUnauthorized: false };
  }

  return false;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: getSslConfig(),
  max: parseInt(process.env.DB_POOL_MAX || '20'),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || '10000'),
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle DB client', err);
});

// Kill any query that runs longer than 60 s — prevents orphaned queries from
// saturating Postgres CPU if the Node process that spawned them crashes.
pool.on('connect', (client) => {
  client.query('SET statement_timeout = 60000');
});

module.exports = pool;
