const db = require('../src/db');

/**
 * Truncate all SCIM tables between tests for isolation.
 */
async function clearDatabase() {
  await db.query('TRUNCATE users, groups, group_members RESTART IDENTITY CASCADE');
}

module.exports = { clearDatabase };
