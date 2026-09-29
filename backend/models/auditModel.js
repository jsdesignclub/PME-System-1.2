/**
 * Audit trail.
 *
 * D42 — this module exports `insert` and `list` and NOTHING ELSE. There is no
 * update and no delete, by design: that absence is the whole of the immutability
 * guarantee Phase 1 can actually provide.
 *
 * It is worth being precise about why the database cannot do this instead.
 * database/bootstrap.sql grants pme_user SELECT, INSERT, UPDATE, DELETE,
 * CREATE, ALTER, INDEX, DROP, REFERENCES on pme_system.* — and TRIGGER is not
 * among them. The BEFORE UPDATE / BEFORE DELETE trigger that would make
 * audit_logs immutable in MySQL therefore cannot be created by the application
 * user at all; it needs root or an amended GRANT. Phase 1 declines both, because
 * a migration that fails on a clean clone is worse than an honest boundary.
 * Phase 4 task 4.6 is where the stronger guarantee belongs.
 */
import { pool } from '../config/db.js';

/**
 * Field names whose values must never reach an audit row.
 *
 * D32. An audit trail that stores password hashes is a credential store with a
 * timestamp column and no access control of its own. The filter is applied
 * here, in the serializer, and not at each call site, so a future caller cannot
 * forget it — which is the failure mode that matters, because forgetting at a
 * call site is silent and the row is written anyway.
 */
const REDACTED = new Set(['password_hash', 'password', 'token', 'refresh_token', 'access_token']);

/** Any key that looks like a hash or a token, whatever it is called. */
const REDACTED_PATTERNS = [/hash$/i, /_hash$/i, /token/i, /secret/i, /^password/i];

/**
 * Deep-copy a value for storage, removing secrets.
 *
 * Recursive because a caller that captured a whole request body would bury
 * `password` one level down inside a nested object, and a shallow filter would
 * wave it through. Cycles are handled, because an Express request body in
 * Express 5 can carry a reference back to `req` through a custom property, and
 * an unbounded recursion over one of those is a stack overflow on a
 * write-audit-row code path.
 *
 * @returns the value with secret fields replaced by '[redacted]'
 */
export function redact(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    const isSecret =
      REDACTED.has(key.toLowerCase()) || REDACTED_PATTERNS.some((pattern) => pattern.test(key));
    output[key] = isSecret ? '[redacted]' : redact(item, seen);
  }
  return output;
}

/**
 * Compute the delta between two row states.
 *
 * Only fields that actually changed are included, so a PATCH that sets a field
 * to the value it already held writes no row (Task 1.11) and a delta stays
 * small enough to read.
 *
 * @param {object|null} before
 * @param {object|null} after
 */
export function computeDelta(before, after) {
  const delta = { before: {}, after: {} };
  if (!before || !after) return delta;

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      delta.before[key] = before[key];
      delta.after[key] = after[key];
    }
  }
  return delta;
}

/** Does this delta contain anything that changed? */
export function deltaIsEmpty(delta) {
  return (
    Object.keys(delta.before).length === 0 && Object.keys(delta.after).length === 0
  );
}

/**
 * Write one audit row.
 *
 * D20 — pass the caller's connection to commit the audit row in the same
 * transaction as the change it describes. Omit it only for events that must
 * survive their own request failing: a rejected login, a 403. An audit row that
 * rolls back with the mutation it was recording is the one guarantee an audit
 * trail exists to provide.
 *
 * @param {{userId?: number|null, action: string, entityType: string, entityId?: string|number|null,
 *          delta?: object, ipAddress?: string, userAgent?: string}} entry
 */
export async function insert(entry, executor = pool) {
  const { userId = null, action, entityType, entityId = null, delta = null } = entry;

  const serialised = delta === null ? null : JSON.stringify(redact(delta));

  const [result] = await executor.query(
    `INSERT INTO audit_logs
       (user_id, action, entity_type, entity_id, action_delta, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      action,
      entityType,
      entityId === null || entityId === undefined ? null : String(entityId),
      serialised,
      entry.ipAddress ?? null,
      entry.userAgent ?? null,
    ],
  );

  return result.insertId;
}

/**
 * Paginated, filterable audit query.
 *
 * `action_delta` is not selected here. The list view shows who did what and
 * when; pulling a JSON document per row to render a table of 25 rows is the
 * kind of thing that makes an audit viewer feel slow. Use findById for the
 * detail, or narrow the SELECT to specific JSON paths.
 */
export async function list(
  { userId, entityType, entityId, action, from, to, limit, offset } = {},
  executor = pool,
) {
  const where = [];
  const params = [];

  if (userId) {
    where.push('user_id = ?');
    params.push(userId);
  }
  if (entityType) {
    where.push('entity_type = ?');
    params.push(entityType);
  }
  if (entityId) {
    where.push('entity_id = ?');
    params.push(String(entityId));
  }
  if (action) {
    where.push('action = ?');
    params.push(action);
  }
  if (from) {
    where.push('created_at >= ?');
    params.push(from);
  }
  if (to) {
    where.push('created_at <= ?');
    params.push(to);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await executor.query(
    `SELECT id, user_id, action, entity_type, entity_id, ip_address, user_agent, created_at
       FROM audit_logs ${clause}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const [[{ total }]] = await executor.query(
    `SELECT COUNT(*) AS total FROM audit_logs ${clause}`,
    params,
  );

  return { rows, total };
}

/** One audit row, with action_delta parsed. */
export async function findById(id, executor = pool) {
  const [rows] = await executor.query(
    `SELECT id, user_id, action, entity_type, entity_id, action_delta,
            ip_address, user_agent, created_at
       FROM audit_logs WHERE id = ? LIMIT 1`,
    [id],
  );

  const row = rows[0];
  if (!row) return null;

  // mysql2 returns JSON columns already parsed; a string here means the driver
  // was handed something unexpected, and returning it raw would hand the
  // frontend a string where it expects an object.
  if (typeof row.action_delta === 'string') {
    try {
      row.action_delta = JSON.parse(row.action_delta);
    } catch {
      row.action_delta = null;
    }
  }

  return row;
}
