/**
 * The permission map. Single source of truth for "may this role do this?".
 *
 * Used by the backend now (middleware/roleMiddleware.js) and by the frontend
 * in Phase 3 (D25). The frontend is a separate npm package and cannot import
 * from backend/ without a shared workspace or a build step, so it consumes this
 * over HTTP via GET /api/v1/auth/permissions instead. That also means a
 * permission change takes effect without a frontend rebuild.
 *
 * ROLES must stay in exact agreement with the `role` ENUM in
 * database/migrations/002_users.sql. tests/permissions.test.js reads the ENUM
 * out of information_schema and asserts they match, in order — that test exists
 * because role drift between schema and map is the single most likely defect
 * in the phases after this one, and it otherwise shows up as a 403 nobody can
 * explain.
 */

/** The wildcard permission. Expanded at resolve time, never checked raw (D26). */
export const WILDCARD = 'FULL_SYSTEM_ACCESS';

export const EXECUTIVE_SET = Object.freeze([
  'READ_ALL_MAIL',
  'WRITE_MINUTES',
  'FORWARD_MAIL',
  'APPROVE_VEHICLE',
  'APPROVE_TRANSFER',
]);

export const OFFICER_SET = Object.freeze([
  'READ_ASSIGNED_MAIL',
  'UPDATE_ACTION_STATUS',
  'CLOSE_MAIL_FILE',
]);

/**
 * Spec §4.1, with two documented departures:
 *
 *   D27 — spec §4.1 lists ENGINEER and LEGAL_OFFICER as officer personas, but
 *         neither is a value in the §5.1 role ENUM. They are OFFICER users
 *         whose `designation` reads Engineer / Legal Officer.
 *   D28 — spec §4.1 assigns TRANSPORT_OFFICER no permissions at all, yet it is
 *         one of the 8 ENUM values and parent plan task 1.15 requires it to be
 *         a loginable persona. An officer with no permissions would log in and
 *         reach nothing. Transport officers are action officers, so they get
 *         the officer set.
 */
export const PERMISSIONS = Object.freeze({
  MINOR_STAFF: Object.freeze(['CREATE_MAIL', 'READ_PUBLIC_MAIL']),
  SECRETARY: EXECUTIVE_SET,
  AO: EXECUTIVE_SET,
  CHIEF_CLERK: EXECUTIVE_SET,
  SUBJECT_CLERK: Object.freeze(['READ_DEPARTMENT_MAIL', 'ASSIGN_OFFICER', 'UPDATE_DUTY_CHART']),
  OFFICER: OFFICER_SET,
  TRANSPORT_OFFICER: OFFICER_SET,
  ADMIN: Object.freeze([WILDCARD]),
});

/** The 8 ENUM values, in schema order. See tests/permissions.test.js. */
export const ROLES = Object.freeze(Object.keys(PERMISSIONS));

/**
 * Every distinct concrete permission, in first-seen order.
 *
 * The wildcard is filtered OUT. That is the whole point of D26: consumers get a
 * flat list of things a role can actually do, and never see the marker that
 * means "everything". Leaving it in would mean every frontend ends up with a
 * second `if (perms.includes('FULL_SYSTEM_ACCESS'))` branch, and the guarantee
 * this module exists to provide is quietly gone.
 */
export const ALL_PERMISSIONS = Object.freeze([
  ...new Set(
    ROLES.flatMap((role) => PERMISSIONS[role]).filter((p) => p !== WILDCARD),
  ),
]);

/**
 * Every permission a role actually has, wildcard expanded.
 *
 * D26 — the expansion happens HERE and nowhere else, so no consumer ever has to
 * know the wildcard exists. A two-step check (`perm || role === 'ADMIN'`) is
 * correct in one place and forgotten in the next, and the place it is forgotten
 * locks the administrator out of a feature.
 *
 * @param {string} role
 * @returns {string[]}
 */
export function resolvePermissions(role) {
  const granted = PERMISSIONS[role];

  if (!granted) return [];
  if (!granted.includes(WILDCARD)) return [...granted];

  return [...ALL_PERMISSIONS];
}

/**
 * Does this role hold this permission?
 *
 * @param {string} role
 * @param {string} permission
 * @returns {boolean}
 */
export function hasPermission(role, permission) {
  return resolvePermissions(role).includes(permission);
}
