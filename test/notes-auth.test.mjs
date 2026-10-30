import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { readFile } from 'node:fs/promises';

const ACCOUNT_A = '10000000-0000-4000-8000-000000000001';
const ACCOUNT_B = '10000000-0000-4000-8000-000000000002';
const NOTE_ID = '20000000-0000-4000-8000-000000000001';

// These tests exercise the API gate with a simulated verifier result, not A login.
const config = {
  identityProvider: { issuer: 'https://auth-fixture.supabase.co/auth/v1' },
};
let verifiedHeaders = [];
let verifierThrows = false;
mock.module('../aleph.config.json', { defaultExport: config });
mock.module('../src/verify-login.mjs', {
  namedExports: {
    createLoginVerifier: () => async authorization => {
      verifiedHeaders.push(authorization);
      if (verifierThrows) throw new Error('simulated failure');
      return authorization === 'Bearer test-approved'
        ? { kind: 'student', userId: ACCOUNT_A }
        : authorization === 'Bearer test-approved-b'
          ? { kind: 'student', userId: ACCOUNT_B } : null;
    },
  },
});
const { default: handler } = await import('../api/notes.js');
function response() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('API gate rejects absent/invalid credentials before reading DB; accepts only verifier success', async () => {
  const previousFetch = globalThis.fetch;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  let reads = 0;
  process.env.SUPABASE_URL = 'https://auth-fixture.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-only';
  globalThis.fetch = async () => {
    reads++;
    return new Response(JSON.stringify([{ id: NOTE_ID, title: 'test', content: 'test', owner_id: ACCOUNT_A }]));
  };
  try {
    for (const authorization of [undefined, '', 'Basic test', ['Bearer test-approved'], 'Bearer test-invalid']) {
      const res = response();
      await handler({ method: 'GET', headers: { authorization }, query: { userId: 'A', role: 'admin' } }, res);
      assert.equal(res.statusCode, 401);
      assert.equal('notes' in res.body, false);
    }
    assert.equal(reads, 0);
    assert.deepEqual(verifiedHeaders, ['Bearer test-invalid']);

    const success = response();
    await handler({ method: 'GET', headers: { authorization: 'Bearer test-approved' } }, success);
    assert.equal(success.statusCode, 200);
    assert.equal(success.body.length, 1);
    assert.equal(reads, 1);

    verifierThrows = true;
    const unavailable = response();
    await handler({ method: 'GET', headers: { authorization: 'Bearer test-approved' } }, unavailable);
    assert.equal(unavailable.statusCode, 503);
    assert.deepEqual(unavailable.body, { error: 'LOGIN_UNAVAILABLE' });
    assert.equal(reads, 1);
    verifierThrows = false;

    process.env.SUPABASE_URL = 'https://other-fixture.supabase.co';
    const mismatch = response();
    await handler({ method: 'GET', headers: { authorization: 'Bearer test-approved' } }, mismatch);
    assert.equal(mismatch.statusCode, 503);
    assert.equal(reads, 1);

    const method = response();
    await handler({ method: 'DELETE', headers: {} }, method);
    assert.equal(method.statusCode, 405);
    assert.equal(reads, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
  }
});

test('simulated A CRUD follows the public contract and anonymous requests never reach DB', async () => {
  const previousFetch = globalThis.fetch;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  const records = new Map();
  let reads = 0;
  process.env.SUPABASE_URL = 'https://auth-fixture.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-only';
  const routing = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url)));
  assert.deepEqual(routing.rewrites, [{ source: '/api/notes/:id', destination: '/api/notes?noteId=:id' }]);
  const actualConfig = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url)));
  assert.deepEqual(actualConfig.allowedRoutes, [
    'GET /api/notes', 'POST /api/notes', 'GET /api/notes/:id',
    'PUT /api/notes/:id', 'DELETE /api/notes/:id',
  ]);
  globalThis.fetch = async (url, options) => {
    reads++;
    assert.equal(url.pathname, '/rest/v1/training_notes');
    const id = url.searchParams.get('id')?.slice(3);
    const input = options.body ? JSON.parse(options.body) : null;
    let rows;
    if (options.method === 'POST') {
      assert.equal(input.owner_id, ACCOUNT_A);
      assert.equal('userId' in input, false);
      assert.equal('role' in input, false);
      if (records.has(input.id)) return new Response('{}', { status: 409 });
      records.set(input.id, input);
      rows = [input];
    } else if (options.method === 'GET' && !id) {
      assert.equal(url.searchParams.get('owner_id'), `eq.${ACCOUNT_A}`);
      rows = [...records.values()].filter(row => row.owner_id === ACCOUNT_A);
    } else {
      const candidate = records.get(id);
      const row = candidate?.owner_id === url.searchParams.get('owner_id')?.slice(3) ? candidate : undefined;
      if (row && options.method === 'PATCH') {
        assert.deepEqual(Object.keys(input).sort(), ['content', 'owner_id', 'title']);
        assert.equal(input.owner_id, ACCOUNT_A);
        Object.assign(row, input);
      }
      rows = row ? [row] : [];
      if (row && options.method === 'DELETE') records.delete(id);
    }
    return new Response(JSON.stringify(rows));
  };
  async function call(method, path = '/api/notes', body, loggedIn = true) {
    const match = /^\/api\/notes\/([^/]+)$/u.exec(path);
    const query = match ? { noteId: match[1] } : {};
    const res = response();
    await handler({ method, url: path, query, body, headers: {
      ...(loggedIn ? { authorization: 'Bearer test-approved' } : {}), 'content-type': 'application/json',
    } }, res);
    return res;
  }
  try {
    for (const [method, path] of [['GET', '/api/notes'], ['POST', '/api/notes'],
      ['GET', `/api/notes/${NOTE_ID}`], ['PUT', `/api/notes/${NOTE_ID}`], ['DELETE', `/api/notes/${NOTE_ID}`]]) {
      const result = await call(method, path, { userId: ACCOUNT_A, role: 'admin', title: 'test', body: 'test' }, false);
      assert.equal(result.statusCode, 401);
      assert.deepEqual(result.body, { error: 'LOGIN_REQUIRED' });
    }
    assert.equal(reads, 0);
    const created = await call('POST', '/api/notes', { title: 'test', body: 'test', owner_id: 'untrusted', role: 'admin' });
    assert.equal(created.statusCode, 201);
    assert.deepEqual(Object.keys(created.body), ['id']);
    assert.match(created.body.id, /^[0-9a-f-]{36}$/u);
    const path = `/api/notes/${created.body.id}`;
    assert.deepEqual((await call('GET', path)).body, { id: created.body.id, title: 'test', body: 'test' });
    assert.deepEqual((await call('GET')).body, [{ id: created.body.id, title: 'test', body: 'test' }]);
    assert.equal((await call('PUT', path, { title: 'updated', body: 'updated', owner_id: 'untrusted' })).statusCode, 403);
    const updated = await call('PUT', path, { title: 'updated', body: 'updated' });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.body.body, 'updated');
    assert.equal(records.get(created.body.id).owner_id, ACCOUNT_A);
    assert.equal((await call('DELETE', path)).statusCode, 200);
    assert.equal((await call('GET', path)).statusCode, 404);
    assert.equal((await call('PUT', path, { title: 'test', body: 'test' })).statusCode, 404);
    assert.equal((await call('DELETE', path)).statusCode, 404);
    assert.deepEqual((await call('GET')).body, []);
    assert.deepEqual((await call('POST', '/api/notes', { id: NOTE_ID, title: 'test', body: 'test' })).body, { id: NOTE_ID });
    assert.equal((await call('POST', '/api/notes', { id: NOTE_ID, title: 'test', body: 'test' })).statusCode, 409);
    const beforeInvalid = reads;
    assert.equal((await call('POST', '/api/notes', { id: 'invalid', title: 'test', body: 'test' })).statusCode, 400);
    assert.equal((await call('GET', '/api/notes/invalid')).statusCode, 400);
    assert.equal((await call('POST', '/api/notes', '{')).statusCode, 400);
    assert.equal(reads, beforeInvalid);
  } finally {
    globalThis.fetch = previousFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
  }
});

