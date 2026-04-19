require('dotenv').config();
const pool = require('./pool');

async function migrate() {
  console.log('Running offering delete fix migration...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Make offering_id nullable
    await client.query(`
      ALTER TABLE provider_subscriptions ALTER COLUMN offering_id DROP NOT NULL;
    `);

    // 2. Update foreign key to SET NULL
    // First, find the constraint name
    const { rows } = await client.query(`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'provider_subscriptions'::regclass
        AND confrelid = 'provider_offerings'::regclass
        AND contype = 'f';
    `);

    for (const row of rows) {
      await client.query(`
        ALTER TABLE provider_subscriptions 
        DROP CONSTRAINT ${row.conname},
        ADD CONSTRAINT ${row.conname} 
          FOREIGN KEY (offering_id) 
          REFERENCES provider_offerings(id) 
          ON DELETE SET NULL;
      `);
    }

    await client.query('COMMIT');
    console.log('Migration successful.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    await pool.end();
    process.exit();
  }
}

migrate();
