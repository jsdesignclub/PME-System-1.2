/**
 * The audit viewer. Read-only by construction — models/auditModel.js exports no
 * update or delete, so there is no way to alter a row through this API (D42).
 *
 * This is the requirement that an audit trail be *inspectable*. A write-only
 * log answers "did this happen" for the person who did it, and nothing for
 * anyone else — no auditor, no administrator, and nobody investigating an
 * incident six months later.
 */
import { findById, list as listAudit } from '../models/auditModel.js';
import { optionalString, parsePagination, requireInt } from '../utils/validate.js';

export async function list(req, res) {
  const { limit, offset } = parsePagination(req.query);

  const filters = {
    limit,
    offset,
    action: optionalString(req.query.action, 'action', { max: 64 }),
    entityType: optionalString(req.query.entity_type, 'entity_type', { max: 64 }),
    entityId: optionalString(req.query.entity_id, 'entity_id', { max: 64 }),
    userId: req.query.user_id ? requireInt(req.query.user_id, 'user_id') : undefined,
    from: optionalString(req.query.from, 'from', { max: 40 }),
    to: optionalString(req.query.to, 'to', { max: 40 }),
  };

  const { rows, total } = await listAudit(filters);

  res.status(200).json({ success: true, data: rows, total, limit, offset });
}

export async function getById(req, res) {
  const id = requireInt(req.params.id, 'id');
  const entry = await findById(id);

  if (!entry) {
    const error = new Error(`No audit entry with id ${id}`);
    error.status = 404;
    error.code = 'ENOTFOUND';
    throw error;
  }

  res.status(200).json({ success: true, data: entry });
}
