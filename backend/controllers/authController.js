/**
 * Session lifecycle: login, refresh, logout, profile, permissions.
 *
 * The ordering inside `login` is the security property, not an incidental
 * detail. Each step is commented with what it would cost to move.
 */
import { REFRESH, signAccessToken, signRefreshToken, verifyToken } from '../config/jwt.js';
import { insert as insertRefreshToken, findByToken, hashToken, purgeExpired, revoke } from '../models/refreshTokenModel.js';
import { findById, findByCredentials } from '../models/userModel.js';
import { insert as insertAudit } from '../models/auditModel.js';
import { dummyVerify, verifyPassword } from '../utils/password.js';
import { resolvePermissions } from '../utils/permissions.js';
import { withTransaction } from '../utils/transaction.js';
import { normalizeNic, rejectUnknownFields, requirePassword, requireString } from '../utils/validate.js';

/**
 * D29 — one constant, used by every rejected-credentials path.
 *
 * An unknown NIC and a wrong password must be indistinguishable, byte for byte.
 * A differing status code, a differing message, or an extra field in the body
 * is a working account-enumeration oracle even though neither response reveals
 * anything on its own.
 */
const INVALID_CREDENTIALS = 'Invalid NIC number or password';

/** 401 with the shared body. */
/**
 * The refresh path's failure. Distinct from rejectCredentials on purpose.
 *
 * "Invalid NIC number or password" is the right answer to a login attempt and
 * the wrong answer here: a refresh sends no NIC and no password, so that
 * message tells the caller they got the endpoint wrong, sends them back to the
 * login form, and hides a revoked token behind what reads like a typo.
 *
 * All four refresh failures below share this one message for the same reason
 * login's do: distinguishing "unknown token" from "already rotated" from
 * "expired" is a free oracle for someone holding a stolen refresh token.
 */
function rejectRefreshToken() {
  const error = new Error('Invalid or expired refresh token');
  error.status = 401;
  error.code = 'EINVALIDREFRESH';
  return error;
}

function rejectCredentials() {
  const error = new Error(INVALID_CREDENTIALS);
  error.status = 401;
  error.code = 'EINVALIDCREDENTIALS';
  return error;
}

/** Build the user object the API returns. Mirrors spec §7.1's shape. */
function publicUser(user) {
  return {
    id: user.id,
    full_name: user.full_name,
    role: user.role,
    designation: user.designation,
    department_id: user.department_id,
    department_name: user.department_name ?? null,
    section_name: user.section_name ?? null,
  };
}

/**
 * POST /api/v1/auth/login
 *
 * Ten steps, in this order:
 *
 *  1. validate the body
 *  2. normalise the NIC (trim, collapse whitespace, uppercase)
 *  3. look the user up, inactive users included
 *  4. no user  -> burn a bcrypt comparison, audit, 401
 *  5. compare the password
 *  6. wrong    -> audit, 401 with the *same* body as step 4
 *  7. inactive -> audit, 403 (safe: the password was already correct)
 *  8. purge expired refresh tokens
 *  9. sign both tokens, store the refresh hash
 * 10. audit the success, respond
 *
 * Step 4 is the one that is easy to skip and the one that matters most: without
 * it, "no such user" returns in about a millisecond while "wrong password"
 * takes three hundred, and that difference enumerates accounts exactly as
 * effectively as a different error message would.
 */
