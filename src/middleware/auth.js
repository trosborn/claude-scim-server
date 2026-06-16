/**
 * Bearer token authentication middleware.
 * Okta sends: Authorization: Bearer <token>
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'] || '';

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '401',
      detail: 'Authorization header missing or not Bearer type',
    });
  }

  const token = authHeader.slice(7);
  const expected = process.env.SCIM_AUTH_TOKEN;

  if (!expected || token !== expected) {
    return res.status(401).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '401',
      detail: 'Invalid bearer token',
    });
  }

  next();
}

module.exports = authMiddleware;
