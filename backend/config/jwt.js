// Phase 0 held constants only. Phase 1 adds the signing/verification helpers —
// the first phase with an actual token to sign.
//
// Kept separate from server.js so that auth concerns have one home, and so
// Phase 1 can add behaviour here without touching the bootstrap path.
import { randomUUID } from 'node:crypto';

import jwt from 'jsonwebtoken';

/**
 * Read and validate JWT configuration. Called by server.js at startup so a
 * missing or placeholder secret fails loudly instead of silently signing
 * tokens that anybody can forge.
 *
 * @throws {Error} if the secret is absent or still a `.env.example` placeholder
 */
export function getJwtConfig() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is not set. Copy backend/.env.example to backend/.env and fill it in.');
  }
  if (secret === 'change-me') {
    throw new Error('JWT_SECRET is still the .env.example placeholder. Generate a real one: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  }

  return {
    secret,
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '14d',
  };
}

// ============================================================================
// Phase 1 — token signing and verification
// ============================================================================

/** Token discriminators. Both types share JWT_SECRET and differ by this claim. */
export const ACCESS = 'access';
export const REFRESH = 'refresh';

/**
 * Sign a short-lived access token.
 *
 * D21 — the payload is deliberately minimal: { sub, role, type }.
 *
 * `department_id` is NOT included, and neither are permissions. Anything
 * time-varying in a token is stale from the moment it is minted, and a
 * two-hour-old `department_id` silently mis-scopes every authorization
 * decision made with it. authMiddleware reloads the user row on each request
 * instead, which also makes deactivation take effect immediately rather than
 * when the token happens to expire.
 *
 * `role` is carried only as a display convenience for logs; authorization
 * reads the role off the freshly loaded row, not off this claim.
 *
 * @param {{id: number, role: string}} user
 * @returns {string}
 */
export function signAccessToken(user) {
  const { secret, expiresIn } = getJwtConfig();
  return jwt.sign({ role: user.role, type: ACCESS }, secret, {
    subject: String(user.id),
    expiresIn,
  });
}

/**
 * Sign a long-lived refresh token.
 *
 * Carries no role and no department: nothing in the refresh flow makes an
 * authorization decision, and a role baked into a 14-day token is a role that
 * can be wrong for 14 days.
 *
 * `jti` is required, and it is not decoration. Without it, two tokens minted
 * for the same user in the same second are byte-identical: `iat` has one-second
 * resolution, and every other claim is derived from the same user and the same
 * lifetime. That breaks rotation in the single most common case -- a client
 * that logs in and then refreshes immediately -- because the "new" token
 * hashes to the same value as the old one and violates
 * `uq_refresh_token_hash`. The rotation would return a 500 instead of a token.
 *
 * A random `jti` (RFC 7519 4.1.7) makes each issuance distinct. It is read by
 * nothing: rotation is tracked by the revoked row in the database, not by
 * comparing jti values, and verifyToken deliberately ignores it.
 *
 * @param {{id: number}} user
 * @returns {string}
 */
export function signRefreshToken(user) {
  const { secret, refreshExpiresIn } = getJwtConfig();
  return jwt.sign({ type: REFRESH, jti: randomUUID() }, secret, {
    subject: String(user.id),
    expiresIn: refreshExpiresIn,
  });
}

/**
 * Verify a token and require a specific type.
 *
 * D22 — the expected type is a required argument, not an option, so a caller
 * cannot forget to check it. This is what stops a refresh token being accepted
 * as a Bearer credential: the type claim is compared here, in one place, and
 * the token type is never inferred by the caller.
 *
 * Throws on: bad signature, expired, malformed, or wrong `type`.
 *
 * @param {string} token
 * @param {string} expectedType one of ACCESS | REFRESH
 * @returns {{sub: string, role?: string, type: string, iat: number, exp: number}}
 */
export function verifyToken(token, expectedType) {
  const { secret } = getJwtConfig();
  const payload = jwt.verify(token, secret);

  if (payload.type !== expectedType) {
    // A distinct message from jwt's own: "invalid signature" when the token is
    // perfectly valid but the wrong kind is a much more actionable log line.
    const error = new Error(`Expected a ${expectedType} token but received a ${payload.type ?? 'typeless'} token`);
    error.code = 'ETOKENTYPE';
    throw error;
  }

  return payload;
}
