import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

// dotenv is loaded HERE, not only in server.js. ES module bodies are evaluated
// in dependency order before the importing module's body runs, so a top-level
// `process.env.DB_*` read in this file would execute *before* server.js ever
// called dotenv.config() — leaving every value undefined and producing a
// baffling ER_ACCESS_DENIED_ERROR. dotenv never overwrites an already-set
// variable, so calling it from several modules is safe.
dotenv.config({ path: path.resolve(moduleDir, '..', '.env'), quiet: true });

// `UTF8MB4_UNICODE_CI` rather than the shorter `utf8mb4`. mysql2 resolves the
// `charset` option through Charsets[charset.toUpperCase()], and `utf8mb4` is
// an alias for UTF8MB4_**GENERAL**_CI (id 45) — which does not match the
// utf8mb4_unicode_ci that database/bootstrap.sql creates. Naming the collation
// explicitly keeps the connection and the database in agreement, which matters
// for the Sinhala/Tamil comparisons this system will rely on.
const CONNECTION_COLLATION = 'UTF8MB4_UNICODE_CI';

export const connectionOptions = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: CONNECTION_COLLATION,
  // Store and read all dates as UTC. Without this, a server timezone west of
  // UTC silently shifts stored timestamps on the way in and out.
  timezone: 'Z',
  namedPlaceholders: true,
};

export const pool = mysql.createPool({
  ...connectionOptions,
  // Concurrent requests would otherwise serialise on a single connection.
  // 10 is sized for a ministry office, not a data centre.
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
});

/**
 * A single connection with stacked queries enabled, for the migration runner
 * only — migration files are multi-statement by nature.
 *
 * This deliberately does NOT configure the pool. `multipleStatements` on the
 * application pool would turn any single injection point into arbitrary
 * DROP/GRANT, so the application must keep exactly one statement per query.
 * Keeping the flag in this one factory means it cannot be switched on by
 * accident somewhere else.
 *
 * It lives here rather than in database/migrate.js so that `mysql2` is still
 * imported from inside backend/, where node_modules resolves.
 */
export function createMigrationConnection() {
  return mysql.createConnection({ ...connectionOptions, multipleStatements: true });
}

/**
 * Proves the pool can reach MySQL. Throws on failure with a message that names
 * the likely cause — an opaque "Access denied" is the single most common
 * source of confusion in this stack, and the fix is almost never what the raw
 * driver message implies.
 */
export async function testConnection() {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.query('SELECT 1');
    return true;
  } catch (error) {
    throw new Error(explainConnectionFailure(error), { cause: error });
  } finally {
    connection?.release();
  }
}

function explainConnectionFailure(error) {
  const target = `${process.env.DB_USER}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

  switch (error.code) {
    case 'ER_ACCESS_DENIED_ERROR':
      return (
        `Cannot authenticate as ${target}.\n` +
        `  - DB_USER/DB_PASSWORD in backend/.env must match the CREATE USER in database/bootstrap.sql\n` +
        `  - BOTH host rows are required: 'pme_user'@'localhost' AND 'pme_user'@'127.0.0.1'\n` +
        `  - MySQL auth is exact — no trimming, check for a trailing space`
      );
    case 'ER_BAD_DB_ERROR':
      return (
        `Connected to MySQL, but database '${process.env.DB_NAME}' does not exist.\n` +
        `  - Run database/bootstrap.sql as root (see README)`
      );
    case 'ECONNREFUSED':
      return (
        `Nothing is listening on ${process.env.DB_HOST}:${process.env.DB_PORT}.\n` +
        `  - Start the database:  Start-Service MySQL80\n` +
        `  - Confirm the port owner:  Get-NetTCPConnection -LocalPort 3306 -State Listen`
      );
    case 'ER_NOT_SUPPORTED_AUTH_MODE':
      return (
        `The account uses an authentication plugin this server cannot speak.\n` +
        `  - Fix:  ALTER USER '${process.env.DB_USER}'@'127.0.0.1' IDENTIFIED WITH caching_sha2_password BY '<password>';`
      );
    default:
      return `Database connection to ${target} failed: ${error.code || error.message}`;
  }
}
