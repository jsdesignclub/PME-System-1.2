/**
 * Display labels for permissions.
 *
 * A LABELLING MAP, and nothing else. There is deliberately no role→permission
 * table in the frontend: the authoritative map is in authApi.js,
 * the client reads the resolved list from Supabase (D25). A permission with
 * no label renders as the raw constant, which is legible, rather than crashing
 * a settings page over a missing key.
 *
 * ---------------------------------------------------------------------------
 * NO `MANAGE_USERS`, `MANAGE_DEPARTMENTS` OR `VIEW_AUDIT` — AND THAT IS CORRECT
 * ---------------------------------------------------------------------------
 * Those three are not permissions in this system, and this file deliberately has
 * no labels for them. `/users`, `/departments` and `/audit` are guarded by
 * `requireAdmin` — a check on the `role` column, not on a resolved permission —
 * so no permission list ever contains them.
 *
 * Gating the admin page on `hasPermission('MANAGE_USERS')` therefore returns
 * false for EVERYONE, administrators included, because the server expands the
 * ADMIN wildcard to `ALL_PERMISSIONS` and that list does not contain a constant
 * nobody granted. The Administration link would vanish from the sidebar and
 * /admin would 403 for the people who own it, with no error anywhere: the check
 * is well-formed, the permission is just fictional. The admin surface is gated
 * on `role === 'ADMIN'` instead — see `RequireRole` in App.jsx.
 */

/** @type {Record<string, string>} */
export const PERMISSION_LABELS = Object.freeze({
  CREATE_MAIL: 'Log a letter',
  READ_PUBLIC_MAIL: 'Letters they logged',
  READ_ASSIGNED_MAIL: 'Letters assigned to them',
  READ_DEPARTMENT_MAIL: 'Department letters',
  READ_ALL_MAIL: 'All letters',
  WRITE_MINUTES: 'Write minutes',
  FORWARD_MAIL: 'Forward letters',
  ASSIGN_OFFICER: 'Assign an officer',
  UPDATE_ACTION_STATUS: 'Update action status',
  CLOSE_MAIL_FILE: 'Close a mail file',
  UPDATE_DUTY_CHART: 'Edit duty charts',
  APPROVE_VEHICLE: 'Approve a vehicle',
  APPROVE_TRANSFER: 'Approve a transfer',
});

/**
 * The roles whose entire purpose is administration, per spec §4.1.
 *
 * Used for the `/admin` surface only, and only because the server gates those
 * three routers on the role column. It is a list rather than `=== 'ADMIN'` so
 * that a future administrative role is added in one place; it is NOT a
 * role→permission map, which is the thing `permissions.js` exists to forbid.
 */
export const ADMIN_ROLES = Object.freeze(['ADMIN']);

/**
 * The human name for a permission, falling back to the constant itself.
 *
 * @param {string} permission
 * @returns {string}
 */
export function permissionLabel(permission) {
  return PERMISSION_LABELS[permission] ?? permission;
}
