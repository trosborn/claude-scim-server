/**
 * Request/response logger — the whole point of this server.
 * Logs full SCIM request and response bodies to stdout so
 * Render's log viewer shows exactly what Okta is sending/receiving.
 */
function loggerMiddleware(req, res, next) {
  const start = Date.now();
  const requestId = Math.random().toString(36).slice(2, 10).toUpperCase();

  // Capture request body (already parsed by express.json)
  const reqBody = req.body && Object.keys(req.body).length > 0 ? req.body : undefined;

  console.log(
    JSON.stringify({
      type: 'request',
      requestId,
      ts: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      headers: sanitizeHeaders(req.headers),
      body: reqBody,
    })
  );

  // Intercept response body
  const originalJson = res.json.bind(res);
  let responseBody;

  res.json = function (body) {
    responseBody = body;
    return originalJson(body);
  };

  res.on('finish', () => {
    console.log(
      JSON.stringify({
        type: 'response',
        requestId,
        ts: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
        body: responseBody,
      })
    );
  });

  next();
}

function sanitizeHeaders(headers) {
  const out = { ...headers };
  if (out['authorization']) {
    out['authorization'] = 'Bearer [redacted]';
  }
  return out;
}

module.exports = loggerMiddleware;
