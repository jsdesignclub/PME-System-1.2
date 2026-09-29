/**
 * Refresh tokens. The only module that knows tokens are stored as SHA-256
 * hashes and never in plaintext (Task 1.3).
 *
 * Both properties matter:
 *  - a database leak must not hand over 14 days of live sessions
 *  - SHA-256 (not bcrypt) is correct here because this is a high-entropy
 *    random token looked up by equality, not a low-entropy secret being
 *    brute-forced
 */
import { createHash } from 'node:crypto';

import { pool } from '../config/db.js';

export const SELECT_COLUMNS = `
  id, user_id, token_hash, replaced_by_hash, issued_at, expires_at,
  revoked_at, ip_address, user_agent
`;

/**
 * Hash a refresh token for storage and lookup.
 * @param {string} token
 * @returns {string} 64 hex characters
 */
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Store a new refresh token.
 *
 * @param {{userId: number, token: string, expiresAt: Date, ipAddress?: string, userAgent?: string}} args
 */
export async function insert({ userId, token, expiresAt, ipAddress, userAgent }, executor = pool) {
  const [result] = await executor.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, hashToken(token), expiresAt, ipAddress ?? null, userAgent ?? null],
  );
  return result.insertId;
}

/**
 * Look up a token by its plaintext value.
 *
 * Returns revoked and expired rows too, deliberately: the caller has to be able
 * to distinguish "no such token" from "this token was already used" in order
 * to detect reuse, and a query that filtered them out would collapse the two.
 */
export async function findByToken(token, executor = pool) {
  const [rows] = await executor.query(
    `SELECT ${SELECT_COLUMNS} FROM refresh_tokens WHERE token_hash = ? LIMIT 1`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

/**
 * Revoke a token, recording what replaced it.
 *
 * `replaced_by_hash` is what makes the rotation chain traversable, which is in
 * turn what makes reuse of an already-rotated token detectable rather than
 * merely expired.
 */
export async function revoke(tokenHash, replacedByHash = null, executor = pool) {
  const [result] = await executor.query(
    `UPDATE refresh_tokens
        SET revoked_at = NOW(), replaced_by_hash = ?
      WHERE token_hash = ? AND revoked_at IS NULL`,
    [replacedByHash, tokenHash],
  );
  return result.affectedRows > 0;
}

/** Revoke every live token for a user. Phase 4's "sign out everywhere". */
export async function revokeAllForUser(userId, executor = pool) {
  const [result] = await executor.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
    [userId],
  );
  return result.affectedRows;
}

/**
 * Delete tokens that expired more than a day ago.
 *
 * Runs on each login. The day of slack is so that an audit of "was this token
 * still theoretically valid" is not destroyed the moment it expires, and
 * idx_refresh_expires keeps the scan cheap.
 */
export async function purgeExpired(executor = pool) {
  const [result] = await executor.query(
    'DELETE FROM refresh_tokens WHERE expires_at < (NOW() - INTERVAL 1 DAY)',
  );
  return result.affectedRows;
}
