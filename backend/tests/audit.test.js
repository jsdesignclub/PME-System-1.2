/**
 * The audit trail: that writes are recorded, that reads can find them, and that
 * the recorded content does not leak credentials.
 *
 * The last of those is the reason this file exists. An audit row is a copy of
 * a row from another table, written on every change, and it is the easiest
 * place in a system to accidentally persist a password hash at rest. The
 * redaction tests are the ones worth failing over.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { pool } from '../config/db.js';
import { computeDelta, deltaIsEmpty, redact } from '../models/auditModel.js';
import { request, startServer } from './helpers/app.js';
import { cleanup, createAndLogin, createUser, testNic } from './helpers/fixtures.js';

let baseUrl;
let close;
let adminToken;
const createdUserIds = [];

before(async () => {
  ({ baseUrl, close } = await startServer());
  const admin = await createAndLogin(baseUrl, { role: 'ADMIN' });
    adminToken = admin.token;
});

after(async () => {
  if (createdUserIds.length > 0) {
    const placeholders = createdUserIds.map(() => '?').join(', ');
    await pool.query(`DELETE FROM audit_logs WHERE entity_id IN (${placeholders}) AND entity_type = 'user'`, createdUserIds);
  }
  await cleanup();
  await close();
  await pool.end();
});

describe('redaction', () => {
  it('replaces password hashes and token material with a marker', () => {
    const input = {
      id: 7,
      nic_no: '881234567V',
      password_hash: '$2b$12$abcdefghijklmnopqrstuv',
      refresh_token: 'eyJhbGciOiJIUzI1NiJ9.payload.signature',
      api_token: 'sk-live-abc123',
      full_name: 'Real Name',
    };

    const output = redact(input);

    // The key is kept and the value replaced, not the key dropped. The shape of
    // the delta is then stable across rows -- a reader can see that a password
    // was set without the value ever being stored, which is the whole point.
    assert.equal(output.password_hash, '[redacted]');
    assert.equal(output.refresh_token, '[redacted]');
    assert.equal(output.api_token, '[redacted]');
    // Non-sensitive fields survive, or the audit row is useless.
    assert.equal(output.nic_no, '881234567V');
    assert.equal(output.full_name, 'Real Name');
    assert.equal(output.id, 7);
  });

  it('matches secret-looking keys regardless of case or separator style', () => {
    // The schema uses snake_case, but a future column could be camelCase, and
    // the rule should not depend on that.
    const output = redact({
      passwordHash: 'x',
      PASSWORD: 'y',
      password: 'z',
      access_token: 'a',
      sessionToken: 'b',
      clientSecret: 'c',
      keep_me: 'd',
    });

    assert.deepEqual(output, {
      passwordHash: '[redacted]',
      PASSWORD: '[redacted]',
      password: '[redacted]',
      access_token: '[redacted]',
      sessionToken: '[redacted]',
      clientSecret: '[redacted]',
      keep_me: 'd',
    });
  });

  it('redacts secrets nested inside objects and arrays', () => {
    // A caller that captured a whole request body buries `password` a level
    // down, and a shallow filter would wave it through.
    const output = redact({
      user: { name: 'Real', password: 'secret' },
      list: [{ token: 'abc' }, { fine: 1 }],
    });

    assert.equal(output.user.password, '[redacted]');
    assert.equal(output.user.name, 'Real');
    assert.equal(output.list[0].token, '[redacted]');
    assert.equal(output.list[1].fine, 1);
  });

  it('leaves null and non-object values alone', () => {
    assert.equal(redact(null), null);
    assert.deepEqual(redact({ a: null, b: { c: 1 } }), { a: null, b: { c: 1 } });
  });
});

describe('delta computation', () => {
  it('reports only the fields that actually changed', () => {
    const before = { id: 1, full_name: 'Old Name', role: 'MINOR_STAFF' };
    const after = { id: 1, full_name: 'New Name', role: 'MINOR_STAFF' };

    const delta = computeDelta(before, after);

    assert.deepEqual(Object.keys(delta.before), ['full_name']);
    assert.deepEqual(Object.keys(delta.after), ['full_name']);
  });

  it('reports a no-op change as empty', () => {
    const row = { id: 1, full_name: 'Same' };
    assert.equal(deltaIsEmpty(computeDelta(row, { ...row })), true);
  });
});

describe('audit writing', () => {
  it('records a successful login with the actor and the outcome', async () => {
    const nic = testNic();
        const { user, password } = await createUser({ nic_no: nic });

    const before = await request(baseUrl, 'GET', '/api/v1/audit?limit=1', {
      token: adminToken,
    });
    const beforeMax = before.body.data[0]?.id ?? 0;

    await request(baseUrl, 'POST', '/api/v1/auth/login', {
      body: { nic_no: nic, password },
    });

    const { status, body } = await request(
      baseUrl,
      'GET',
      '/api/v1/audit?action=LOGIN_SUCCESS&limit=50',
      { token: adminToken },
    );

    assert.equal(status, 200);

    // Found by what the row records, not by the order rows happen to come back
    // in: an auth row names the user by id, and the default ordering puts other
    // tests' logins in between.
    const entry = body.data.find((row) => row.user_id === user.id);
    assert.ok(entry, 'no audit row was written for the login');
    assert.equal(entry.action, 'LOGIN_SUCCESS');
    assert.equal(entry.entity_type, 'auth');
    assert.ok(entry.id > beforeMax, 'the login row was not newly written');
    assert.equal(entry.ip_address !== undefined, true);
    assert.ok(entry.created_at, 'an audit row without a timestamp is not an audit row');
  });

  it('records failed logins, including ones for unknown NICs', async () => {
    // The negative attempts are the ones an audit trail exists to surface.
    const nic = testNic();
        await createUser({ nic_no: nic });

    await request(baseUrl, 'POST', '/api/v1/auth/login', {
      body: { nic_no: nic, password: 'wrong-one' },
    });
    await request(baseUrl, 'POST', '/api/v1/auth/login', {
      body: { nic_no: '000000000X', password: 'wrong-one' },
    });

    const { body } = await request(baseUrl, 'GET', '/api/v1/audit?limit=200', {
      token: adminToken,
    });

    const badPassword = body.data.filter((r) => r.action === 'LOGIN_FAILED_BAD_PASSWORD');
    const unknownNic = body.data.filter((r) => r.action === 'LOGIN_FAILED_UNKNOWN_NIC');

    assert.ok(badPassword.length > 0, 'a wrong-password attempt went unrecorded');
    assert.ok(unknownNic.length > 0, 'an unknown-NIC attempt went unrecorded');
  });

  it('never writes a password hash into the audit trail', async () => {
    // The whole point of the redaction layer, checked against real data rather
    // than a unit test of the redactor.
    const nic = testNic();
        const { user } = await createUser({ nic_no: nic, role: 'MINOR_STAFF' });
    createdUserIds.push(user.id);

    // A create, an update and a deactivation: all three take a row and write it
    // into action_delta.
    await request(baseUrl, 'PATCH', `/api/v1/users/${user.id}`, {
      token: adminToken,
      body: { full_name: 'Renamed For Audit Test' },
    });
    await request(baseUrl, 'DELETE', `/api/v1/users/${user.id}`, { token: adminToken });

    const { body } = await request(baseUrl, 'GET', '/api/v1/audit?limit=500', {
      token: adminToken,
    });

    const serialised = JSON.stringify(body.data);
    assert.equal(serialised.includes('password_hash'), false, 'a password_hash reached the audit trail');
    assert.equal(serialised.includes('$2b$'), false, 'a bcrypt hash reached the audit trail');
  });

  it('records who deactivated a user, not just that it happened', async () => {
    const nic = testNic();
        const { user } = await createUser({ nic_no: nic, role: 'MINOR_STAFF' });
    createdUserIds.push(user.id);

    await request(baseUrl, 'DELETE', `/api/v1/users/${user.id}`, { token: adminToken });

    const [rows] = await pool.query(
      "SELECT user_id, action, entity_id FROM audit_logs WHERE action = 'USER_DEACTIVATED' AND entity_id = ?",
      [String(user.id)],
    );

    assert.ok(rows.length > 0, 'the deactivation was not audited');
    assert.ok(rows[0].user_id, 'the audit row has no actor');
  });
});

describe('audit reading', () => {
  it('is refused to a non-admin', async () => {
    // The trail shows who did what across the whole system, so it is not
    // something every signed-in user can read.
    const { token } = await createAndLogin(baseUrl, { role: 'MINOR_STAFF' });

    const { status } = await request(baseUrl, 'GET', '/api/v1/audit', { token });
    assert.equal(status, 403);
  });

  it('is refused without a token', async () => {
    const { status } = await request(baseUrl, 'GET', '/api/v1/audit');
    assert.equal(status, 401);
  });

  it('returns one entry by id', async () => {
    const { body } = await request(baseUrl, 'GET', '/api/v1/audit?limit=1', {
      token: adminToken,
    });
    const target = body.data[0];
    if (!target) return; // nothing audited yet; the other tests cover writing

    const { status, body: single } = await request(
      baseUrl,
      'GET',
      `/api/v1/audit/${target.id}`,
      { token: adminToken },
    );

    assert.equal(status, 200);
    assert.equal(single.data.id, target.id);
  });

  it('answers 404 for an entry that does not exist', async () => {
    const { status } = await request(baseUrl, 'GET', '/api/v1/audit/99999999', {
      token: adminToken,
    });
    assert.equal(status, 404);
  });

  it('filters by action', async () => {
    const { body } = await request(baseUrl, 'GET', '/api/v1/audit?action=LOGIN_SUCCESS', {
      token: adminToken,
    });

    for (const row of body.data) {
      assert.equal(row.action, 'LOGIN_SUCCESS');
    }
  });

  it('exposes no write route at all', async () => {
    // There is no POST/PUT/DELETE for audit entries by design (D42). A client
    // that tries gets a 404 from the router rather than a permission error,
    // because the route does not exist to be permitted.
    for (const [method, path] of [
      ['POST', '/api/v1/audit'],
      ['PUT', '/api/v1/audit/1'],
      ['DELETE', '/api/v1/audit/1'],
    ]) {
      const { status } = await request(baseUrl, method, path, {
        token: adminToken,
        body: { action: 'FAKE' },
      });
      assert.equal(status, 404, `${method} ${path} should not exist`);
    }
  });
});
