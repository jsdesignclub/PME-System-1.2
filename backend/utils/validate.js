/**
 * Input validation.
 *
 * D41 — hand-rolled, because spec §10.1 fixes the dependency list and Phase 0
 * §9 verified backend/package.json against it. EXECUTION_PLAN.md task 4.1 is
 * where global validation is scheduled; this module exists so Phase 1's own
 * endpoints are not shipping unvalidated input into SQL in the meantime.
 * Everything lives behind these functions, so Phase 4 can replace the module
 * with a schema library without touching a single call site.
 *
 * Every failure throws an Error carrying `status = 400`, which
 * middleware/errorHandler.js already passes through to the response. Nothing
 * else is needed to turn a validation failure into a clean 400.
 *
 * Validate at the edge. Models trust their caller.
 */

/** A validation failure. `status` is what errorHandler reads. */
function fail(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = 'EVALIDATION';
  throw error;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A required, non-empty string, trimmed. Optionally length-bounded.
 * @param {unknown} value
 * @param {string} field
 * @param {{min?: number, max?: number}} [bounds]
 * @returns {string}
 */
export function requireString(value, field, bounds = {}) {
  if (typeof value !== 'string') fail(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length === 0) fail(`${field} is required`);

  const { min = 1, max = 255 } = bounds;
  if (trimmed.length < min) fail(`${field} must be at least ${min} characters`);
  if (trimmed.length > max) fail(`${field} must be at most ${max} characters`);

  return trimmed;
}

/**
 * An optional string. Returns undefined when absent so it can be spread into a
 * patch without turning an omitted field into an empty one.
 */
export function optionalString(value, field, bounds = {}) {
  if (value === undefined || value === null) return undefined;
  return requireString(value, field, bounds);
}

/**
 * A required value from a fixed set. Compared case-sensitively, because the
 * role ENUM is case-sensitive and 'admin' is not 'ADMIN'.
 */
export function requireEnum(value, field, allowed) {
  if (typeof value !== 'string') fail(`${field} must be a string`);
  const trimmed = value.trim();
  if (!allowed.includes(trimmed)) {
    fail(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return trimmed;
}

/**
 * A deliberately shallow email check.
 *
 * Full RFC 5322 validation is not the point; the point is rejecting obvious
 * rubbish before it reaches a UNIQUE column, and not pretending to be a
 * deliverability checker. The column is utf8mb4_unicode_ci, so uniqueness is
 * already case-insensitive and the database decides collisions.
 */
export function requireEmail(value, field = 'email') {
  const email = requireString(value, field, { max: 100 });
  // One @, something either side of it, and a dot in the domain. No spaces.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail(`${field} must be a valid email address`);
  }
  return email.toLowerCase();
}

/**
 * A positive integer, from a number or a numeric string.
 *
 * Query and path params arrive as strings, so accepting "3" is not a
 * convenience here, it is the normal case.
 */
export function requireInt(value, field) {
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(parsed)) fail(`${field} must be an integer`);
  if (parsed < 1) fail(`${field} must be a positive integer`);
  return parsed;
}

/** A boolean from a real boolean or the strings 'true' / 'false'. */
export function optionalBoolean(value, field) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fail(`${field} must be true or false`);
}

/**
 * A password. Length-bounded but otherwise unconstrained beyond non-emptiness.
 *
 * EXECUTION_PLAN.md task 4.4 sets a 10-character minimum and forces a change on
 * the seeded default; that policy is Phase 4's. This only refuses the two
 * things that are certainly wrong: an absent password, and one long enough to
 * be a mistake or a buffer.
 */
export function requirePassword(value, field = 'password') {
  if (typeof value !== 'string') fail(`${field} must be a string`);
  if (value.length === 0) fail(`${field} is required`);
  // bcrypt only reads the first 72 bytes; anything beyond is silently ignored,
  // so accepting it would be a promise the hash cannot keep.
  if (value.length > 72) fail(`${field} must be at most 72 characters`);
  return value;
}

/**
 * Normalise a Sri Lankan NIC.
 *
 * Trim, collapse internal whitespace, uppercase. The database column is
 * utf8mb4_unicode_ci, so uniqueness and lookup are already case-insensitive —
 * this exists so that ' 881234567v ' and '881234567V' are the *same account* in
 * every layer, not just at the query.
 *
 * Not a full checksum: the NIC's check digit depends on which of the two
 * generations is in use, and rejecting a valid NIC on a hand-rolled checksum is
 * worse than accepting an invalid one. Phase 2 will register letters with this
 * same function.
 */
export function normalizeNic(value, field = 'nic_no') {
  const nic = requireString(value, field, { max: 20 });
  return nic.replace(/\s+/g, '').toUpperCase();
}

/**
 * Throw if `body` carries a key that is not in `allowed`.
 *
 * A silently-dropped field reads as a bug in the client. Rejecting it loudly
 * means the caller learns the field does not exist while they are still looking
 * at their own code, instead of three phases later when the feature is
 * mysteriously not saving.
 *
 * @param {unknown} body
 * @param {string[]} allowed
 */
export function rejectUnknownFields(body, allowed) {
  if (body === undefined || body === null) return;
  if (!isPlainObject(body)) fail('Request body must be an object');

  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    fail(`Unknown field${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`);
  }
}

/**
 * Pagination with a hard ceiling.
 *
 * `limit` is clamped rather than rejected: a client asking for 100000 rows
 * wants "everything", and refusing the request helps nobody. The clamp is what
 * keeps that from becoming a table scan.
 */
export function parsePagination(query = {}) {
  const requested = Number(query.limit);
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 100) : 25;
  const offset = Number.isInteger(Number(query.offset)) && Number(query.offset) > 0 ? Number(query.offset) : 0;
  return { limit, offset };
}
