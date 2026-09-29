/**
 * Department CRUD.
 *
 * Small surface, so this file is mostly about the two rules that are easy to get
 * wrong: that reading the directory is open to any signed-in user (the
 * department picker needs it), and that writes are not.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { pool } from '../config/db.js';
import { request, startServer } from './helpers/app.js';
import { cleanup, createAndLogin, unique } from './helpers/fixtures.js';

let baseUrl;
let close;
let adminToken;

/** Departments created here, removed in after() by code. */
const createdCodes = [];

function trackCode() {
  const code = `T${unique().replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toUpperCase()}`;
  createdCodes.push(code);
  return code;
}

before(async () => {
  ({ baseUrl, close } = await startServer());
  const admin = await createAndLogin(baseUrl, { role: 'ADMIN' });
    adminToken = admin.token;
});

after(async () => {
  if (createdCodes.length > 0) {
    const placeholders = createdCodes.map(() => '?').join(', ');
    await pool.query(`DELETE FROM departments WHERE code IN (${placeholders})`, createdCodes);
  }
  await cleanup();
  await close();
  await pool.end();
});

describe('GET /api/v1/departments', () => {
  it('is readable by any signed-in user, not just admins', async () => {
    // Q14. The department picker is needed on every form in the product, so
    // restricting this to admins would mean the frontend ships a list it cannot
    // fetch. The payload is a name and a code.
    const { user, token } = await createAndLogin(baseUrl, { role: 'MINOR_STAFF' });

    const { status, body } = await request(baseUrl, 'GET', '/api/v1/departments', { token });

    assert.equal(status, 200);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 7, 'the seven seeded departments should be present');
  });

  it('is not readable without a token', async () => {
    const { status } = await request(baseUrl, 'GET', '/api/v1/departments');
    assert.equal(status, 401);
  });

  it('returns one department by id', async () => {
    const list = await request(baseUrl, 'GET', '/api/v1/departments', {
      token: adminToken,
    });
    const target = list.body.data[0];

    const { status, body } = await request(baseUrl, 'GET', `/api/v1/departments/${target.id}`, {
      token: adminToken,
    });

    assert.equal(status, 200);
    assert.equal(body.data.id, target.id);
  });

  it('answers 404 for a department that does not exist', async () => {
    const { status } = await request(baseUrl, 'GET', '/api/v1/departments/99999999', {
      token: adminToken,
    });
    assert.equal(status, 404);
  });
});

describe('POST /api/v1/departments', () => {
  it('creates a department and uppercases the code', async () => {
    const code = trackCode();

    const { status, body } = await request(baseUrl, 'POST', '/api/v1/departments', {
      token: adminToken,
      body: { name: 'Test Department', code: code.toLowerCase() },
    });

    assert.equal(status, 201);
    // Codes are stored uppercase so the value matches what the UI displays and
    // so a case difference cannot produce two departments that look identical.
    assert.equal(body.data.code, code);
  });

  it('answers 409 for a duplicate code', async () => {
    const code = trackCode();
    const payload = { name: 'First', code };

    const first = await request(baseUrl, 'POST', '/api/v1/departments', {
      token: adminToken,
      body: payload,
    });
    assert.equal(first.status, 201);

    const second = await request(baseUrl, 'POST', '/api/v1/departments', {
      token: adminToken,
      body: { name: 'Second', code: code.toLowerCase() },
    });
    assert.equal(second.status, 409);
  });

  it('is refused to a non-admin', async () => {
    const { token } = await createAndLogin(baseUrl, { role: 'SUBJECT_CLERK' });

    const { status } = await request(baseUrl, 'POST', '/api/v1/departments', {
      token,
      body: { name: 'Nope', code: trackCode() },
    });

    assert.equal(status, 403);
  });

  it('rejects a missing name with 400', async () => {
    const { status, body } = await request(baseUrl, 'POST', '/api/v1/departments', {
      token: adminToken,
      body: { code: trackCode() },
    });

    assert.equal(status, 400);
    assert.match(body.message, /name/i);
  });
});

describe('PATCH /api/v1/departments/:id', () => {
  it('renames a department', async () => {
    const code = trackCode();
    const created = await request(baseUrl, 'POST', '/api/v1/departments', {
      token: adminToken,
      body: { name: 'Original Name', code },
    });

    const { status, body } = await request(
      baseUrl,
      'PATCH',
      `/api/v1/departments/${created.body.data.id}`,
      { token: adminToken, body: { name: 'Renamed Department' } },
    );

    assert.equal(status, 200);
    assert.equal(body.data.name, 'Renamed Department');
    assert.equal(body.data.code, code, 'the code must not change on a rename');
  });

  it('is refused to a non-admin', async () => {
    const { token } = await createAndLogin(baseUrl, { role: 'OFFICER' });
    const { status } = await request(baseUrl, 'PATCH', '/api/v1/departments/1', {
      token,
      body: { name: 'Nope' },
    });

    assert.equal(status, 403);
  });
});
