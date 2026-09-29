import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

import { errorHandler, notFound } from './middleware/errorHandler.js';
import routes from './routes/index.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * dotenv is loaded here, and again in server.js and in config/db.js.
 *
 * It has to be here. This module is imported by the test harness without
 * server.js ever running, and config/jwt.js reads JWT_SECRET lazily — inside
 * getJwtConfig() — so nothing forces it to be loaded before the first request
 * unless something does it. dotenv.config() never overwrites an already-set
 * variable, so calling it from three places is safe and the order is not
 * load-bearing.
 *
 * What IS load-bearing: config/db.js reads process.env at module-evaluation
 * time, so it loads dotenv itself. See the comment there.
 */
dotenv.config({ path: path.resolve(moduleDir, '.env'), quiet: true });

export function createApp() {
  const app = express();

  // Behind a reverse proxy in any real deployment, so req.ip and secure
  // cookies reflect the client rather than the proxy. auditMiddleware reads
  // req.ip for every mutation's audit row — reordering or removing this line
  // silently changes every recorded IP address.
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '1mb' }));

  // The Vite dev server is proxied, so in development the browser sees a single
  // origin and this rarely fires. It matters at deployment, and for a direct
  // request to :4000.
  const ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header = same-origin, curl, or a server-side call. Not a
        // cross-origin request, so there is nothing to reject.
        if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        // 403, not 500: a refused cross-origin request is the caller's mistake.
        // Without an explicit status the error handler would report a server
        // fault and log it as one.
        const error = new Error(`Origin ${origin} is not allowed by CORS`);
        error.status = 403;
        callback(error);
      },
    }),
  );

  app.use('/api/v1', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

const app = createApp();

export default app;
