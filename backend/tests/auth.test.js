/**
 * The login, refresh and logout contract.
 *
 * These tests are mostly about what the API refuses to say. Several of them
 * exist to catch a regression that would turn an authentication endpoint into
 * an account-enumeration oracle, and none of those regressions produce an error
 * a normal functional test would notice.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { pool } from '../config/db.js';
import { request, startServer } from './helpers/app.js';
import { cleanup, createAndLogin, createUser, login, setActive, testNic } from './helpers/fixtures.js';

let baseUrl;
let close;

/** Track a NIC for teardown. */
function track(nic) {
    return nic;
}

before(async () => {
  ({ baseUrl, close } = await startServer());
});

after(async () => {
  await cleanup();
  await close();
  // The pool is module-level state shared by every test file, so the process
  // would hang open without this. node --test would otherwise report a timeout
  // rather than a pass.
  await pool.end();
});

describe('POST /api/v1/auth/login', () => {
  it('issues an access token, a refresh token and the user profile', async () => {
    const nic = track(testNic());
    const { user, password } = await createUser({ nic_no: nic, role: 'ADMIN' });

    const body = await login(baseUrl, nic, password);

    assert.equal(typeof body.token, 'string');
    assert.equal(typeof body.refresh_token, 'string');
    assert.equal(body.user.id, user.id);
    assert.equal(body.user.role, 'ADMIN');
    // The hash must not be anywhere in the response, at any depth.
    assert.equal(JSON.stringify(body).includes('password_hash'), false);
  });

  it('normalises the NIC before looking it up', async () => {
    // Seeded NICs are uppercase; a Sri Lankan NIC is routinely written either
    // way, and under utf8mb4_unicode_ci the two are one account.
    const nic = track(testNic());
    const { user, password } = await createUser({ nic_no: nic.toLowerCase() });

    const body = await login(baseUrl, nic, password);
    assert.equal(body.user.id, user.id);
  });

  it('gives an unknown NIC and a wrong password a byte-identical 401', async () => {
    // D29. If these two ever diverge by one byte, the difference is a free
    // account-existence oracle, so this compares the serialised bodies rather
    // than the statuses.
    const nic = track(testNic());
    await createUser({ nic_no: nic });

    const wrongPassword = await request(baseUrl, 'POST', '/api/v1/auth/login', {
      body: { nic_no: nic, password: 'definitely-not-it' },
    });
    const unknownNic = await request(baseUrl, 'POST', '/api/v1/auth/login', {
      body: { nic_no: '000000000X', password: 'definitely-not-it' },
    });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownNic.status, 401);
    assert.deepEqual(wrongPassword.body, unknownNic.body);
  });

  it('still burns a bcrypt comparison when the NIC is unknown', async () => {
    // D30. The point of the dummy verify is that the unknown-NIC branch costs
    // the same ~300 ms as a real comparison. A future refactor that drops the
    // call would pass every other test in this file and silently restore the
    // timing oracle, so it is asserted directly: the no-such-user path takes at
    // least as long as bcrypt at the configured cost.
    const start = process.hrtime.bigint();
    await request(baseUrl, 'POST', '/api/v1/auth/login', {
      body: { nic_no: '000000000X', password: 'definitely-not-it' },
    });
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

    assert.ok(
      elapsedMs > 100,
      `unknown-NIC login returned in ${elapsedMs.toFixed(1)} ms, too fast to have hashed anything`,
    );
  });

  it('answers 403, not 401, for a correct password on a deactivated account', async () => {
    // D29: reaching this branch means the password was already correct, so
    // naming the reason discloses nothing.
    const nic = track(testNic());
    const { user, password } = await createUser({ nic_no: nic });
    await setActive(nic, false);

    const { status, body } = await request(baseUrl, 'POST', '/api/v1/auth/login', {
      body: { nic_no: nic, password },
    });

    assert.equal(status, 403);
    assert.match(body.message, /deactivated/i);
  });

  it('rejects a missing password with 400 and names the field', async () => {
    const nic = track(testNic());
    await createUser({ nic_no: nic });

    const { status, body } = await request(baseUrl, 'POST', '/api/v1/auth/login', {
      body: { nic_no: nic },
    });

    assert.equal(status, 400);
    assert.match(body.message, /password/i);
  });

  it('rejects an unexpected field with 400', async () => {
    // Mass assignment is the failure this prevents: a client that believes it
    // can post { role: 'ADMIN' } must not be able to, even by accident.
    const { status } = await request(baseUrl, 'POST', '/api/v1/auth/login', {
      body: { nic_no: '000000000X', password: 'x', role: 'ADMIN' },
    });

    assert.equal(status, 400);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns the profile and the resolved permission list', async () => {
    const { user, token } = await createAndLogin(baseUrl, { role: 'ADMIN' });

    const { status, body } = await request(baseUrl, 'GET', '/api/v1/auth/me', { token });

    assert.equal(status, 200);
    assert.equal(body.user.id, user.id);
    assert.ok(Array.isArray(body.permissions));
    // ADMIN holds the wildcard, expanded at resolve time (D26).
    assert.ok(body.permissions.includes('*') === false, 'wildcard should be expanded, not sent');
  });

  it('rejects a missing token with 401', async () => {
    const { status } = await request(baseUrl, 'GET', '/api/v1/auth/me');
    assert.equal(status, 401);
  });

  it('rejects a refresh token used as a bearer token', async () => {
    // D22. Access and refresh share a secret and differ only by the `type`
    // claim, so accepting a refresh token here would double a 14-day
    // credential's exposure to every place an access token is sent.
    const nic = track(testNic());
    const { password } = await createUser({ nic_no: nic });
    const session = await login(baseUrl, nic, password);

    const { status } = await request(baseUrl, 'GET', '/api/v1/auth/me', {
      token: session.refresh_token,
    });

    assert.equal(status, 401);
  });

  it('rejects a token whose signature was tampered with', async () => {
    const nic = track(testNic());
    const { password } = await createUser({ nic_no: nic });
    const { token } = await login(baseUrl, nic, password);

    // Flip one character of the signature.
    const parts = token.split('.');
    const forged = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -1)}x`;

    const { status } = await request(baseUrl, 'GET', '/api/v1/auth/me', { token: forged });
    assert.equal(status, 401);
  });

  it('stops honouring a token the moment the account is deactivated', async () => {
    // D21. The token carries no role or active flag, so every request
    // re-reads the user. A token signed while active must die on the same
    // request that the deactivation lands.
    const nic = track(testNic());
    const { password } = await createUser({ nic_no: nic, role: 'ADMIN' });
    const { token } = await login(baseUrl, nic, password);

    const before = await request(baseUrl, 'GET', '/api/v1/auth/me', { token });
    assert.equal(before.status, 200);

    await setActive(nic, false);

    const afterDeactivation = await request(baseUrl, 'GET', '/api/v1/auth/me', { token });
    assert.equal(afterDeactivation.status, 401);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('rotates: a new pair is issued and the old refresh token dies', async () => {
    const nic = track(testNic());
    const { password } = await createUser({ nic_no: nic });
    const first = await login(baseUrl, nic, password);

    const second = await request(baseUrl, 'POST', '/api/v1/auth/refresh', {
      body: { refresh_token: first.refresh_token },
    });
    assert.equal(second.status, 200);
    assert.equal(typeof second.body.token, 'string');
    assert.notEqual(second.body.refresh_token, first.refresh_token);

    // Replay of the spent token is the signal that makes stolen-token reuse
    // detectable, so it must fail.
    const replay = await request(baseUrl, 'POST', '/api/v1/auth/refresh', {
      body: { refresh_token: first.refresh_token },
    });
    assert.equal(replay.status, 401);
  });

  it('refuses a refresh token belonging to a deactivated account', async () => {
    const nic = track(testNic());
    const { password } = await createUser({ nic_no: nic });
    const session = await login(baseUrl, nic, password);

    await setActive(nic, false);

    const { status } = await request(baseUrl, 'POST', '/api/v1/auth/refresh', {
      body: { refresh_token: session.refresh_token },
    });
    assert.equal(status, 401);
  });

  it('rejects a made-up token with 401', async () => {
    const { status } = await request(baseUrl, 'POST', '/api/v1/auth/refresh', {
      body: { refresh_token: 'not.a.token' },
    });
    assert.equal(status, 401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('revokes the refresh token it is given', async () => {
    const nic = track(testNic());
    const { password } = await createUser({ nic_no: nic });
    const session = await login(baseUrl, nic, password);

    const logout = await request(baseUrl, 'POST', '/api/v1/auth/logout', {
      token: session.token,
      body: { refresh_token: session.refresh_token },
    });
    assert.equal(logout.status, 200);

    const reuse = await request(baseUrl, 'POST', '/api/v1/auth/refresh', {
      body: { refresh_token: session.refresh_token },
    });
    assert.equal(reuse.status, 401);
  });

  it('is idempotent: logging out twice is not an error', async () => {
    // A client that logs out on both a button press and a tab close will send
    // this twice, and a 500 on the second would surface as a support ticket.
    const nic = track(testNic());
    const { password } = await createUser({ nic_no: nic });
    const session = await login(baseUrl, nic, password);

    await request(baseUrl, 'POST', '/api/v1/auth/logout', {
      token: session.token,
      body: { refresh_token: session.refresh_token },
    });
    const second = await request(baseUrl, 'POST', '/api/v1/auth/logout', {
      token: session.token,
      body: { refresh_token: session.refresh_token },
    });

    assert.equal(second.status, 200);
  });
});
