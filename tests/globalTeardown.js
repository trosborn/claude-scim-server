const { closePool } = require('../src/db');

module.exports = async function globalTeardown() {
  await closePool();
};
