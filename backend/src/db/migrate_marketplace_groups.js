require('dotenv').config();
const pool = require('./pool');

async function migrate() {
  console.log('Running marketplace grouping migration...');
  try {
    await pool.query(`
      ALTER TABLE provider_offerings ADD COLUMN IF NOT EXISTS group_id TEXT;
      ALTER TABLE provider_offerings ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT false;
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
