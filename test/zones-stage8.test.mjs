import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { decide } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { resourceAt } from '../src/resource-zones.mjs';

test('zones allow exact item reads, never lists, functions, queries or writes', async () => {
  const { normal } = fixtureRequests();
  for (const service of ['notes', 'announcements']) {
    for (const id of ['demo', 'sample_note_1', 'non-uuid-fixture']) {
      const result = await decide({ ...normal, service, path: `/${service}/${id}`,
        route: `GET /${service}/:id` });
      assert.equal(result.decision, 'allow');
      assert.ok(result.ruleIds.includes('resource_zone'));
    }
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal((await decide({ ...normal, service, method,
        path: `/${service}/demo`, route: `${method} /${service}/:id`, role: 'instructor' })).decision, 'deny');
    }
    for (const path of [`/${service}`, `/${service}/`, `/${service}/export`,
      `/${service}/demo/export`, `/${service}/demo/`, `/${service}/%2e%2e`,
      `/${service}/..`, `/${service}/demo?mode=export`]) {
      assert.equal((await decide({ ...normal, service, path,
        route: `GET /${service}/:id` })).decision, 'deny');
    }
  }
  for (const patch of [{ queryLength: 1 }, { route: 'GET /notes' },
    { service: 'instructor-materials', path: '/instructor-materials/demo', route: 'GET /instructor-materials/:id' },
    { service: 'unknown' }, { path: '/announcements/demo' }]) {
    assert.equal((await decide({ ...normal, ...patch })).decision, 'deny');
  }
  assert.notEqual(resourceAt('notes', '/notes/demo').resourceId,
    resourceAt('announcements', '/announcements/demo').resourceId);
});

const authConfig = { identityProvider: { issuer: 'https://auth-fixture.supabase.co/auth/v1' } };
mock.module('../aleph.config.json', { defaultExport: authConfig });
mock.module('../src/verify-login.mjs', { namedExports: {
  createLoginVerifier: () => async value => {
    const users = { 'Bearer student-a': 'user-a', 'Bearer student-b': 'user-b',
      'Bearer instructor': 'teacher', 'Bearer outsider': 'outsider' };
    return users[value] ? { userId: users[value], kind: 'student' } : null;
  },
} });
const { default: announcements } = await import('../api/announcements/[id].js');
const { default: admin } = await import('../api/admin/announcements/[id].js');
const { default: materials } = await import('../api/instructor-materials/[id].js');
function response() {
  return { statusCode: 200, body: null, headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; } };
}

test('direct APIs enforce stored class and instructor rights, ignoring client roles', async () => {
  const oldFetch = globalThis.fetch;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = 'https://auth-fixture.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-only';
  const memberships = [
    { user_id: 'user-a', class_id: 'class-a', role: 'student' },
    { user_id: 'user-b', class_id: 'class-b', role: 'student' },
    { user_id: 'teacher', class_id: 'class-a', role: 'instructor' },
  ];
  const row = { id: 'demo', class_id: 'class-a', title: 'fixture', content: 'fixture' };
  let fetches = 0;
  let rpcCalls = 0;
  globalThis.fetch = async (url, options) => {
    fetches++;
    if (url.pathname.endsWith('/training_class_memberships')) {
      const userId = url.searchParams.get('user_id').slice(3);
      return Response.json(memberships.filter(m => m.user_id === userId));
    }
    if (url.pathname.endsWith('/training_announcements')) {
      assert.equal(url.searchParams.get('id'), 'eq.demo');
      return Response.json(url.searchParams.get('class_id') === 'in.(class-a)' ? [row] : []);
    }
    assert.equal(url.pathname, '/rest/v1/rpc/update_training_announcement');
    rpcCalls++;
    const input = JSON.parse(options.body);
    assert.deepEqual(Object.keys(input).sort(), ['actor', 'new_content', 'new_title', 'resource_id']);
    assert.equal(input.actor, 'teacher');
    assert.equal(input.resource_id, 'demo');
    return Response.json([{ ...row, title: input.new_title, content: input.new_content }]);
  };
  async function call(handler, user, method = 'GET', body, url = '/api/announcements/demo') {
    const res = response();
    await handler({ method, url, body, headers: {
      ...(user ? { authorization: `Bearer ${user}` } : {}),
      'content-type': 'application/json', 'x-role': 'instructor',
    } }, res);
    return res;
  }
  try {
    assert.equal((await call(announcements, null)).statusCode, 401);
    assert.equal(fetches, 0);
    const ownClass = await call(announcements, 'student-a');
    assert.equal(ownClass.statusCode, 200);
    assert.equal(ownClass.headers['X-Resource-Id'], 'announcements:demo');
    assert.equal((await call(announcements, 'student-b')).statusCode, 404);
    assert.equal((await call(announcements, 'outsider')).statusCode, 403);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const user of ['student-a', 'instructor']) {
        assert.equal((await call(announcements, user, method, { role: 'instructor' })).statusCode, 405);
      }
    }
    assert.equal((await call(admin, 'student-a', 'PUT', { role: 'instructor' },
      '/api/admin/announcements/demo')).statusCode, 403);
    assert.equal(rpcCalls, 0);
    assert.equal((await call(admin, 'instructor', 'PUT', { title: 'updated', body: 'fixture' },
      '/api/admin/announcements/demo')).statusCode, 200);
    assert.equal(rpcCalls, 1);
    assert.equal((await call(admin, 'instructor', 'PUT', { title: 'x', body: 'x', role: 'instructor' },
      '/api/admin/announcements/demo')).statusCode, 400);
    assert.equal(rpcCalls, 1);
    for (const user of ['student-a', 'instructor']) {
      assert.equal((await call(materials, user, 'GET', undefined, '/api/instructor-materials/demo')).statusCode, 403);
    }
    for (const url of ['/api/announcements', '/api/announcements/export',
      '/api/announcements/demo?role=instructor', '/api/announcements/demo/extra']) {
      assert.equal((await call(announcements, 'student-a', 'GET', undefined, url)).statusCode, 404);
    }
    globalThis.fetch = async () => Response.json({ error: 'not provisioned' }, { status: 404 });
    assert.equal((await call(announcements, 'student-a')).statusCode, 502);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
  }
});
