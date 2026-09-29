/**
 * User directory CRUD. Every route here is ADMIN-only except that being
 * enforced in routes/userRoutes.js, not in this file.
 */
import { computeDelta, deltaIsEmpty, insert as insertAudit } from '../models/auditModel.js';
import { deactivate as deactivateUser, create as createUser, findById, list as listUsers, update as updateUser, countActiveAdminsExcluding } from '../models/userModel.js';
import { withTransaction } from '../utils/transaction.js';
import { ROLES } from '../utils/permissions.js';
import {
  optionalBoolean,
  optionalString,
  parsePagination,
  rejectUnknownFields,
  requireEmail,
  requireEnum,
  requireInt,
  requirePassword,
  requireString,
} from '../utils/validate.js';

/** Translate a driver uniqueness error into a 409 that names the field. */
function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  error.code = 'ECONFLICT';
  return error;
}

function isDuplicate(error) {
  return error.code === 'ER_DUP_ENTRY';
}

/** GET /api/v1/users */
export async function list(req, res) {
  const { limit, offset } = parsePagination(req.query);

  const filters = {
    limit,
    offset,
    search: optionalString(req.query.search, 'search', { max: 150 }),
    role: req.query.role ? requireEnum(req.query.role, 'role', ROLES) : undefined,
    departmentId: req.query.department_id
      ? requireInt(req.query.department_id, 'department_id')
      : undefined,
    isActive: optionalBoolean(req.query.is_active, 'is_active'),
  };

  const { rows, total } = await listUsers(filters);

  res.status(200).json({ success: true, data: rows, total, limit, offset });
}

/** GET /api/v1/users/:id */
export async function getById(req, res) {
  const id = requireInt(req.params.id, 'id');
  const user = await findById(id);

  if (!user) {
    const error = new Error(`No user with id ${id}`);
    error.status = 404;
    throw error;
  }

  res.status(200).json({ success: true, data: user });
}

/**
 * POST /api/v1/users
 *
 * A duplicate NIC or email is a 409, not a 500. The check is left to the
 * database's unique indexes rather than pre-checked with a SELECT, because a
 * read-then-write check races two concurrent creates into a duplicate anyway.
 */
export async function create(req, res) {
  rejectUnknownFields(req.body, [
    'nic_no',
    'full_name',
    'email',
    'password',
    'role',
    'department_id',
    'designation',
    'section_name',
  ]);

  const payload = {
    nic_no: requireString(req.body.nic_no, 'nic_no', { max: 20 }),
    full_name: requireString(req.body.full_name, 'full_name', { max: 150 }),
    email: requireEmail(req.body.email),
    password: requirePassword(req.body.password),
    role: requireEnum(req.body.role, 'role', ROLES),
    designation: requireString(req.body.designation, 'designation', { max: 150 }),
    department_id: req.body.department_id
      ? requireInt(req.body.department_id, 'department_id')
      : null,
    section_name: optionalString(req.body.section_name, 'section_name', { max: 150 }),
  };

  const user = await withTransaction(async (tx) => {
    let created;
    try {
      created = await createUser(payload, tx);
    } catch (error) {
      if (isDuplicate(error)) {
        throw conflict(error.sqlMessage?.includes('uq_users_email')
          ? 'A user with that email already exists'
          : 'A user with that NIC number already exists');
      }
      throw error;
    }

    await insertAudit(
      {
        userId: req.user.id,
        action: 'USER_CREATED',
        entityType: 'user',
        entityId: created.id,
        // The delta carries the fields that were set, not the row. The
        // password_hash is redacted inside auditModel (D32), so passing the
        // whole created row is safe and loses nothing useful.
        delta: { before: null, after: created },
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      },
      tx,
    );

    return created;
  });

  res.status(201).json({ success: true, message: 'User created', data: user });
}

/**
 * PATCH /api/v1/users/:id
 *
 * Two guards that are not obvious from the signature:
 *
 *  - an admin cannot change their own role. Self-promotion is a privilege
 *    escalation path, and a self-demotion strands the system with no way back
 *    in through the UI.
 *  - `is_active` is not in the patch allowlist. Deactivation goes through
 *    DELETE, which carries the last-admin guard (D24). Allowing it here would
 *    be a second, unguarded path to the same state.
 */
