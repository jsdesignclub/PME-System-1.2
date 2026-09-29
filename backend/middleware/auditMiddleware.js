/**
 * Audit capture.
 *
 * D20 — an audit row and the change it describes commit together, or not at
 * all. The controller owns the transaction, because the controller knows what
 * one unit of work is. A middleware that opened and committed a transaction
 * around next() would commit before the controller's async work had finished,
 * which is worse than no transaction at all: it would look transactional while
 * writing rows for changes that then failed.
 *
 * So this middleware does two things and no more:
 *   - reads the entity identity off the request so the controller does not have
 *     to repeat itself
 *   - offers record() for the "before" state it captured on the way in
 *
 * The actual insert is always explicit, in the controller, on the right
 * connection.
 */

/**
 * Declare the audit event for a route.
 *
 * @param {string} action e.g. 'USER_UPDATED'
 * @param {string} entityType e.g. 'user'
 * @param {(req) => (string|number|null)} [entityIdOf] defaults to req.params.id
 *
 * @example
 *   router.patch('/:id', requireAdmin, audit('USER_UPDATED', 'user'), updateUser);
 */
export function audit(action, entityType, entityIdOf) {
  const resolveId = entityIdOf ?? ((req) => req.params.id ?? null);

  return function auditMiddleware(req, res, next) {
    req.audit = {
      action,
      entityType,
      get entityId() {
        return resolveId(req);
      },
      /** req.ip, which reflects the client because app.js sets `trust proxy`. */
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    };
    return next();
  };
}

export default audit;
