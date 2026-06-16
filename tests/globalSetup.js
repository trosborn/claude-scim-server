require('dotenv').config({ path: '.env.test' });
const { closePool } = require('../src/db');
const { runMigrations } = require('../src/db/migrate');

module.exports = async function globalSetup() {
  process.env.NODE_ENV = 'test';
  process.env.SCIM_AUTH_TOKEN = 'test-token';

  // Run migrations against the test database, then close the pool.
  // Each test file creates its own pool via the module cache in its worker.
  await runMigrations();
  await closePool();
};
