/**
 * The single authentication gate. Everything except /health, POST /auth/login
 * and POST /auth/refresh passes through it.
 */
import { verifyToken, ACCESS } from '../config/jwt.js';
import { findById } from '../models/userModel.js';

/** The 401 body. One constant so every rejection is byte-identical. */
function unauthorized(message) {
  const error = new Error(message);
  error.status = 401;
  error.code = 'EUNAUTHENTICATED';
  return error;
}

/**
 * Pull the token out of the Authorization header.
 *
 * The scheme is stripped in exactly one place. Leaving 'Bearer ' attached is
 * the single most common cause of a "jwt malformed" on a token that looks
 * correct on inspection.
 */
function extractBearer(header) {
  if (typeof header !== 'string' || header.length === 0) return null;

  const [scheme, ...rest] = header.split(' ');
  if (scheme.toLowerCase() !== 'bearer') return null;

  const token = rest.join(' ').trim();
  return token.length > 0 ? token : null;
}

/**
 * Verify the bearer token and attach the user.
 *
 * D22 — verifyToken is given the expected type, so a refresh token presented as
 * a Bearer credential is rejected here rather than at three call sites.
 *
 * D21 — the user row is reloaded from the database on every request. The token
 * carries only { sub, role, type }, and the role used for authorization comes
 * from the fresh row, not the claim. This costs one primary-key lookup and
 * buys two things that are unavailable any other way:
 *
 *   - deactivation takes effect on the very next request, not after up to
 *     JWT_EXPIRES_IN seconds of a still-valid token
 *   - a role or department change takes effect on the next request, not at the
 *     user's next login
 *
 * Neither is achievable with a self-contained token, and both are required by
 * EXECUTION_PLAN.md task 1.6.
 */
export async function authenticate(req, res, next) {
  try {
    const token = extractBearer(req.headers.authorization);

    if (!token) {
      return next(unauthorized('Authentication required'));
    }

    const payload = verifyToken(token, ACCESS);
    const user = await findById(Number(payload.sub));

    if (!user) {
      // The signature was valid but the account is gone. That is a deleted
      // user, not a bad token — still 401, and still a generic message.
      return next(unauthorized('Authentication required'));
    }

    if (!user.is_active) {
      // A valid signature proving who you are, being told the account is off.
      // Naming the reason helps the legitimate holder and discloses nothing to
      // an attacker, who does not have a valid token for a deactivated user.
      const error = new Error('Account is deactivated');
      error.status = 401;
      error.code = 'EACCOUNTDISABLED';
      return next(error);
    }

    req.user = {
      id: user.id,
      nic_no: user.nic_no,
      full_name: user.full_name,
      role: user.role,
      department_id: user.department_id,
      designation: user.designation,
      section_name: user.section_name,
    };
    req.token = token;

    return next();
  } catch (error) {
    // An expired token, a bad signature, a malformed one, or a refresh token
    // in the wrong slot all arrive here. They are deliberately
    // indistinguishable: telling them apart in the response tells an attacker
    // apart too.
    if (error.status) return next(error);

    const wrapped = unauthorized('Invalid or expired token');
    wrapped.cause = error;
    return next(wrapped);
  }
}

export default authenticate;
