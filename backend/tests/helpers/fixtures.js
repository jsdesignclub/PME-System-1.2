/**
 * Test fixtures.
 *
 * Every row created by a test is namespaced with a per-process suffix and
 * removed in after(). Two reasons, both learned the hard way:
 *
 *  - the eight seeded demo personas must survive a test run untouched. A suite
 *    that mutates the demo data turns the next `npm run seed` into a debugging
 *    session.
 *  - tests that share a fixed NIC collide with each other and with whatever the
 *    developer already has in their local database.
 */
import { randomBytes } from 'node:crypto';

import { pool } from '../../config/db.js';
import { create as createUserModel, findByNic } from '../../models/userModel.js';
import { request } from './app.js';

/** Unique per process AND per call, so parallel-ish tests cannot collide. */
let counter = 0;
export function unique(prefix = 't') {
  counter += 1;
  return `${prefix}_${process.pid}_${counter}_${randomBytes(3).toString('hex')}`;
}

/** A syntactically valid, definitely-unassigned NIC. */
export function testNic() {
  return `90${randomBytes(5).toString('hex').toUpperCase()}V`;
}

/**
 * Create a user directly through the model, bypassing the API.
 *
 * Tests that need a user to exist but are not themselves testing user creation
 * should not spend 300 ms of bcrypt plus a round trip on the setup.
 */
export async function createUser(overrides = {}) {
  const nic = overrides.nic_no ?? testNic();
  const password = overrides.password ?? 'TestPass@1234';

  const user = await createUserModel({
    nic_no: nic,
    full_name: overrides.full_name ?? `Test ${unique()}`,
    email: overrides.email ?? `${unique()}@example.test`,
    password,
    role: overrides.role ?? 'MINOR_STAFF',
    department_id: overrides.department_id ?? null,
    designation: overrides.designation ?? 'Tester',
    section_name: overrides.section_name ?? null,
  });

  createdNics.add(nic);
  return { user, password };
}

/** Log in and return the parsed body. Throws on a non-200, unlike `request`. */
export async function login(baseUrl, nic, password) {
  const { status, body } = await request(baseUrl, 'POST', '/api/v1/auth/login', {
    body: { nic_no: nic, password },
  });

  if (status !== 200) {
    throw new Error(`login failed for ${nic}: ${status} ${JSON.stringify(body)}`);
  }

  return body;
}

/** Create a user and log in as them in one step. */
export async function createAndLogin(baseUrl, overrides = {}) {
  const { user, password } = await createUser(overrides);
  const session = await login(baseUrl, user.nic_no, password);
  return { user, password, ...session };
}

/**
 * Every NIC this process created, registered automatically.
 *
 * Earlier versions had each test file push NICs into a local array for
 * `after()` to delete, and it leaked: three call sites created a user and
 * forgot to track it, and the orphans accumulated in the developer's database
 * across runs. One of them was a seeded demo persona that a crashed run had
 * left deactivated, which then failed an acceptance check.
 *
 * A registry the fixture populates itself removes the opportunity to forget.
 */
const createdNics = new Set();

/**
 * Remove every user created by this process, plus their refresh tokens.
 *
 * Safe to call more than once. Deletes in one statement so a test that created
 * a user mid-flight cannot half-survive teardown.
 *
 * The seeded personas are never touched: they were not created here, so they
 * are not in the registry. That is the property the plan asks for -- a test
 * suite that mutates demo data turns the next `npm run seed` into a debugging
 * session.
 */
export async function cleanup() {
  if (createdNics.size === 0) return;

  const nics = [...createdNics];
  createdNics.clear();

  const placeholders = nics.map(() => '?').join(', ');
  // refresh_tokens cascades from users; audit_logs has no FK on user_id (an
  // audit row must outlive the account that caused it) and is left alone, since
  // it records ids that no longer resolve anyway.
  await pool.query(`DELETE FROM users WHERE nic_no IN (${placeholders})`, nics);
}

/**
 * Register a NIC that was created through the API rather than the model.
 *
 * POST /api/v1/users goes through the controller, not createUser, so the
 * registry above cannot see it. Without this, every test that creates a user the
 * HTTP way leaks a row -- the earlier suite did exactly that and left 77 orphans
 * in the database.
 *
 * @param {string|number} nic
 */
export function track(nic) {
  if (nic !== undefined && nic !== null) createdNics.add(nic);
  return nic;
}

/** Delete audit rows for a set of users, for tests that assert on counts. */
export async function clearAuditFor(nics) {
  if (nics.length === 0) return;
  const placeholders = nics.map(() => '?').join(', ');
  await pool.query(
    `DELETE FROM audit_logs WHERE entity_id IN (SELECT id FROM users WHERE nic_no IN (${placeholders}))`,
    nics,
  );
}

/** Deactivate a user by direct SQL, for tests that must not go through the API. */
export async function setActive(nic, active) {
  await pool.query('UPDATE users SET is_active = ? WHERE nic_no = ?', [active, nic]);
  return findByNic(nic);
}
