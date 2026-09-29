/**
 * Bootstrap. Starts the server; builds nothing.
 *
 * D18 — this file used to contain the whole Express app, which meant importing
 * it started a listening socket. That made it impossible for the test suite to
 * import the app without also standing up a server on port 4000. The app now
 * lives in app.js and is exported from there; this file only does the things
 * that must happen once, in production, and never in a test:
 *
 *   - validate configuration and fail loudly if it is incomplete
 *   - prove the database is reachable before accepting traffic
 *   - listen, and shut down cleanly on a signal
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import app from './app.js';
import { pool, testConnection } from './config/db.js';
import { getJwtConfig } from './config/jwt.js';

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
