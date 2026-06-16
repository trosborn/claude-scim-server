require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getPool } = require('./index');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runMigrations() {
  const pool = getPool();

  // Ensure migrations table exists (bootstrap)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows: applied } = await pool.query('SELECT name FROM migrations ORDER BY name');
  const appliedNames = new Set(applied.map((r) => r.name));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (appliedNames.has(file)) {
      console.log(`[migrate] skip: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[migrate] applied: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  console.log('[migrate] done');
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[migrate] error:', err);
      process.exit(1);
    });
}

module.exports = { runMigrations };
