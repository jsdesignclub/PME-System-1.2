/**
 * The permission map, and the middleware that enforces it.
 *
 * Split deliberately into two kinds of test:
 *
 *  - unit tests over utils/permissions.js, which are fast, exhaustive, and can
 *    assert on all eight roles at once
 *  - HTTP tests over roleMiddleware.js, which prove the guard is actually
 *    attached to the routes
 *
 * The second kind is the one that matters. A permission map can be perfect and
 * still be unenforced if nobody mounts the guard, and that is invisible to a
 * test of the map alone.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { pool } from '../config/db.js';
import {
  ALL_PERMISSIONS,
  EXECUTIVE_SET,
  OFFICER_SET,
  PERMISSIONS,
  ROLES,
  WILDCARD,
  hasPermission,
  resolvePermissions,
} from '../utils/permissions.js';
import { request, startServer } from './helpers/app.js';
import { cleanup, createAndLogin, login, testNic } from './helpers/fixtures.js';

/**
 * The roles that hold the executive set. Named here rather than imported,
 * because EXECUTIVE_SET is a list of *permissions* -- a test that iterates it
 * expecting role names silently tests nothing.
 */
const EXECUTIVE_ROLES = ['SECRETARY', 'AO', 'CHIEF_CLERK'];
const CLERK_ROLES = ['CHIEF_CLERK', 'SUBJECT_CLERK', 'MINOR_STAFF'];

let baseUrl;
let close;

before(async () => {
  ({ baseUrl, close } = await startServer());
});

after(async () => {
  await cleanup();
  await close();
  await pool.end();
});

describe('permission map', () => {
  it('covers all eight ENUM roles', () => {
    assert.deepEqual(
      [...ROLES].sort(),
      [
        'ADMIN',
        'AO',
        'CHIEF_CLERK',
        'MINOR_STAFF',
        'OFFICER',
        'SECRETARY',
        'SUBJECT_CLERK',
        'TRANSPORT_OFFICER',
      ],
    );
  });

  it('gives ADMIN the wildcard and expands it to every permission', () => {
    // D26: the wildcard is expanded here, at resolve time, so no caller ever
    // has to special-case '*' and a client can compare against a flat list.
    const resolved = resolvePermissions('ADMIN');

    assert.ok(PERMISSIONS.ADMIN.includes(WILDCARD));
    assert.equal(resolved.includes(WILDCARD), false);
    assert.deepEqual([...resolved].sort(), [...ALL_PERMISSIONS].sort());
  });

  it('gives every other role a subset of the real permission list', () => {
    // A typo in a permission name would otherwise produce a role that silently
    // cannot do anything, and the failure would look like a UI bug.
    for (const role of ROLES) {
      if (role === 'ADMIN') continue;
      const resolved = resolvePermissions(role);
      for (const permission of resolved) {
        assert.ok(
          ALL_PERMISSIONS.includes(permission),
          `${role} holds unknown permission "${permission}"`,
        );
      }
    }
  });

  it('resolves an unknown role to nothing rather than to everything', () => {
    // Fails closed (D26). The alternative -- treating an unrecognised role as
    // privileged -- would turn a typo in a database value into an escalation.
    assert.deepEqual(resolvePermissions('NOT_A_ROLE'), []);
  });

  it('gives the executive roles a non-empty, strictly smaller set than ADMIN', () => {
    assert.ok(EXECUTIVE_SET.length > 0);
    assert.deepEqual(resolvePermissions('SECRETARY'), [...EXECUTIVE_SET]);
    for (const role of EXECUTIVE_ROLES) {
      const resolved = resolvePermissions(role);
      assert.ok(resolved.length > 0, `${role} has no permissions at all`);
      assert.ok(resolved.length < ALL_PERMISSIONS.length, `${role} is not a subset`);
    }
  });

  it('gives TRANSPORT_OFFICER the officer set', () => {
    // D28. Spec 4.1 gives this persona nothing, which would make a seeded
    // ENUM value that can log in and reach nothing at all.
    assert.deepEqual(
      resolvePermissions('TRANSPORT_OFFICER'),
      [...OFFICER_SET],
    );
    assert.deepEqual(resolvePermissions('OFFICER'), [...OFFICER_SET]);
  });

  it('matches the spec 4.1 persona table exactly', () => {
    // Exact equality in both directions, copied from
    // system_architecture_technical_specification.md lines 71-89.
    //
    // Deliberately NOT a monotonic "rank" test. The spec defines these as five
    // parallel responsibility tracks, not a hierarchy: a Subject Clerk is the
    // one who runs duty matching and routes letters to officers, so ASSIGN_OFFICER
    // and UPDATE_DUTY_CHART are the Clerk's and deliberately not the Secretary's,
    // even though a Secretary outranks a Clerk. A test asserting "senior roles
    // can do everything junior roles can" would have demanded that the
    // Secretary be able to reassign officers, which is not this system.
    //
    // Exact equality is what catches drift, and it catches it in the direction
    // that matters: someone granting a role a permission it should not have is
    // a security change and fails here just as loudly as a missing one.
    const SPEC_4_1 = {
      MINOR_STAFF: ['CREATE_MAIL', 'READ_PUBLIC_MAIL'],
      SECRETARY: [
        'READ_ALL_MAIL',
        'WRITE_MINUTES',
        'FORWARD_MAIL',
        'APPROVE_VEHICLE',
        'APPROVE_TRANSFER',
      ],
      AO: [
        'READ_ALL_MAIL',
        'WRITE_MINUTES',
        'FORWARD_MAIL',
        'APPROVE_VEHICLE',
        'APPROVE_TRANSFER',
      ],
      CHIEF_CLERK: [
        'READ_ALL_MAIL',
        'WRITE_MINUTES',
        'FORWARD_MAIL',
        'APPROVE_VEHICLE',
        'APPROVE_TRANSFER',
      ],
      SUBJECT_CLERK: ['READ_DEPARTMENT_MAIL', 'ASSIGN_OFFICER', 'UPDATE_DUTY_CHART'],
      OFFICER: ['READ_ASSIGNED_MAIL', 'UPDATE_ACTION_STATUS', 'CLOSE_MAIL_FILE'],
      // D27/D28: not in the spec's persona list, derived by decision.
      TRANSPORT_OFFICER: ['READ_ASSIGNED_MAIL', 'UPDATE_ACTION_STATUS', 'CLOSE_MAIL_FILE'],
      ADMIN: [WILDCARD],
    };

    for (const [role, expected] of Object.entries(SPEC_4_1)) {
      const expectedSet = [...expected].sort();
      if (role === 'ADMIN') {
        // ADMIN holds the wildcard, which resolves to every concrete permission
        // -- so assert against the concrete list, not the marker.
        assert.deepEqual(
          [...resolvePermissions(role)].sort(),
          [...ALL_PERMISSIONS].sort(),
          `ADMIN should resolve to the wildcard expanded`,
        );
        assert.deepEqual([...PERMISSIONS[role]], [WILDCARD]);
        continue;
      }
      assert.deepEqual(
        [...resolvePermissions(role)].sort(),
        expectedSet,
        `${role} does not match spec 4.1`,
      );
    }
  });

  it('hasPermission agrees with resolvePermissions', () => {
    for (const role of ROLES) {
      const resolved = resolvePermissions(role);
      for (const permission of ALL_PERMISSIONS) {
        assert.equal(
          hasPermission(role, permission),
          resolved.includes(permission),
          `${role}/${permission} disagreed between the two functions`,
        );
      }
    }
  });
});

