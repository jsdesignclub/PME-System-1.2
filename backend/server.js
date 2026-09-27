import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

import { pool, testConnection } from './config/db.js';
import { getJwtConfig } from './config/jwt.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import routes from './routes/index.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(moduleDir, '.env'), quiet: true });

const PLACEHOLDER = 'change-me';

const REQUIRED_VARS = [
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'JWT_SECRET',
];

/**
 * Refuse to boot on incomplete configuration.
 *
 * A server that starts with a blank JWT_SECRET will happily sign tokens that
 * anyone can forge, and one that starts with no DB_PASSWORD fails later, on the
 * first request, as a 500 that looks like a bug. Both are worse than a failed
 * start. Placeholders count as missing: someone who copied .env.example and
 * did not finish has not configured anything.
 */
function assertConfigIsComplete() {
  const problems = [];

  for (const name of REQUIRED_VARS) {
    const value = process.env[name];
    if (!value || !value.trim()) {
      problems.push(`  ${name} is not set`);
    } else if (value.trim() === PLACEHOLDER) {
      problems.push(`  ${name} is still the .env.example placeholder`);
    }
  }

  if (problems.length > 0) {
    console.error(
      `\nCannot start: backend/.env is incomplete.\n\n${problems.join('\n')}\n\n` +
        `Fix: copy backend/.env.example to backend/.env and replace every '${PLACEHOLDER}'.\n` +
        `See README.md > Troubleshooting for the full list.\n`,
    );
    process.exit(1);
  }

  // Surfaces a blank/placeholder JWT_SECRET as a startup failure too, so the
  // auth config has a single validation path.
  getJwtConfig();
}

assertConfigIsComplete();

const app = express();

// Behind a reverse proxy in any real deployment, so req.ip and secure
// cookies reflect the client rather than the proxy.
app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));

// The Vite dev server is proxied (Task 0.7 step 5), so in development the
// browser sees a single origin and this rarely fires. It matters at
// deployment, and for `curl` against :4000.
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

const PORT = Number(process.env.PORT) || 4000;

async function start() {
  // The pool is lazy, so this is the first moment a bad DB_HOST/DB_PASSWORD
  // can be reported as a configuration problem rather than a request failure.
  try {
    await testConnection();
    console.log(`[db] connected to ${process.env.DB_NAME} on ${process.env.DB_HOST}:${process.env.DB_PORT}`);
  } catch (error) {
    console.error(`\n[db] ${error.message}\n`);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Without this, nodemon and Ctrl+C leave the process alive on an open
  // handle, and the port stays claimed for the next run.
  const shutdown = (signal) => {
    console.log(`\n${signal} received, shutting down`);
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
