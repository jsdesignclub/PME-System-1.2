/**
 * Departments. Small, and the FK target for users.department_id.
 *
 * Same executor convention as userModel.js (D19).
 */
import { pool } from '../config/db.js';

const UPDATABLE_COLUMNS = Object.freeze(['name', 'code']);

/** List every department, with a live user count for the admin picker. */
export async function list(executor = pool) {
  const [rows] = await executor.query(
    `SELECT d.id, d.name, d.code, d.created_at,
            COUNT(u.id) AS user_count
       FROM departments d
       LEFT JOIN users u ON u.department_id = d.id
      GROUP BY d.id, d.name, d.code, d.created_at
      ORDER BY d.name`,
  );
  return rows;
}

export async function findById(id, executor = pool) {
  const [rows] = await executor.query(
    'SELECT id, name, code, created_at FROM departments WHERE id = ? LIMIT 1',
    [id],
  );
  return rows[0] ?? null;
}

export async function findByCode(code, executor = pool) {
  const [rows] = await executor.query(
    'SELECT id, name, code, created_at FROM departments WHERE code = ? LIMIT 1',
    [code],
  );
  return rows[0] ?? null;
}

/**
 * Create a department.
 *
 * `code` is UNIQUE under utf8mb4_unicode_ci, so 'SEC' and 'sec' collide and
 * MySQL raises ER_DUP_ENTRY. That is the intended behaviour — a department code
 * is case-insensitively unique — so the controller translates the driver error
 * into a 409 rather than pre-checking with a second query, which would race.
 */
export async function create({ name, code }, executor = pool) {
  const [result] = await executor.query(
    'INSERT INTO departments (name, code) VALUES (?, ?)',
    [name, code],
  );
  return findById(result.insertId, executor);
}

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
  await executor.query(`UPDATE departments SET ${assignments.join(', ')} WHERE id = ?`, params);
  return findById(id, executor);
}

export { UPDATABLE_COLUMNS };
