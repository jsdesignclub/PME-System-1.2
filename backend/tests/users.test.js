/**
 * The user directory: CRUD, the last-admin guard, and the deactivation rules.
 *
 * The interesting tests here are the refusals. Each one documents a way a user
 * directory can be walked into a state nobody can recover from â€” no admins, a
 * deleted administrator, a silently reactivated lockout â€” and each of those
 * failures is invisible in a happy-path test.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { pool } from '../config/db.js';
import { request, startServer } from './helpers/app.js';
import { cleanup, createAndLogin, createUser, testNic, track, unique } from './helpers/fixtures.js';

let baseUrl;
let close;
let adminToken;

before(async () => {
  ({ baseUrl, close } = await startServer());
  const admin = await createAndLogin(baseUrl, { role: 'ADMIN' });
  adminToken = admin.token;
});

after(async () => {
  await cleanup();
  await close();
  await pool.end();
});

describe('POST /api/v1/users', () => {
  it('creates a user and never returns the hash', async () => {
    const nic = track(testNic());

    const { status, body } = await request(baseUrl, 'POST', '/api/v1/users', {
      token: adminToken,
      body: {
        nic_no: nic,
        full_name: 'Created By Test',
        email: `${unique()}@example.test`,
        password: 'Str0ngPassw0rd!',
        role: 'SUBJECT_CLERK',
        designation: 'Subject Clerk',
      },
    });

    assert.equal(status, 201);
    assert.equal(body.data.nic_no, nic);
    assert.equal(JSON.stringify(body).includes('password_hash'), false);
  });

  it('answers 409 for a duplicate NIC', async () => {
    const nic = track(testNic());

    const payload = {
      nic_no: nic,
      full_name: 'First',
      email: `${unique()}@example.test`,
      password: 'Str0ngPassw0rd!',
      role: 'MINOR_STAFF',
      designation: 'Clerk',
    };

    const first = await request(baseUrl, 'POST', '/api/v1/users', {
      token: adminToken,
      body: payload,
    });
    assert.equal(first.status, 201);

    const second = await request(baseUrl, 'POST', '/api/v1/users', {
      token: adminToken,
      body: { ...payload, email: `${unique()}@example.test` },
    });
    assert.equal(second.status, 409);
    assert.match(second.body.message, /NIC/i);
  });

  it('answers 409 for a duplicate email', async () => {
    const email = `${unique()}@example.test`;

    // Both NICs are tracked: the second is rejected with 409, so reading the
    // NIC back off the response body would miss it.
    const firstNic = track(testNic());
    const first = await request(baseUrl, 'POST', '/api/v1/users', {
      token: adminToken,
      body: {
        nic_no: firstNic,
        full_name: 'First',
        email,
        password: 'Str0ngPassw0rd!',
        role: 'MINOR_STAFF',
        designation: 'Clerk',
      },
    });
    assert.equal(first.status, 201);

    track(testNic());
    const second = await request(baseUrl, 'POST', '/api/v1/users', {
      token: adminToken,
      body: {
        nic_no: testNic(),
        full_name: 'Second',
        email,
        password: 'Str0ngPassw0rd!',
        role: 'MINOR_STAFF',
        designation: 'Clerk',
      },
    });
    assert.equal(second.status, 409);
    assert.match(second.body.message, /email/i);
  });

  it('rejects a role that is not in the ENUM with 400', async () => {
    // Guards against a role typo silently creating a user who can do nothing.
    const nic = track(testNic());

    const { status } = await request(baseUrl, 'POST', '/api/v1/users', {
      token: adminToken,
      body: {
        nic_no: nic,
        full_name: 'Bad Role',
        email: `${unique()}@example.test`,
        password: 'Str0ngPassw0rd!',
        role: 'SUPERADMIN',
        designation: 'Nope',
      },
    });

    assert.equal(status, 400);
  });

  it('rejects a password bcrypt cannot represent, with 400', async () => {
    // Phase 1 enforces only what is certainly wrong; the 10-character minimum is
    // EXECUTION_PLAN task 4.4 and lands in Phase 4. Asserting that minimum here
    // would test a policy this phase does not have.
    //
    // The 72-character cap is the one that must hold now: bcrypt reads only the
    // first 72 bytes, so a longer password would be accepted and then silently
    // truncated by the hash, leaving an account whose real password is not the
    // one that was set.
    const { status, body } = await request(baseUrl, 'POST', '/api/v1/users', {
      token: adminToken,
      body: {
        nic_no: track(testNic()),
        full_name: 'Too Long',
        email: `${unique()}@example.test`,
        password: 'a'.repeat(73),
        role: 'MINOR_STAFF',
        designation: 'Clerk',
      },
    });

    assert.equal(status, 400);
    assert.match(body.message, /password/i);
  });

  it('rejects an absent password with 400', async () => {
    const { status, body } = await request(baseUrl, 'POST', '/api/v1/users', {
      token: adminToken,
      body: {
        nic_no: track(testNic()),
        full_name: 'No Password',
        email: `${unique()}@example.test`,
        role: 'MINOR_STAFF',
        designation: 'Clerk',
      },
    });

    assert.equal(status, 400);
    assert.match(body.message, /password/i);
  });

  it('is refused to a non-admin', async () => {
    const { token } = await createAndLogin(baseUrl, { role: 'MINOR_STAFF' });

    const { status } = await request(baseUrl, 'POST', '/api/v1/users', {
      token,
      body: {
        nic_no: track(testNic()),
        full_name: 'Nope',
        email: `${unique()}@example.test`,
        password: 'Str0ngPassw0rd!',
        role: 'MINOR_STAFF',
        designation: 'Clerk',
      },
    });

    assert.equal(status, 403);
  });
});

describe('PATCH /api/v1/users/:id', () => {
  it('updates the named fields and leaves the rest alone', async () => {
    const nic = testNic();
    const created = await createUser({ nic_no: nic, role: 'MINOR_STAFF' });

    const { status, body } = await request(
      baseUrl,
      'PATCH',
      `/api/v1/users/${created.user.id}`,
      {
        token: adminToken,
        body: { full_name: 'Renamed By Test' },
      },
    );

    assert.equal(status, 200);
    assert.equal(body.data.full_name, 'Renamed By Test');
    assert.equal(body.data.role, 'MINOR_STAFF', 'role should be untouched');
    assert.equal(body.data.nic_no, nic);
  });

  it('refuses to let an admin change their own role, even upward', async () => {
    // Self-promotion is a privilege-escalation path. Enforced on role only: an
    // admin renaming themselves is harmless and should not be blocked.
    const { user, token } = await createAndLogin(baseUrl, { role: 'ADMIN' });

    const { status, body } = await request(
      baseUrl,
      'PATCH',
      `/api/v1/users/${user.id}`,
      { token, body: { role: 'SECRETARY' } },
    );

    assert.equal(status, 400);
    assert.match(body.message, /own role/i);
  });

  it('answers 404 for a user that does not exist', async () => {
    const { status } = await request(baseUrl, 'PATCH', '/api/v1/users/99999999', {
      token: adminToken,
      body: { full_name: 'Nobody' },
    });

    assert.equal(status, 404);
  });
});

describe('DELETE /api/v1/users/:id', () => {
  it('deactivates rather than deletes, and the row survives', async () => {
    // D23. A hard delete here would cascade away the user's audit history and
    // leave every action they ever took attributed to a missing id.
    const nic = testNic();
        const { user } = await createUser({ nic_no: nic, role: 'MINOR_STAFF' });

    const { status } = await request(baseUrl, 'DELETE', `/api/v1/users/${user.id}`, {
      token: adminToken,
    });
    assert.equal(status, 200);

    const [rows] = await pool.query('SELECT is_active FROM users WHERE id = ?', [user.id]);
    assert.equal(rows.length, 1, 'the row must still exist');
    assert.equal(rows[0].is_active, 0);
  });

  it('refuses to deactivate the caller', async () => {
    // Otherwise an admin can strand the system: no active admin, no way back in
    // through the UI.
    const { user, token } = await createAndLogin(baseUrl, { role: 'ADMIN' });

    const { status, body } = await request(baseUrl, 'DELETE', `/api/v1/users/${user.id}`, {
      token,
    });

    assert.equal(status, 400);
    assert.match(body.message, /own account/i);
  });

  it('never leaves the system with zero admins when two admins target each other at once', async () => {
    // This is the case D24 guards, and the reason the last-admin count runs
    // under SELECT ... FOR UPDATE inside the transaction.
    //
    // A single-threaded test cannot reach the guard at all: the only way to
    // reach zero active admins is for the last admin to deactivate itself, and
    // the self-delete 400 above catches that first. So the guard is written for
    // the race -- two admins each request the other's deletion at the same
    // moment. Without row locking both can count "one other admin" and both
    // proceed.
    //
    // "Exactly two admins" has to be arranged, not assumed. The fixture admin
    // from before() and the seeded demo admin are both active, and with a third
    // admin present BOTH requests are correctly allowed -- the guard's job is
    // to stop the last one, not to police pairs. So every active admin is
    // suspended first and the exact prior set is restored afterwards, which
    // also keeps this file's other tests and the demo data intact.
    const [activeAdmins] = await pool.query(
      "SELECT nic_no FROM users WHERE role = 'ADMIN' AND is_active = 1",
    );
    const wasActive = activeAdmins.map((row) => row.nic_no);

    await pool.query("UPDATE users SET is_active = 0 WHERE role = 'ADMIN' AND is_active = 1");

    const a = await createAndLogin(baseUrl, { role: 'ADMIN' });
    const b = await createAndLogin(baseUrl, { role: 'ADMIN' });

    try {
      const [resA, resB] = await Promise.all([
        request(baseUrl, 'DELETE', `/api/v1/users/${b.user.id}`, { token: a.token }),
        request(baseUrl, 'DELETE', `/api/v1/users/${a.user.id}`, { token: b.token }),
      ]);

      const statuses = [resA.status, resB.status].sort();
      assert.equal(
        statuses.filter((s) => s === 200).length,
        1,
        `expected exactly one success, got ${JSON.stringify(statuses)}`,
      );
      // The loser is refused, either by the last-admin guard (409) or, if the
      // deactivation beat its authentication, by the account being inactive
      // (401). Both are refusals; neither may be a 200 or a 500.
      const [loser] = statuses.filter((s) => s !== 200);
      assert.ok(
        [401, 409].includes(loser),
        `expected the loser to be refused with 401 or 409, got ${loser}`,
      );

      const [rows] = await pool.query(
        'SELECT COUNT(*) AS n FROM users WHERE role = ? AND is_active = 1 AND id IN (?, ?)',
        ['ADMIN', a.user.id, b.user.id],
      );
      assert.equal(rows[0].n, 1, 'exactly one of the two admins must survive');
    } finally {
      // Restore precisely what was active before, whatever the race did.
      await pool.query("UPDATE users SET is_active = 0 WHERE role = 'ADMIN'");
      for (const nic of wasActive) {
        await pool.query('UPDATE users SET is_active = 1 WHERE nic_no = ?', [nic]);
      }
    }
  });

  it('lets an admin deactivate a different admin while another remains', async () => {
    // The ordinary multi-admin case. The target must be someone else: an admin
    // cannot deactivate itself, which is the 400 above.
    const caller = await createAndLogin(baseUrl, { role: 'ADMIN' });
    const target = await createAndLogin(baseUrl, { role: 'ADMIN' });

    const { status } = await request(baseUrl, 'DELETE', `/api/v1/users/${target.user.id}`, {
      token: caller.token,
    });
    assert.equal(status, 200);

    // The caller is untouched -- it deactivated the other, not itself.
    const [rows] = await pool.query('SELECT is_active FROM users WHERE id = ?', [
      caller.user.id,
    ]);
    assert.equal(rows[0].is_active, 1);
  });

  it('is idempotent: deactivating an inactive user is not an error', async () => {
    // A client retrying a DELETE after a timeout is normal traffic, not a bug.
    const nic = testNic();
        const { user } = await createUser({ nic_no: nic, role: 'MINOR_STAFF' });

    const first = await request(baseUrl, 'DELETE', `/api/v1/users/${user.id}`, {
      token: adminToken,
    });
    const second = await request(baseUrl, 'DELETE', `/api/v1/users/${user.id}`, {
      token: adminToken,
    });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
  });
});

describe('GET /api/v1/users', () => {
  it('never includes password_hash on any row', async () => {
    const { status, body } = await request(baseUrl, 'GET', '/api/v1/users', {
      token: adminToken,
    });

    assert.equal(status, 200);
    assert.ok(body.data.length > 0);
    assert.equal(JSON.stringify(body).includes('password_hash'), false);
  });

  it('filters by role', async () => {
    const { status, body } = await request(baseUrl, 'GET', '/api/v1/users?role=MINOR_STAFF', {
      token: adminToken,
    });

    assert.equal(status, 200);
    for (const user of body.data) {
      assert.equal(user.role, 'MINOR_STAFF');
    }
  });

  it('rejects a nonsense filter with 400 instead of returning everything', async () => {
    const { status } = await request(baseUrl, 'GET', '/api/v1/users?role=NOPE', {
      token: adminToken,
    });

    assert.equal(status, 400);
  });
});
