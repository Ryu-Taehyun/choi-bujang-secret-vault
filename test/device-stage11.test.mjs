import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createDeviceGate } from '../public/device-gate.mjs';

const ACCOUNT_A = '10000000-0000-4000-8000-000000000001';
const ACCOUNT_B = '10000000-0000-4000-8000-000000000002';
const cookie = 'c'.repeat(43);
const hash = createHash('sha256').update(cookie).digest('hex');
mock.module('../aleph.config.json', { defaultExport: {
  identityProvider: { issuer: 'https://auth-fixture.supabase.co/auth/v1' },
  publicAppUrl: 'https://vault-fixture.vercel.app/',
} });
mock.module('../src/verify-login.mjs', { namedExports: {
  createLoginVerifier: () => async value => ['Bearer fixture-a', 'Bearer fixture.header.signature'].includes(value)
    ? { kind: 'student', userId: ACCOUNT_A } : value === 'Bearer fixture-b'
      ? { kind: 'student', userId: ACCOUNT_B } : value === 'Bearer fixture-judge'
        ? { kind: 'judge', userId: ACCOUNT_A } : null,
} });
const { default: device } = await import('../api/device.js');
const { default: notes } = await import('../api/notes.js');
const { deviceCookie } = await import('../src/device-access.mjs');
function response() {
  return { statusCode: 200, body: null, headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
const request = (method = 'GET', extra = {}) => ({ method, body: {}, query: {},
  headers: { authorization: 'Bearer fixture-a', cookie: `__Host-vault-device=${cookie}`,
    'content-type': 'application/json', ...extra } });

test('인증·쿠키·등록부를 검증하고 요청 버튼은 대기만 기록한다', async () => {
  const oldFetch = globalThis.fetch;
  const oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = 'https://auth-fixture.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'fixture-only';
  const rows = new Map();
  let writes = 0, noteReads = 0, unavailable = false;
  globalThis.fetch = async (url, options) => {
    if (url.pathname.endsWith('/training_device_requests')) {
      if (unavailable) return new Response('{}', { status: 503 });
      if (options.method === 'POST') {
        const input = JSON.parse(options.body);
        assert.equal(input.status, 'pending');
        assert.equal(options.headers.Prefer, 'resolution=ignore-duplicates,return=minimal');
        if (!rows.has(input.user_id)) rows.set(input.user_id, input);
        writes += 1;
        return new Response(null, { status: 201 });
      }
      const owner = url.searchParams.get('user_id')?.slice(3);
      assert.equal(url.searchParams.get('device_hash'), `eq.${hash}`);
      const row = rows.get(owner);
      return new Response(JSON.stringify(row ? [row] : []));
    }
    assert.equal(url.pathname, '/rest/v1/training_notes');
    noteReads += 1;
    assert.equal(url.searchParams.get('owner_id'), `eq.${ACCOUNT_A}`);
    return new Response(JSON.stringify([]));
  };
  async function call(handler, req) { const res = response(); await handler(req, res); return res; }
  try {
    assert.equal((await call(device, request('GET', { authorization: undefined }))).statusCode, 401);
    assert.equal((await call(device, request('GET', { authorization: 'Bearer invalid' }))).statusCode, 401);
    assert.equal((await call(device, request('GET'))).body.state, 'unregistered');
    const denied = await call(notes, request());
    assert.equal(denied.statusCode, 403);
    assert.equal(noteReads, 0);
    const tampered = request('POST'); tampered.body = { status: 'approved', user_id: ACCOUNT_B };
    assert.equal((await call(device, tampered)).statusCode, 400);
    assert.equal(writes, 0);
    assert.equal((await call(device, request('POST', { origin: 'https://other.invalid' }))).statusCode, 403);
    assert.equal((await call(device, request('POST'))).body.registered, false);
    assert.equal(rows.get(ACCOUNT_A).status, 'pending');
    assert.equal((await call(notes, request())).statusCode, 403);
    assert.equal(noteReads, 0);
    // Only the simulated trusted operator changes registration state.
    rows.get(ACCOUNT_A).status = 'approved';
    const approved = await call(device, request());
    assert.deepEqual(approved.body, { schema: 'vault.device.v1', state: 'approved', registered: true });
    assert.equal((await call(notes, request())).statusCode, 200);
    assert.equal(noteReads, 1);
    assert.equal((await call(device, request('POST'))).body.registered, true);
    assert.equal(rows.get(ACCOUNT_A).status, 'approved', 'retry does not overwrite operator approval');
    rows.get(ACCOUNT_A).device_hash = 'd'.repeat(64);
    assert.equal((await call(notes, request())).statusCode, 503);
    assert.equal(noteReads, 1, 'a mismatched registry row never reaches material storage');
    rows.get(ACCOUNT_A).device_hash = hash;
    assert.equal((await call(device, request('GET', { authorization: 'Bearer fixture-b' }))).body.registered, false);
    assert.equal((await call(notes, request('GET', { authorization: 'Bearer fixture-b' }))).statusCode, 403);
    rows.get(ACCOUNT_A).status = 'revoked';
    assert.equal((await call(device, request('POST'))).body.registered, false);
    assert.equal(rows.get(ACCOUNT_A).status, 'revoked');
    assert.equal((await call(notes, request())).statusCode, 403);
    assert.equal(noteReads, 1);
    assert.equal((await call(notes, request('GET', { cookie: undefined }))).statusCode, 403);
    unavailable = true;
    assert.equal((await call(notes, request())).statusCode, 503);
    assert.equal(noteReads, 1);
    // Signed judge identity keeps its existing ownership-scoped API contract.
    assert.equal((await call(notes, request('GET', { authorization: 'Bearer fixture-judge', cookie: undefined }))).statusCode, 200);
    assert.equal(noteReads, 2);
    unavailable = false; rows.get(ACCOUNT_A).status = 'approved';
    const combined = `__Host-vault-device=${cookie}; __Host-vault-session=fixture.header.signature`;
    assert.equal((await call(notes, request('GET', { authorization: undefined, cookie: combined }))).statusCode, 200);
    assert.equal(noteReads, 3);
    assert.equal((await call(device, request('POST', { authorization: undefined, cookie: combined }))).statusCode, 403);
    assert.equal((await call(device, request('POST', { authorization: undefined, cookie: combined,
      origin: 'https://vault-fixture.vercel.app' }))).body.registered, true);
    assert.equal(deviceCookie({ headers: { cookie: `__Host-vault-device=${cookie}; __Host-vault-device=${cookie}` } }), null);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = oldKey;
  }
});

test('새 기기 식별자는 서버의 HttpOnly 쿠키로만 발급한다', async () => {
  const old = globalThis.fetch, url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = 'https://auth-fixture.supabase.co'; process.env.SUPABASE_SECRET_KEY = 'fixture-only';
  globalThis.fetch = async () => new Response('[]');
  try {
    const res = response(); await device(request('GET', { cookie: undefined }), res);
    assert.match(res.headers['Set-Cookie'], /^__Host-vault-device=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800$/u);
    assert.equal(res.body.state, 'unregistered');
    assert.deepEqual(Object.keys(res.body).sort(), ['registered', 'schema', 'state']);
  } finally {
    globalThis.fetch = old;
    if (url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = url;
    if (key === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = key;
  }
});

test('UI는 승인·정상 응답만 열고 pending·실패·오래된 승인은 숨긴다', async () => {
  let opened = 0, visible = false, state, resolveOld;
  let payload = { schema: 'vault.device.v1', state: 'pending', registered: false };
  let status = 200;
  const gate = createDeviceGate({ fetchImpl: async (_url, options) => {
    assert.equal(options.cache, 'no-store');
    if (payload === 'deferred') return new Promise(resolve => { resolveOld = resolve; });
    return new Response(JSON.stringify(payload), { status });
  }, open: async () => { opened++; visible = true; }, close: () => { visible = false; }, show: value => { state = value; } });
  const session = { signedIn: true };
  await gate.setSession(session); assert.equal(visible, false); assert.equal(opened, 0);
  await gate.request(); assert.equal(visible, false);
  payload = { schema: 'vault.device.v1', state: 'approved', registered: true };
  await gate.refresh(); assert.equal(visible, true); assert.equal(opened, 1);
  gate.lock('offline'); assert.equal(visible, false);
  status = 503; await gate.refresh(); assert.equal(visible, false); assert.equal(state, 'unavailable');
  status = 200; payload = { schema: 'vault.device.v1', state: 'pending', registered: true };
  await gate.refresh(); assert.equal(visible, false);
  payload = 'deferred'; const old = gate.refresh();
  await gate.setSession(null);
  resolveOld(new Response(JSON.stringify({ schema: 'vault.device.v1', state: 'approved', registered: true })));
  await old; assert.equal(visible, false); assert.equal(opened, 1); assert.equal(state, 'signedout');
});

test('오프라인 캐시는 안내 한 장만 저장하고 API를 가로채지 않는다', async () => {
  const vm = await import('node:vm');
  const events = {}, cached = [];
  vm.runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self: { addEventListener: (name, handler) => { events[name] = handler; }, location: { origin: 'https://vault.invalid' } },
    caches: { open: async () => ({ add: async req => { cached.push(req.url); } }) },
    Request: class { constructor(url) { this.url = url; } }, URL,
  });
  let work; events.install({ waitUntil: value => { work = value; } }); await work;
  assert.deepEqual(cached, ['/offline.html']);
  for (const path of ['/api/notes', '/api/device', '/index.html']) {
    let intercepted = false;
    events.fetch({ request: { method: 'GET', mode: 'navigate', url: `https://vault.invalid${path}` }, respondWith() { intercepted = true; } });
    assert.equal(intercepted, false);
  }
});
