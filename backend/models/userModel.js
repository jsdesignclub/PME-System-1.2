/**
 * Every SQL statement touching `users`. All parameterized, no string
 * concatenation of caller input anywhere.
 *
 * D19 — every function takes an optional trailing `executor` that defaults to
 * the pool. That is what lets a controller open a transaction and thread one
 * connection through several calls, which is how an audit row and the change
 * it describes commit together (D20). Without it, an audited mutation would
 * have to guess which connection its audit insert lands on, and the guarantee
 * would be unenforceable.
 *
 * The alternative — a model that always uses the pool — makes transactional
 * auditing impossible and is the single decision most expensive to reverse
 * later.
 */
import { pool } from '../config/db.js';
import { hashPassword } from '../utils/password.js';

/**
 * Columns safe to return to a caller. `password_hash` is absent by
 * construction rather than stripped in a serializer: a `SELECT *` typed by
 * someone in a hurry is the realistic way this leaks, and omitting the column
 * means that mistake has nothing to leak.
 */
const PUBLIC_COLUMNS = `
  u.id, u.nic_no, u.full_name, u.email, u.role, u.department_id,
  u.designation, u.section_name, u.is_active, u.created_at, u.updated_at,
  d.name AS department_name, d.code AS department_code
`;

/** The same, plus the hash. Only the credential-checking path may use this. */
const CREDENTIAL_COLUMNS = `
  u.id, u.nic_no, u.full_name, u.email, u.password_hash, u.role, u.department_id,
  u.designation, u.section_name, u.is_active, u.created_at, u.updated_at,
  d.name AS department_name, d.code AS department_code
`;

/** Columns a PATCH is allowed to write. Never derived from the request body. */
const UPDATABLE_COLUMNS = Object.freeze([
  'full_name',
  'email',
  'role',
  'department_id',
  'designation',
  'section_name',
  'is_active',
]);

/**
 * Find a user by NIC, including inactive ones.
 *
 * Inactive users are returned on purpose: the login path has to be able to
 * distinguish "wrong password" from "correct password, deactivated account"
 * (D29), and it cannot do that if the lookup filters them out.
 *
 * @param {string} nic
 * @param {import('mysql2/promise').PoolConnection|import('mysql2/promise').Pool} [executor]
 */
export async function findByNic(nic, executor = pool) {
  const [rows] = await executor.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.nic_no = ?
      LIMIT 1`,
    [nic],
  );
  return rows[0] ?? null;
}

/**
 * Find a user by NIC *including the password hash*, for credential checking.
 *
 * Deliberately a separate function with a name that is greppable and obviously
 * about credentials. A single `findByNic({ withHash: true })` flag would make
 * the dangerous call site invisible in review; this makes it a word you have to
 * type. It should appear in exactly two places: the login and refresh paths in
 * authController.js.
 *
 * Inactive users are returned, as in findByNic: login has to distinguish "wrong
 * password" from "correct password, deactivated account" (D29).
 *
 * @param {string} nic
 * @param {import('mysql2/promise').PoolConnection|import('mysql2/promise').Pool} [executor]
 */
export async function findByCredentials(nic, executor = pool) {
  const [rows] = await executor.query(
    `SELECT ${CREDENTIAL_COLUMNS} FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.nic_no = ?
      LIMIT 1`,
    [nic],
  );
  return rows[0] ?? null;
}

/**
 * Find a user by id. This is the query authMiddleware runs on every request
 * (D21), so it is a primary-key lookup and nothing more.
 */
export async function findById(id, executor = pool) {
  const [rows] = await executor.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.id = ?
      LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Paginated user list.
 *
 * `search` is matched with LIKE CONCAT('%', ?, '%') so the wildcards live in
 * the parameter, never in the SQL text. A leading % cannot use an index —
 * acceptable for a few hundred ministry users, and noted rather than
 * prematurely optimised.
 */
export async function list({ role, departmentId, isActive, search, limit, offset } = {}, executor = pool) {
  const where = [];
  const params = [];

  if (role) {
    where.push('u.role = ?');
    params.push(role);
  }
  if (departmentId) {
    where.push('u.department_id = ?');
    params.push(departmentId);
  }
  if (isActive !== undefined) {
    where.push('u.is_active = ?');
    params.push(isActive);
  }
  if (search) {
    where.push('(u.full_name LIKE CONCAT(\'%\', ?, \'%\') OR u.nic_no LIKE CONCAT(\'%\', ?, \'%\'))');
    params.push(search, search);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await executor.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       ${clause}
      ORDER BY u.full_name
      LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const [[{ total }]] = await executor.query(
    `SELECT COUNT(*) AS total FROM users u ${clause}`,
    params,
  );

  return { rows, total };
}

/**
 * Create a user. The password is hashed here, not by the caller.
 *
 * A caller that hashes and a caller that does not is one forgotten call site
 * away from storing a plaintext password in a VARCHAR(255) that accepts it
 * without complaint.
 */
export async function create(user, executor = pool) {
  const passwordHash = await hashPassword(user.password);

  const [result] = await executor.query(
    `INSERT INTO users
       (nic_no, full_name, email, password_hash, role, department_id, designation, section_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.nic_no,
      user.full_name,
      user.email,
      passwordHash,
      user.role,
      user.department_id ?? null,
      user.designation,
      user.section_name ?? null,
    ],
  );

  return findById(result.insertId, executor);
}