test('simulated A/B retain own CRUD and cannot access or transfer another owner\'s notes', async () => {
  const previousFetch = globalThis.fetch;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = 'https://auth-fixture.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-only';
  const legacyIds = ['sample_note_1', 'sample_note_2', 'sample_note_3', 'sample_note_4'];
  const unownedId = '30000000-0000-4000-8000-000000000001';
  const records = new Map(legacyIds.map(id => [id, { id, owner_id: ACCOUNT_A, title: 'test', content: 'test' }]));
  records.set(unownedId, { id: unownedId, owner_id: null, title: 'test', content: 'test' });
  globalThis.fetch = async (url, options) => {
    const owner = url.searchParams.get('owner_id')?.slice(3);
    const id = url.searchParams.get('id')?.slice(3);
    const input = options.body ? JSON.parse(options.body) : null;
    let rows;
    if (options.method === 'POST') {
      assert.ok([ACCOUNT_A, ACCOUNT_B].includes(input.owner_id));
      if (records.has(input.id)) return new Response('{}', { status: 409 });
      records.set(input.id, { ...input });
      rows = [input];
    } else {
      assert.ok([ACCOUNT_A, ACCOUNT_B].includes(owner), 'Every read/update/delete must filter by verified owner');
      if (!id) {
        rows = [...records.values()].filter(row => row.owner_id === owner);
      } else {
        const candidate = records.get(id);
        const row = candidate?.owner_id === owner ? candidate : undefined;
        if (row && options.method === 'PATCH') {
          assert.equal(input.owner_id, owner, 'New row owner must equal the old row owner');
          assert.deepEqual(Object.keys(input).sort(), ['content', 'owner_id', 'title']);
          Object.assign(row, input);
        }
        rows = row ? [{ ...row }] : [];
        if (row && options.method === 'DELETE') records.delete(id);
      }
    }
    return new Response(JSON.stringify(rows));
  };
  async function call(account, method, id, body, query = {}) {
    const res = response();
    await handler({ method, body, query: { ...query, ...(id ? { noteId: id } : {}) }, headers: {
      authorization: account === 'A' ? 'Bearer test-approved' : 'Bearer test-approved-b',
      'content-type': 'application/json',
    } }, res);
    return res;
  }
  try {
    const created = {};
    for (const account of ['A', 'B']) {
      const owner = account === 'A' ? ACCOUNT_A : ACCOUNT_B;
      const otherOwner = account === 'A' ? ACCOUNT_B : ACCOUNT_A;
      const added = await call(account, 'POST', null, { title: 'test', body: 'test', owner_id: otherOwner });
      assert.equal(added.statusCode, 201);
      created[account] = added.body.id;
      assert.equal(records.get(added.body.id).owner_id, owner);
      const own = await call(account, 'GET', added.body.id);
      assert.equal(own.statusCode, 200);
      assert.deepEqual(own.body, { id: added.body.id, title: 'test', body: 'test' });
      const edited = await call(account, 'PUT', added.body.id, { title: 'updated', body: 'updated' });
      assert.equal(edited.statusCode, 200);
      assert.deepEqual(edited.body, { id: added.body.id, title: 'updated', body: 'updated' });
      for (const attemptedOwner of [otherOwner, owner, null]) {
        const transfer = await call(account, 'PUT', added.body.id, { title: 'forbidden', body: 'forbidden', owner_id: attemptedOwner });
        assert.equal(transfer.statusCode, 403);
        assert.deepEqual(transfer.body, { error: 'OWNER_CHANGE_FORBIDDEN' });
        assert.equal(records.get(added.body.id).owner_id, owner);
        assert.equal(records.get(added.body.id).title, 'updated');
      }
    }
    for (const account of ['A', 'B']) {
      const owner = account === 'A' ? ACCOUNT_A : ACCOUNT_B;
      const other = created[account === 'A' ? 'B' : 'A'];
      for (const method of ['GET', 'PUT', 'DELETE']) {
        const denied = await call(account, method, other, method === 'PUT' ? { title: 'forbidden', body: 'forbidden' } : undefined,
          { owner_id: records.get(other).owner_id, userId: records.get(other).owner_id, role: 'admin' });
        assert.equal(denied.statusCode, 404);
        assert.deepEqual(denied.body, { error: 'NOTE_NOT_FOUND' });
        assert.equal(records.get(other).title, 'updated');
        assert.equal((await call(account, method, unownedId, method === 'PUT' ? { title: 'test', body: 'test' } : undefined)).statusCode, 404);
      }
      const list = await call(account, 'GET', null, undefined, { owner_id: account === 'A' ? ACCOUNT_B : ACCOUNT_A });
      assert.equal(list.statusCode, 200);
      assert.ok(list.body.length > 0);
      for (const note of list.body) {
        assert.equal(records.get(note.id).owner_id, owner);
        assert.deepEqual(Object.keys(note).sort(), ['body', 'id', 'title']);
      }
      const collision = await call(account, 'POST', null, { id: other, title: 'forbidden', body: 'forbidden' });
      assert.equal(collision.statusCode, 409);
      assert.equal(records.get(other).title, 'updated');
    }
    for (const id of legacyIds) {
      assert.equal((await call('A', 'GET', id)).statusCode, 200);
      assert.equal((await call('B', 'GET', id)).statusCode, 404);
      assert.equal((await call('A', 'PUT', id, { title: 'legacy updated', body: 'test' })).statusCode, 200);
      assert.equal((await call('A', 'DELETE', id)).statusCode, 200);
      assert.equal((await call('A', 'GET', id)).statusCode, 404);
    }
    for (const account of ['A', 'B']) {
      assert.equal((await call(account, 'DELETE', created[account])).statusCode, 200);
      assert.equal((await call(account, 'GET', created[account])).statusCode, 404);
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
  }
});
