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
  max: parseInt(process.env.DB_POOL_MAX || '10'),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || '3000'),
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle DB client', err);
});

module.exports = pool;