/**
 * Apply a partial update.
 *
 * The SET clause is built from UPDATABLE_COLUMNS intersected with the keys the
 * caller actually supplied — never from Object.keys(patch). Deriving it from
 * the patch means a request body containing `id` or `is_active` rewrites them,
 * which is a privilege-escalation bug wearing a data-entry costume.
 *
 * @param {number} id
 * @param {Record<string, unknown>} patch
 */
export async function update(id, patch, executor = pool) {
  const assignments = [];
  const params = [];

  for (const column of UPDATABLE_COLUMNS) {
    if (Object.hasOwn(patch, column)) {
      assignments.push(`${column} = ?`);
      params.push(patch[column]);
    }
  }

  if (assignments.length === 0) return findById(id, executor);

  params.push(id);
  await executor.query(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`, params);

  return findById(id, executor);
}

/**
 * Deactivate. This is what DELETE /users/:id does (D23).
 *
 * There is no hard delete. `mail_records.created_by_user_id` and
 * `official_minutes.author_user_id` both reference users(id) with RESTRICT, so
 * deleting a user who ever logged a letter would fail with
 * ER_ROW_IS_REFERENCED_2 — and deleting one who did not would erase their name
 * from every audit row that mentions them.
 *
 * Returns false when the row was already inactive, so the caller can tell a
 * no-op from a change.
 */
export async function deactivate(id, executor = pool) {
  const [result] = await executor.query(
    'UPDATE users SET is_active = FALSE WHERE id = ? AND is_active = TRUE',
    [id],
  );
  return result.affectedRows > 0;
}

/**
 * Count active admins, locking the rows that decide the answer.
 *
 * D24 — "is there another active admin?" followed by an update is a TOCTOU
 * race: two concurrent deactivations both observe one admin, both proceed, and
 * the system is left with no administrator and no way back in through the UI.
 * FOR UPDATE serialises the two transactions so the second one sees the
 * first one's committed result.
 *
 * MUST be called inside a transaction. On the bare pool it would take and
 * immediately release the lock, which is worse than not locking at all,
 * because it looks like it is doing the right thing.
 *
 * @param {number} excludingId the admin being deactivated, not counted
 */
export async function countActiveAdminsExcluding(excludingId, executor) {
  if (!executor || typeof executor.beginTransaction !== 'function') {
    throw new Error('countActiveAdminsExcluding must be called inside a transaction (D24)');
  }

  const [rows] = await executor.query(
    `SELECT id FROM users
      WHERE role = 'ADMIN' AND is_active = TRUE
      FOR UPDATE`,
  );

  return rows.filter((row) => row.id !== excludingId).length;
}

export { UPDATABLE_COLUMNS };
