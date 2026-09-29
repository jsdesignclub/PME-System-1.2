/**
 * RBAC gates. Spec §10.2's `requireRole('SECRETARY','AO')`, plus
 * `requirePermission` for capability-based checks.
 */
import { hasPermission } from '../utils/permissions.js';

/**
 * 401 — the request never authenticated.
 *
 * Kept distinct from 403 on purpose. A user with an expired session hitting a
 * forbidden route should be told to log in again, not told their password is
 * wrong.
 */
function unauthorized() {
  const error = new Error('Authentication required');
  error.status = 401;
  error.code = 'EUNAUTHENTICATED';
  return error;
}

function forbidden(message) {
  const error = new Error(message);
  error.status = 403;
  error.code = 'EFORBIDDEN';
  return error;
}

/**
 * Require one of the given roles.
 *
 * Fails closed: called without `authenticate` in front of it, `req.user` is
 * undefined and the request is refused. That is safe, but it is still a
 * mistake, and the resulting 401 is confusing enough to be worth naming.
 *
 * With no arguments this permits nobody, which is the correct default for a
 * guard and the behaviour requirePermission builds on.
 *
 * @param {...string} allowed
 * @returns {import('express').RequestHandler}
 */
export function requireRole(...allowed) {
  return function roleGuard(req, res, next) {
    if (!req.user) return next(unauthorized());
    if (allowed.includes(req.user.role)) return next();
    return next(forbidden(`This action requires one of: ${allowed.join(', ')}`));
  };
}

/**
 * Require a permission, rather than a role.
 *
 * Preferred for module capabilities (`WRITE_MINUTES`, `ASSIGN_OFFICER`) because
 * it decouples "what this role may do" from "which roles happen to share that
 * ability today". Spec §4.1 already groups roles that way, and Phase 2 will
 * need the same grouping.
 *
 * @param {string} permission
 * @returns {import('express').RequestHandler}
 */
export function requirePermission(permission) {
  return function permissionGuard(req, res, next) {
    if (!req.user) return next(unauthorized());
    if (hasPermission(req.user.role, permission)) return next();
    return next(forbidden(`This action requires the ${permission} permission`));
  };
}

/** Shorthand for the administrator-only routes in Task 1.14. */
export const requireAdmin = requireRole('ADMIN');

export default requireRole;