export async function update(req, res) {
  const id = requireInt(req.params.id, 'id');

  rejectUnknownFields(req.body, [
    'full_name',
    'email',
    'role',
    'department_id',
    'designation',
    'section_name',
  ]);

  const patch = {};
  if (req.body.full_name !== undefined) patch.full_name = requireString(req.body.full_name, 'full_name', { max: 150 });
  if (req.body.email !== undefined) patch.email = requireEmail(req.body.email);
  if (req.body.designation !== undefined) patch.designation = requireString(req.body.designation, 'designation', { max: 150 });
  if (req.body.section_name !== undefined) patch.section_name = optionalString(req.body.section_name, 'section_name', { max: 150 });
  if (req.body.department_id !== undefined) {
    patch.department_id = req.body.department_id === null
      ? null
      : requireInt(req.body.department_id, 'department_id');
  }

  // Read the role separately so it can be dropped from the patch rather than
  // rejected: a client sending back a whole user object is normal, and a 400
  // for an unchanged `role` teaches people to stop sending it.
  if (req.body.role !== undefined) {
    const role = requireEnum(req.body.role, 'role', ROLES);
    if (id === req.user.id && role !== req.user.role) {
      const error = new Error('You cannot change your own role');
      error.status = 400;
      error.code = 'ESELFROLE';
      throw error;
    }
    patch.role = role;
  }

  if (Object.keys(patch).length === 0) {
    return res.status(200).json({ success: true, message: 'Nothing to update', data: await findById(id) });
  }

  const before = await findById(id);
  if (!before) {
    const error = new Error(`No user with id ${id}`);
    error.status = 404;
    throw error;
  }

  const updated = await withTransaction(async (tx) => {
    let result;
    try {
      result = await updateUser(id, patch, tx);
    } catch (error) {
      if (isDuplicate(error)) throw conflict('A user with that email already exists');
      throw error;
    }

    // D20 — the change and its audit row commit together.
    const delta = computeDelta(before, result);
    if (!deltaIsEmpty(delta)) {
      await insertAudit(
        {
          userId: req.user.id,
          action: 'USER_UPDATED',
          entityType: 'user',
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

  res.status(200).json({ success: true, message: 'User updated', data: updated });
}

/**
 * DELETE /api/v1/users/:id — deactivates, never deletes (D23).
 *
 * Three refusals, in the order they are checked:
 *   1. deleting yourself is a 400
 *   2. the last active ADMIN cannot be deactivated, a 409
 *   3. the guard runs under SELECT ... FOR UPDATE inside the transaction, so
 *      two concurrent requests cannot both observe "one admin left" and both
 *      proceed (D24)
 */
export async function deactivate(req, res) {
  const id = requireInt(req.params.id, 'id');

  if (id === req.user.id) {
    const error = new Error('You cannot deactivate your own account');
    error.status = 400;
    error.code = 'ESELFDELETE';
    throw error;
  }

  const result = await withTransaction(async (tx) => {
    const target = await findById(id, tx);
    if (!target) {
      const error = new Error(`No user with id ${id}`);
      error.status = 404;
      throw error;
    }

    if (target.role === 'ADMIN' && target.is_active) {
      const remaining = await countActiveAdminsExcluding(id, tx);
      if (remaining === 0) {
        const error = new Error(
          'Cannot deactivate the last active administrator. Create another admin first.',
        );
        error.status = 409;
        error.code = 'ELASTADMIN';
        throw error;
      }
    }

    const changed = await deactivateUser(id, tx);

    // Already inactive: not an error, and not audited. Re-running a delete is
    // a normal thing for a client to do after a network timeout.
    if (changed) {
      await insertAudit(
        {
          userId: req.user.id,
          action: 'USER_DEACTIVATED',
          entityType: 'user',
          entityId: id,
          delta: { before: { is_active: true }, after: { is_active: false } },
          ipAddress: req.ip ?? null,
          userAgent: req.get('user-agent') ?? null,
        },
        tx,
      );
    }

    return { changed, target };
  });

  res.status(200).json({
    success: true,
    message: result.changed
      ? 'User deactivated'
      : 'User was already deactivated',
    data: { id, is_active: false },
  });
}