describe('role middleware over HTTP', () => {
  it('refuses a non-admin with 403 on an admin-only route', async () => {
    const nic = testNic();
        const { token } = await createAndLogin(baseUrl, { nic_no: nic, role: 'MINOR_STAFF' });

    const { status } = await request(baseUrl, 'GET', '/api/v1/users', { token });

    assert.equal(status, 403);
  });

  it('answers 401 before 403 when both the token and the role are wrong', async () => {
    // D29's ordering rule: a caller with no valid credentials is not told
    // anything about the resource, including whether they would have been
    // allowed to see it.
    const { status } = await request(baseUrl, 'GET', '/api/v1/users', {
      token: 'not-a-real-token',
    });

    assert.equal(status, 401);
  });

  it('lets an admin through', async () => {
    const nic = testNic();
        const { token } = await createAndLogin(baseUrl, { nic_no: nic, role: 'ADMIN' });

    const { status } = await request(baseUrl, 'GET', '/api/v1/users', { token });

    assert.equal(status, 200);
  });

  it('serves each role its own permission list', async () => {
    // The endpoint exists so the frontend can hide what the user cannot do. If
    // it returned a constant, every screen would rely on the server to reject
    // what it should have hidden, and the UI would fill with buttons that 403.
    const seen = new Map();

    for (const role of ROLES) {
      const nic = testNic();
            const { password } = await createAndLogin(baseUrl, { nic_no: nic, role });
      const session = await login(baseUrl, nic, password);
      const { status, body } = await request(baseUrl, 'GET', '/api/v1/auth/permissions', {
        token: session.token,
      });

      assert.equal(status, 200, `permissions failed for ${role}`);
      seen.set(role, body.permissions);
    }

    // ADMIN's list is the superset; no role may hold anything ADMIN lacks.
    const admin = seen.get('ADMIN');
    for (const [role, permissions] of seen) {
      for (const permission of permissions) {
        assert.ok(
          admin.includes(permission),
          `${role} holds ${permission}, which ADMIN does not`,
        );
      }
    }

    // MINOR_STAFF is the floor of the hierarchy and should hold the fewest.
    const minorCount = seen.get('MINOR_STAFF').length;
    for (const [role, permissions] of seen) {
      if (role === 'ADMIN' || role === 'MINOR_STAFF') continue;
      assert.ok(
        permissions.length >= minorCount,
        `${role} holds fewer permissions than MINOR_STAFF`,
      );
    }
  });
});
