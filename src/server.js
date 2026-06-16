require('dotenv').config();
const createApp = require('./app');
const { runMigrations } = require('./db/migrate');

const PORT = process.env.PORT || 3000;

async function main() {
  try {
    await runMigrations();
    console.log('[server] migrations applied');

    const app = createApp();
    app.listen(PORT, () => {
      console.log(`[server] SCIM server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('[server] startup error:', err);
    process.exit(1);
  }
}

main();