export async function login(req, res) {
  rejectUnknownFields(req.body, ['nic_no', 'password']);

  const nic = normalizeNic(req.body?.nic_no);
  const password = requirePassword(req.body?.password);

  // The credential lookup, the one place in the codebase that is allowed to
  // read password_hash. See the note on findByCredentials in userModel.js.
  const user = await findByCredentials(nic);

  // Step 4: no such user. Equalise the timing, then fail identically to a
  // wrong password.
  if (!user) {
    await dummyVerify();
    await recordLoginFailure(req, nic, 'LOGIN_FAILED_UNKNOWN_NIC');
    throw rejectCredentials();
  }

  // Steps 5-6.
  if (!(await verifyPassword(password, user.password_hash))) {
    await recordLoginFailure(req, nic, 'LOGIN_FAILED_BAD_PASSWORD', user.id);
    throw rejectCredentials();
  }

  // Step 7. Reachable only with a correct password, so naming the reason
  // discloses nothing an attacker did not already have, and a legitimate user
  // locked out of the system needs to be told why.
  if (!user.is_active) {
    await recordLoginFailure(req, nic, 'LOGIN_BLOCKED_INACTIVE', user.id);
    const error = new Error('This account has been deactivated. Contact an administrator.');
    error.status = 403;
    error.code = 'EACCOUNTDISABLED';
    throw error;
  }

  // Step 8. Housekeeping on a path that is already paying a bcrypt comparison,
  // so it is free in practice, and indexed so it stays cheap.
  await purgeExpired();

  // Steps 9-10. The refresh token row and its audit row commit together (D20).
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  await withTransaction(async (tx) => {
    await insertRefreshToken(
      {
        userId: user.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + refreshLifetimeMs()),
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      },
      tx,
    );

    await insertAudit(
      {
        userId: user.id,
        action: 'LOGIN_SUCCESS',
        entityType: 'auth',
        entityId: user.id,
        delta: { nic_no: user.nic_no, role: user.role },
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      },
      tx,
    );
  });

  res.status(200).json({
    success: true,
    // spec §7.1's field. Kept.
    token: accessToken,
    // D39 — the spec's response has no room for a refresh token, but task 1.4
    // requires a refresh endpoint, and without this the client cannot use it.
    // The spec's shape is preserved as a subset.
    refresh_token: refreshToken,
    user: publicUser(user),
  });
}

/**
 * GET /api/v1/auth/me
 *
 * The user object here came off the database in authenticate, not out of the
 * token (D21) — so a role change made a minute ago is reflected now.
 */
export function me(req, res) {
  res.status(200).json({
    success: true,
    user: req.user,
    permissions: resolvePermissions(req.user.role),
  });
}

/**
 * GET /api/v1/auth/permissions
 *
 * D25 — the frontend consumes the permission map over HTTP rather than
 * importing backend/utils/permissions.js across a package boundary. A
 * permission change therefore needs no frontend rebuild.
 */
export function permissions(req, res) {
  res.status(200).json({
    success: true,
    role: req.user.role,
    permissions: resolvePermissions(req.user.role),
  });
}

/**
 * POST /api/v1/auth/refresh
 *
 * Rotation: the presented token is revoked and linked to its replacement in
 * the same transaction that stores the new one. A revoked token presented a
 * second time is rejected, which is what makes a stolen-and-then-used refresh
 * token detectable rather than merely expired.
 */
export async function refresh(req, res) {
  rejectUnknownFields(req.body, ['refresh_token']);

  const token = requireString(req.body?.refresh_token, 'refresh_token');

  const stored = await findByToken(token);

  if (!stored) throw rejectRefreshToken();

  // A token that exists but was already rotated or revoked. The generic 401 is
  // deliberate: telling a caller "this was already used" is a useful signal to
  // an attacker holding a stolen token, and useless to a legitimate client,
  // which would only encounter it through a bug.
  if (stored.revoked_at) throw rejectRefreshToken();

  if (new Date(stored.expires_at) <= new Date()) throw rejectRefreshToken();

  const payload = verifyToken(token, REFRESH);

  // The row is the source of truth, but a signature that does not match the
  // stored user means the database and the token have diverged — refuse it
  // rather than issuing a session for whoever the row names.
  if (Number(payload.sub) !== stored.user_id) throw rejectRefreshToken();

  // The user may have been deactivated since the token was issued. D21's
  // promise is that this takes effect immediately, and a refresh is a new
  // session being minted.
  const user = await findById(stored.user_id);
  if (!user) throw rejectRefreshToken();

  if (!user.is_active) {
    // 401, not the 403 that login uses for the same condition. The difference
    // is not about secrecy -- anyone reaching this point is holding a valid
    // refresh token and already knows which account it belongs to. It is about
    // giving the client one rule instead of two: every 401 from an auth
    // endpoint means "discard the session and go to the login page", whatever
    // the underlying cause. A 403 here would have to be handled separately in
    // every client, and would be the one case that means exactly the same
    // thing as the 401s beside it.
    const error = new Error('Account is deactivated');
    error.status = 401;
    error.code = 'EACCOUNTDISABLED';
    throw error;
  }

  const accessToken = signAccessToken(user);
  const newRefreshToken = signRefreshToken(user);

  await withTransaction(async (tx) => {
    await revoke(stored.token_hash, hashToken(newRefreshToken), tx);
    await insertRefreshToken(
      {
        userId: user.id,
        token: newRefreshToken,
        expiresAt: new Date(Date.now() + refreshLifetimeMs()),
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      },
      tx,
    );
    await insertAudit(
      {
        userId: user.id,
        action: 'TOKEN_REFRESHED',
        entityType: 'auth',
        entityId: user.id,
        delta: { replaced: stored.token_hash.slice(0, 12) },
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      },
      tx,
    );
  });

  res.status(200).json({
    success: true,
    token: accessToken,
    refresh_token: newRefreshToken,
    user: publicUser(user),
  });
}

