#!/usr/bin/env node
/**
 * Put the database back into a presentable demo state.
 *
 *   node database/demo-reset.js          reset, then re-seed
 *   node database/demo-reset.js --dry    show what would be deleted, delete nothing
 *
 * ============================== WHY THIS EXISTS ==============================
 *
 * The test suite and the demo share ONE database. That is deliberate during
 * development — the tests are integration tests and need real tables — but it
 * has a consequence that only shows up in front of an audience: after a test
 * run the registry holds thirty-odd letters with subjects like
 * "Urgent tenderboard_t_4123_1_a91f02 for laboratory apparatus", created by
 * accounts called "Test t_4123_1_a91f02", and the officer list shows officers
 * nobody has ever heard of.
 *
 * So a demo is not a state this project can reach by seeding. It is a state
 * that has to be re-established after every test run, which is exactly what
 * this script is. Run it immediately before a demonstration.
 *
 * ============================== WHAT IT TOUCHES =============================
 *
 * Every table the mail module owns, plus the users the tests created. Nothing
 * else: departments, the nine demo personas and the migration bookkeeping are
 * left exactly as they are, and the demo seeds run afterwards to put the six
 * letters and the duty charts back.
 *
 * Deleting is by foreign key order and never by guessing. Children first, then
 * the parents they point at — an FK that is RESTRICT (author_user_id,
 * created_by_user_id, uploaded_by) refuses the delete rather than cascading,
 * which is the control the schema was designed around and is not something this
 * script should route around.
 */
import { createMigrationConnection } from '../backend/config/db.js';

/** The nine seeded personas. Anything else in `users` is a test leftover. */
const DEMO_NICS = [
  '881234560V', '881234561V', '881234562V', '881234563V', '881234564V',
  '881234565V', '881234566V', '881234567V', '881234568V',
];

const dryRun = process.argv.includes('--dry');

/**
 * Statements in foreign-key order. `children first` is not a stylistic note:
 * `mail_records` cascades to `official_minutes` and `mail_attachments`, so
 * deleting it first removes most of the graph in one statement, but
 * `audit_logs` and `refresh_tokens` do NOT cascade and must be cleared
 * explicitly before any `users` row can go.
 */
const CLEANUP = [
  // `OFFICE_MINUTES`/`OFFICE_ATTACHMENTS` cascade from here.
  ['mail_records', 'DELETE FROM mail_records', 'SELECT COUNT(*) AS n FROM mail_records'],
  // No cascade either way — an audit row outlives the letter by design.
  ['audit_logs', 'DELETE FROM audit_logs', 'SELECT COUNT(*) AS n FROM audit_logs'],
  // CASCADEs from officer_duties, but named so the count is visible.
  ['officer_duties', 'DELETE FROM officer_duties', 'SELECT COUNT(*) AS n FROM officer_duties'],
  ['refresh_tokens', 'DELETE FROM refresh_tokens', 'SELECT COUNT(*) AS n FROM refresh_tokens'],
  // Placeholders, so the count reads as one number rather than eight rows.
  [
    'users (test leftovers)',
    `DELETE FROM users WHERE nic_no NOT IN (${DEMO_NICS.map(() => '?').join(', ')})`,
    `SELECT COUNT(*) AS n FROM users WHERE nic_no NOT IN (${DEMO_NICS.map(() => '?').join(', ')})`,
  ],
];

// The counter is reset rather than left where the tests pushed it. A demo that
// opens on DS/2026/09/0412 because four hundred test letters were logged looks
// like a system that has been running for two years.
const RESET_COUNTER = `UPDATE day_stamp_counters SET last_seq = 0`;

async function main() {
  const connection = await createMigrationConnection();

  try {
    console.log(dryRun ? 'DRY RUN — counting only, nothing will be deleted\n' : '');

    for (const [label, deleteSql, countSql] of CLEANUP) {
      // A dry run that runs the DELETE it is reporting on is not a dry run. The
      // count is a separate SELECT, so `--dry` cannot destroy the database it
      // was asked to inspect — and the flag is the only thing standing between a
      // cautious question and a wiped demo.
      const sql = dryRun ? countSql : deleteSql;
      const [rows] = await connection.query(sql, DEMO_NICS);

      const affected = dryRun
        ? (rows?.[0]?.n ?? 0)
        : (rows?.affectedRows ?? 0);

      console.log(`  ${String(affected).padStart(5)}  ${label}${dryRun ? ' (would delete)' : ''}`);
    }

    if (dryRun) {
      console.log('\nRe-run without --dry to reset and re-seed.');
      return;
    }

    // The counter is only reset once the letters are gone, so a failure partway
    // through leaves a counter that is too HIGH rather than one that would mint
    // a stamp already on the table. Too high wastes numbers; too low duplicates
    // a day stamp, and a duplicate day stamp on a legal registry is not a
    // cosmetic problem.
    await connection.query(RESET_COUNTER);
    console.log('  reset  day_stamp_counters');

    console.log('\nRe-seeding demo data…');
  } finally {
    await connection.end();
  }
}

await main();

// The seeds are run through the same runner the npm scripts use, so there is
// one definition of "seeded" rather than a copy of it here.
if (!dryRun) {
  process.argv = [process.argv[0], process.argv[1], 'seed'];
  await import('./migrate.js');
}
