/**
 * Password hashing. The only module in the project that calls bcrypt.
 *
 * Controllers and models must not import `bcryptjs` directly. There are two
 * reasons, and both are about a forgotten call site:
 *
 *  1. A plaintext password in a `VARCHAR(255)` that accepts it happily is
 *     indistinguishable from a hash once stored. Routing every hash through one
 *     function means there is exactly one place to get right.
 *  2. BCRYPT_ROUNDS has to be a single decision, not a number typed at four
 *     call sites that slowly diverge.
 */
import { randomUUID } from 'node:crypto';

import bcrypt from 'bcryptjs';

/**
 * Cost factor. 12 is the value EXECUTION_PLAN.md task 4.4 names, and costs
 * roughly 300 ms per hash on current hardware.
 *
 * D34: this is a constant, not an environment variable. Lowering the cost
 * factor is a security decision, not a deployment knob — an environment that
 * can weaken its own password hashing will eventually do so quietly. The cost
 * of a constant is that `npm test` is visibly slow and `npm run seed` takes a
 * few seconds; both are the honest price of testing real password hashing, and
 * both are preferable to a dev-only factor that reaches production.
 */
export const BCRYPT_ROUNDS = 12;

/**
 * A real bcrypt hash at BCRYPT_ROUNDS, of a phrase nobody holds.
 *
 * D30 — login must not leak account existence through *timing* as well as
 * through its response body. An unknown NIC that returns in ~1 ms while a
 * known NIC with a wrong password takes ~300 ms enumerates accounts just as
 * effectively as a differing error message would. Comparing against this
 * constant costs the same as a real comparison, so both paths take the same
 * time.
 *
 * It is a genuine hash, not a malformed string: a malformed one makes
 * bcrypt.compare return early, which reintroduces the very timing gap this
 * exists to close. A test asserts this compares to `false` rather than throwing.
 */
export const DUMMY_HASH = '$2b$12$5PqIgDpfranmdvB8OHi6qOrky5idptQ9gF59.tGJvgizwFGm4doqa';

/**
 * Hash a plaintext password.
 * @param {string} plain
 * @returns {Promise<string>} a 60-character bcrypt hash
 */
export function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Compare a plaintext password against a stored hash.
 *
 * Never throws on a bad hash — bcryptjs rejects with `false` for a mismatch and
 * an error only for a structurally invalid hash. Callers must not treat a
 * thrown error as "wrong password"; that distinction is a 500, not a 401.
 *
 * @param {string} plain
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(plain, hash) {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * Burn one bcrypt comparison against DUMMY_HASH.
 *
 * Call this on the "no such user" branch of login so it costs the same as the
 * "wrong password" branch. The plaintext is random and never stored; only its
 * cost factor matters.
 */
export function dummyVerify() {
  // A random string keeps this from ever matching DUMMY_HASH by accident.
  return verifyPassword(randomUUID(), DUMMY_HASH);
}
