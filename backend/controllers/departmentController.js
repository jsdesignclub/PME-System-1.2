/**
 * Department CRUD. `GET` is open to any authenticated user; the writes are
 * ADMIN-only (enforced in routes/departmentRoutes.js).
 */
import { computeDelta, deltaIsEmpty, insert as insertAudit } from '../models/auditModel.js';
import {
  create as createDepartment,
  findById,
  list as listDepartments,
  update as updateDepartment,
} from '../models/departmentModel.js';
import { withTransaction } from '../utils/transaction.js';
import { rejectUnknownFields, requireInt, requireString } from '../utils/validate.js';

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  error.code = 'ECONFLICT';
  return error;
}

function notFound(id) {
  const error = new Error(`No department with id ${id}`);
  error.status = 404;
  error.code = 'ENOTFOUND';
  return error;
}

/**
 * GET /api/v1/departments
 *
 * Open to every authenticated user, not just admins. Every signed-in user needs
 * the department picker, and the payload is a name and a code — Q14 records this
 * as a decision, changeable to admin-only if the ministry disagrees.
 */
export async function list(req, res) {
  const departments = await listDepartments();
  res.status(200).json({ success: true, data: departments, total: departments.length });
}

export async function getById(req, res) {
  const id = requireInt(req.params.id, 'id');
  const department = await findById(id);

  if (!department) throw notFound(id);
  res.status(200).json({ success: true, data: department });
}

export async function create(req, res) {
  rejectUnknownFields(req.body, ['name', 'code']);

  const name = requireString(req.body.name, 'name', { max: 150 });
  // Codes are uppercased on the way in. The column is utf8mb4_unicode_ci, so
  // 'sec' and 'SEC' collide in the unique index regardless; normalising means
  // the stored value matches what everyone sees in the UI.
  const code = requireString(req.body.code, 'code', { max: 20 }).toUpperCase();

  const department = await withTransaction(async (tx) => {
    let created;
    try {
      created = await createDepartment({ name, code }, tx);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw conflict(`Department code ${code} is already in use`);
      throw error;
    }

    await insertAudit(
      {
        userId: req.user.id,
        action: 'DEPARTMENT_CREATED',
        entityType: 'department',
        entityId: created.id,
        delta: { before: null, after: created },
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      },
      tx,
    );

    return created;
  });

  res.status(201).json({ success: true, message: 'Department created', data: department });
}

export async function update(req, res) {
  const id = requireInt(req.params.id, 'id');
  rejectUnknownFields(req.body, ['name', 'code']);

  const patch = {};
  if (req.body.name !== undefined) patch.name = requireString(req.body.name, 'name', { max: 150 });
  if (req.body.code !== undefined) {
    patch.code = requireString(req.body.code, 'code', { max: 20 }).toUpperCase();
  }

  if (Object.keys(patch).length === 0) {
    return res.status(200).json({ success: true, message: 'Nothing to update', data: await findById(id) });
  }

  const before = await findById(id);
  if (!before) throw notFound(id);

  const updated = await withTransaction(async (tx) => {
    let result;
    try {
      result = await updateDepartment(id, patch, tx);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw conflict(`Department code ${patch.code} is already in use`);
      }
      throw error;
    }

    // D20 — the rename and the audit row land in the same COMMIT.
    const delta = computeDelta(before, result);
    if (!deltaIsEmpty(delta)) {
      await insertAudit(
        {
          userId: req.user.id,
          action: 'DEPARTMENT_UPDATED',
          entityType: 'department',
          entityId: id,
          delta,
          ipAddress: req.ip ?? null,
          userAgent: req.get('user-agent') ?? null,
        },
        tx,
      );
    }

    return result;
  });

  res.status(200).json({ success: true, message: 'Department updated', data: updated });
}
