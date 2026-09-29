#!/usr/bin/env node
/**
 * Migration and seed runner.
 *
 *   node database/migrate.js up       apply pending migrations, in filename order
 *   node database/migrate.js status   show applied vs pending
 *   node database/migrate.js seed     re-runnable seed scripts, in filename order
 *   node database/migrate.js seed 001 only seed files whose name starts "001"
 *
 * Every path is resolved from this file's own location, never from the shell's
 * working directory, so the runner behaves identically whether it is invoked
 * from the repository root, from backend/, or from a scheduled task.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMigrationConnection } from '../backend/config/db.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(moduleDir, 'migrations');
const SEEDS_DIR = path.join(moduleDir, 'seeds');

async function connect() {
  return createMigrationConnection();
}

/** Numeric filename prefixes (001_, 002_) are what make this order stable. */
async function listSqlFiles(dir) {
  const entries = await fs.readdir(dir).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  return entries.filter((name) => name.toLowerCase().endsWith('.sql')).sort();
}

/**
 * Read a .sql file, stripping a UTF-8 byte order mark if present.
 *
 * PowerShell 5.1's `Out-File -Encoding utf8` writes a BOM, and MySQL parses the
 * BOM as part of the first statement â€” producing "error in your SQL syntax ...
 * near '<BOM>CREATE TABLE'". Since this is Windows and these files are authored
 * by hand, tolerating the BOM here is cheaper than explaining that error later.
 */
async function readSql(file) {
  const raw = await fs.readFile(file, 'utf8');
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

async function ensureMigrationsTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function readApplied(connection) {
  const [rows] = await connection.query('SELECT filename FROM schema_migrations');
  return new Set(rows.map((row) => row.filename));
}

async function up(connection) {
  await ensureMigrationsTable(connection);

  const applied = await readApplied(connection);
  const files = await listSqlFiles(MIGRATIONS_DIR);
  let count = 0;

  for (const filename of files) {
    if (applied.has(filename)) {
      console.log(`  skipped  ${filename}`);
      continue;
    }

    const sql = await readSql(path.join(MIGRATIONS_DIR, filename));

    // Each file is its own transaction so one bad migration cannot leave the
    // bookkeeping half-written. Note the honest limit: MySQL auto-commits DDL,
    // so a failure partway through a multi-statement file may leave earlier
    // statements in place. The recovery path is a corrective migration, not a
    // rollback â€” `status` plus a new file.
    await connection.beginTransaction();
    try {
      await connection.query(sql);
      await connection.query('INSERT INTO schema_migrations (filename) VALUES (?)', [filename]);
      await connection.commit();
      console.log(`  applied  ${filename}`);
      count += 1;
    } catch (error) {
      await connection.rollback();
      throw new Error(`${filename} failed: ${error.message}`, { cause: error });
    }
  }

  console.log(count === 0 ? '0 migrations applied (nothing to do)' : `${count} migration(s) applied`);
}

async function status(connection) {
  await ensureMigrationsTable(connection);

  const applied = await readApplied(connection);
  const files = await listSqlFiles(MIGRATIONS_DIR);

  if (files.length === 0) {
    console.log('No migration files found in database/migrations');
  }
  for (const filename of files) {
    console.log(`  ${applied.has(filename) ? 'applied' : 'pending'}  ${filename}`);
  }
  const orphans = [...applied].filter((name) => !files.includes(name));
  for (const filename of orphans) {
    // A file deleted from disk but still recorded. Harmless, but silently so â€”
    // worth surfacing before it hides a genuinely missing migration.
    console.log(`  ORPHANED  ${filename} (recorded as applied, but the file is gone)`);
  }
  console.log(`${files.length - [...applied].filter((n) => files.includes(n)).length} pending, ${files.filter((f) => applied.has(f)).length} applied`);
}

/**
 * Run the seed scripts.
 *
 * @param {import('mysql2/promise').Connection} connection
 * @param {string} [prefix] optional filename prefix filter, e.g. "001"
 *
 * The filter exists for one specific accident. 002_seed_demo_users.sql resets
 * the password of any user whose NIC it recognises, so re-running it after
 * changing a demo account's password quietly throws that change away. With a
 * filter, refreshing the department list without touching anyone's credentials
 * is `node database/migrate.js seed 001`.
 *
 * The match is a plain prefix on the filename, so "001" selects
 * 001_seed_departments.sql and "002_" selects 002_seed_demo_users.sql. An
 * unmatched filter is an error rather than a silent zero-file run: "seed 0015"
 * matching nothing is almost certainly a typo, and silently applying nothing
 * would look like success.
 */
async function seed(connection, prefix) {
  const all = await listSqlFiles(SEEDS_DIR);

  const files = prefix
    ? all.filter((name) => name.startsWith(prefix))
    : all;

  if (prefix && files.length === 0) {
    const available = all.length > 0 ? all.map((n) => `"${n}"`).join(', ') : 'none';
    throw new Error(
      `no seed file matches the filter "${prefix}". Available: ${available}`,
    );
  }

  if (files.length === 0) {
    console.log('0 seeds applied (nothing to do)');
    return;
  }

  let count = 0;
  for (const filename of files) {
    const sql = await readSql(path.join(SEEDS_DIR, filename));
    try {
      await connection.query(sql);
      console.log(`  applied  ${filename}`);
      count += 1;
    } catch (error) {
      throw new Error(`seed ${filename} failed: ${error.message}`, { cause: error });
    }
  }
  console.log(`${count} seed(s) applied`);
}

const COMMANDS = { up, status, seed };

const command = process.argv[2];
const handler = COMMANDS[command];

if (!handler) {
  console.error(`Usage: node database/migrate.js <${Object.keys(COMMANDS).join('|')}>`);
  process.exit(1);
}

const connection = await connect().catch((error) => {
  console.error(`Cannot connect to the database: ${error.message}`);
  process.exit(1);
});

try {
  // argv[3] only means anything to `seed`; the other commands ignore it.
  await handler(connection, process.argv[3]);
} catch (error) {
  console.error(`\n${error.message}`);
  process.exit(1);
} finally {
  await connection.end();
}