/**
 * POST /api/v1/auth/logout
 *
 * Revokes only the presented token. Concurrent sessions are allowed
 * deliberately: a ministry desk is often a shared machine, and one person
 * logging out should not sign their colleagues out. `revokeAllForUser` exists
 * in the model for Phase 4's "sign out everywhere".
 *
 * Idempotent: revoking an already-revoked token is a 200, not a 401. A logout
 * that fails because the session was already gone is a worse experience than
 * a logout that does nothing.
 */
export async function logout(req, res) {
  rejectUnknownFields(req.body, ['refresh_token']);

  const token = req.body?.refresh_token ? requireString(req.body.refresh_token, 'refresh_token') : null;

  if (token) {
    const stored = await findByToken(token);
    // Only revoke a token that belongs to the caller. Without this check, any
    // authenticated user could revoke somebody else's session by guessing or
    // stealing their token.
    if (stored && stored.user_id === req.user.id) {
      await revoke(stored.token_hash);
    }
  }

  await insertAudit({
    userId: req.user.id,
    action: 'LOGOUT',
    entityType: 'auth',
    entityId: req.user.id,
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  });

  res.status(200).json({ success: true, message: 'Signed out' });
}

// ============================================================================
// helpers
// ============================================================================

/**
 * A failed login is audited on the pool, never in a transaction.
 *
 * D20's rule is that an audit row must survive the failure of the thing it
 * records. Here the thing *is* the failure, so there is nothing to roll back
 * and no transaction to be in.
 */
async function recordLoginFailure(req, nic, action, userId = null) {
  try {
    await insertAudit({
      userId,
      action,
      entityType: 'auth',
      entityId: userId,
      delta: { nic_no: nic },
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
  } catch (error) {
    // An audit write that fails must not turn a clean 401 into a 500, and must
    // not print the submitted NIC to the console as if it were a credential.
    console.error(`[audit] failed to record ${action}`, error.code || error.message);
  }
}

/**
 * Convert a duration string like '14d' or '2h' to milliseconds.
 *
 * Kept deliberately small. jsonwebtoken parses these strings itself, but it
 * does not expose the resulting expiry date for a token it has already signed,
 * and refresh_tokens.expires_at has to be a real column value — the database is
 * what enforces expiry, not the token, so a token whose database row outlives
 * it would be a discrepancy waiting to be exploited.
 */
function msUntilExpiry(raw) {
  const match = /^(\d+)\s*([smhd])$/.exec(String(raw).trim());

  if (!match) {
    throw new Error(`Cannot parse expiry duration: ${raw}`);
  }

  const value = Number(match[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  return value * unit;
}

/** The refresh token lifetime, as milliseconds. */
function refreshLifetimeMs() {
  return msUntilExpiry(process.env.REFRESH_TOKEN_EXPIRES_IN || '14d');
}
