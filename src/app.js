const express = require('express');
const authMiddleware = require('./middleware/auth');
const loggerMiddleware = require('./middleware/logger');
const usersRouter = require('./routes/users');
const groupsRouter = require('./routes/groups');
const metaRouter = require('./routes/meta');

function createApp() {
  const app = express();

  app.use(express.json({ type: ['application/json', 'application/scim+json'] }));

  // All SCIM responses must use application/scim+json per RFC 7644 §8.1
  app.use('/scim', (req, res, next) => {
    res.setHeader('Content-Type', 'application/scim+json');
    next();
  });

  // Health check — no auth required
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // All SCIM routes require auth + logging
  app.use('/scim/v2', authMiddleware, loggerMiddleware);

  // Meta endpoints (no trailing slash issue)
  app.use('/scim/v2', metaRouter);

  // Resource endpoints
  app.use('/scim/v2/Users', usersRouter);
  app.use('/scim/v2/Groups', groupsRouter);

  // 404 for anything else under /scim
  app.use('/scim', (req, res) => {
    res.status(404).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '404',
      detail: `Unknown SCIM endpoint: ${req.path}`,
    });
  });

  return app;
}

module.exports = createApp;
