#!/usr/bin/env node
/**
 * Read-only reachability probe for the local MySQL server. Reports; changes
 * nothing.
 *
 * This project does NOT start MySQL. The database is a pre-existing Windows
 * service (`MySQL80`), not a child process, so `npm run dev` neither starts nor
 * stops it — a Ctrl+C must never take the developer's database down with it.
 * What this script can honestly do is tell you the DB state and get out of the
 * way.
 */
import { pool, testConnection } from '../backend/config/db.js';

const target = `${process.env.DB_USER}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

console.log(`Probing ${target} ...`);

try {
  await testConnection();
  const [[row]] = await pool.query(
    'SELECT VERSION() AS version, @@character_set_database AS charset, @@collation_database AS collation',
  );

  console.log(`  reachable   yes`);
  console.log(`  version     ${row.version}`);
  console.log(`  charset     ${row.charset}`);
  console.log(`  collation   ${row.collation}`);

  if (row.charset !== 'utf8mb4') {
    console.warn(
      `\n  WARNING: expected charset utf8mb4, found ${row.charset}.\n` +
        `  Re-run database/bootstrap.sql as root, or check SHOW VARIABLES LIKE 'character_set_server'.`,
    );
  }

  console.log(`\nThe database is ready. Start the app with: npm run dev`);
  await pool.end();
  process.exit(0);
} catch (error) {
  console.error(`\n  reachable   no\n  ${error.message}\n`);
  console.error(`The database is not usable. Start it with:  Start-Service MySQL80`);
  await pool.end().catch(() => {});
  process.exit(1);
}
