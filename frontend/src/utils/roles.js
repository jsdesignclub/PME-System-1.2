/**
 * The role ENUM, in schema order.
 *
 * This is a list of the roles a user may be GIVEN, not a role→permission map.
 * The distinction is the whole point of D25: the client may know which role
 * names exist (they are in the spec and in the schema), and may not know what
 * each one permits — that list comes from `/auth/permissions` at runtime.
 *
 * Kept as a constant rather than fetched, because there is no endpoint that
 * serves the ENUM and inventing one would be a new API surface for a list of
 * role names that changes when a migration changes.
 */
export const ROLES = [
  'MINOR_STAFF',
  'SECRETARY',
  'AO',
  'CHIEF_CLERK',
  'SUBJECT_CLERK',
  'DEPARTMENT_HEAD',
  'OFFICER',
  'TRANSPORT_OFFICER',
  'ADMIN',
];
