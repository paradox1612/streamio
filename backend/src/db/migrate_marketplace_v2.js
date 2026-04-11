require('dotenv').config();
const pool = require('./pool');

async function migrate() {
  console.log('Running enhanced marketplace migration...');
  try {
    // 1. Update provider_offerings table
    await pool.query(`
      ALTER TABLE provider_offerings ADD COLUMN IF NOT EXISTS group_id TEXT;
      ALTER TABLE provider_offerings ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT false;
      ALTER TABLE provider_offerings ADD COLUMN IF NOT EXISTS countries TEXT[] DEFAULT ARRAY[]::TEXT[];
      ALTER TABLE provider_offerings ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];
    `);

    // 2. Update provider_subscriptions table
    await pool.query(`
      ALTER TABLE provider_subscriptions ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT true;
    `);

    console.log('Migration successful.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
    process.exit();
  }
}

migrate();
