/**
 * Terminal middleware. Nothing downstream of this runs, so it is the single
 * place where an error becomes an HTTP response.
 *
 * The rule that matters: an unexpected error becomes a generic sentence. Stack
 * traces, SQL fragments (`err.sql`), and driver codes tell an attacker the
 * schema and the query shape; in development they are merely useful, so they
 * are gated on NODE_ENV rather than deleted.
 */

/** Catch-all for unmatched routes. Must be registered after all routes. */
export function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity, so `next` must stay.
export function errorHandler(err, req, res, next) {
  // Opt-IN to detail rather than opt-out. Testing this as `=== 'production'`
  // fails open: a deployment that forgets NODE_ENV, or misspells it, silently
  // starts leaking driver messages. Anything that is not explicitly
  // `development` is treated as production and stays quiet.
  const isDevelopment = process.env.NODE_ENV === 'development';

  // A malformed JSON body is a client mistake, not a server fault: express.json()
  // throws it before any route runs.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'Request body is not valid JSON',
    });
  }

  const status = Number.isInteger(err.status) ? err.status : 500;

  // Driver and filesystem errors can carry the offending SQL or an absolute
  // path. They are logged, never returned.
  const body = {
    success: false,
    message: status >= 500 ? 'Internal server error' : err.message,
  };

  if (isDevelopment && status >= 500) {
    body.detail = err.message;
    if (err.code) body.code = err.code;
  }

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  res.status(status).json(body);
}
