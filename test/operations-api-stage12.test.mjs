import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const origin = 'https://vault-fixture.vercel.app';
let publicCalls = 0, noteCalls = 0, forwardedCookie;
const snapshotId = randomUUID();
mock.module('../aleph.config.json', { defaultExport: { publicAppUrl: origin + '/' } });
mock.module('../src/operations.mjs', { namedExports: {
  collectOperations: async () => { publicCalls++; return { schema: 'vault.operations.v1', snapshotId, generatedAt: '2026-11-03T00:00:00.000Z' }; },
  observeSelectedNote: async (_config, _input, options) => {
    noteCalls++; forwardedCookie = options.headers.Cookie;
    return { probe: 'own-note', requestId: randomUUID(), route: '/api/notes/:id', httpStatus: 200, verdict: 'matched' };
  },
} });
const { default: handler } = await import('../api/operations.js');
const response = () => ({ statusCode: 200, body: null, headers: {}, setHeader(k,v) { this.headers[k]=v; },
  status(code) { this.statusCode=code; return this; }, json(body) { this.body=body; return this; } });
test('공개 관측 재사용 시 요청 ID와 시각을 그대로 보존한다', async () => {
  const a = response(), b = response();
  await handler({ method: 'GET', headers: {} }, a);
  await handler({ method: 'GET', headers: {} }, b);
  assert.equal(a.statusCode, 200); assert.equal(publicCalls, 1);
  assert.deepEqual(a.body, b.body); assert.equal(a.headers['Cache-Control'], 'no-store');
});
test('쿠키를 복구·외부 경로로 보내지 않고 동일 출처의 메모 관측만 받는다', async () => {
  const session = 'fixture.header.signature', device = 'c'.repeat(43);
  const cookie = `__Host-vault-session=${session}; __Host-vault-device=${device}; unrelated=do-not-forward`;
  const req = { method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' },
    body: { probe: 'own-note', targetId: '20000000-0000-4000-8000-000000000001' } };
  const cross = response(); await handler({ ...req, headers: { ...req.headers, origin: 'https://other.invalid' } }, cross);
  assert.equal(cross.statusCode, 403); assert.equal(noteCalls, 0);
  const anonymous = response(); await handler({ ...req, headers: { ...req.headers, cookie: undefined } }, anonymous);
  assert.equal(anonymous.statusCode, 401); assert.equal(noteCalls, 0);
  const res = response(); await handler(req, res);
  assert.equal(res.statusCode, 200); assert.equal(noteCalls, 1);
  assert.equal(forwardedCookie.includes('unrelated'), false);
  assert.equal(JSON.stringify(res.body).includes(session), false);
  assert.equal(JSON.stringify(res.body).includes(device), false);
  const invalid = response(); await handler({ method: 'DELETE', headers: {} }, invalid);
  assert.equal(invalid.statusCode, 405);
});
