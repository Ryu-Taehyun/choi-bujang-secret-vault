import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { clearLegacyStorage } from '../public/legacy-storage.mjs';
const origin = 'https://vault-fixture.vercel.app';
const issuer = 'https://auth-fixture.supabase.co/auth/v1';
const token = 'fixture.header.signature';
let sdkCalls = 0, denied = false;
mock.module('../aleph.config.json', { defaultExport: {
  publicAppUrl: origin + '/', identityProvider: { issuer, audience: 'authenticated' },
} });
mock.module('@supabase/supabase-js', { namedExports: {
  createClient(_url, _key, options) {
    sdkCalls++;
    assert.deepEqual(options.auth, { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
    return { auth: {
      signInWithPassword: async () => denied ? { error: {} } : { data: { session: { access_token: token, expires_in: 3600 } } },
      getClaims: async () => ({ data: { claims: { iss: issuer, aud: 'authenticated', role: 'authenticated',
        sub: '10000000-0000-4000-8000-000000000001', exp: Math.floor(Date.now() / 1000) + 3600 } } }),
    } };
  },
} });
mock.module('../src/verify-login.mjs', { namedExports: {
  createLoginVerifier: () => async value => value === `Bearer ${token}` ? { kind: 'student', userId: 'fixture-user' } : null,
} });
const { default: handler } = await import('../api/session.js');
const { requestAuthorization, cookieWriteAllowed } = await import('../src/session-auth.mjs');
function res() { return { statusCode: 200, headers: {}, body: null,
  setHeader(k,v) { this.headers[k] = v; }, status(s) { this.statusCode = s; return this; }, json(b) { this.body = b; return this; } }; }
function req(method='GET', headers={}) { return { method, headers: { origin, 'content-type': 'application/json', ...headers }, body: { email: 'fixture', password: 'fixture' } }; }
test('서버 로그인은 세션 상태만 반환하고 인증 값은 HttpOnly 쿠키에 한정한다', async () => {
  const oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = 'https://auth-fixture.supabase.co'; process.env.SUPABASE_SECRET_KEY = 'fixture-only';
  try {
    const before = sdkCalls;
    const cross = res(); await handler(req('POST', { origin: 'https://other.invalid' }), cross);
    assert.equal(cross.statusCode, 403); assert.equal(sdkCalls, before);
    const login = res(); await handler(req('POST'), login);
    assert.equal(login.statusCode, 200); assert.deepEqual(login.body, { signedIn: true });
    assert.equal(JSON.stringify(login.body).includes(token), false);
    assert.match(login.headers['Set-Cookie'], /; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=\d+$/u);
    assert.equal(login.headers['Cache-Control'], 'no-store');
    const cookie = login.headers['Set-Cookie'].split(';')[0];
    const session = res(); await handler(req('GET', { cookie }), session);
    assert.deepEqual(session.body, { signedIn: true });
    const anonymous = res(); await handler(req(), anonymous); assert.deepEqual(anonymous.body, { signedIn: false });
    const logout = res(); await handler(req('DELETE', { cookie }), logout);
    assert.deepEqual(logout.body, { signedIn: false }); assert.match(logout.headers['Set-Cookie'], /Max-Age=0$/u);
    denied = true; const invalid = res(); await handler(req('POST'), invalid);
    assert.equal(invalid.statusCode, 401); assert.equal(invalid.headers['Set-Cookie'], undefined);
  } finally {
    denied = false;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = oldKey;
  }
});
test('쿠키 쓰기 요청의 출처를 검사하고 잘못된 명시적 인증은 쿠키로 우회하지 않는다', () => {
  const headers = { cookie: `__Host-vault-session=${token}` };
  assert.equal(requestAuthorization({ headers }), `Bearer ${token}`);
  assert.equal(requestAuthorization({ headers: { ...headers, authorization: 'invalid' } }), 'invalid');
  assert.equal(requestAuthorization({ headers: { cookie: `${headers.cookie}; ${headers.cookie}` } }), undefined);
  assert.equal(cookieWriteAllowed({ method: 'POST', headers }), false);
  assert.equal(cookieWriteAllowed({ method: 'DELETE', headers: { ...headers, origin } }), true);
  assert.equal(cookieWriteAllowed({ method: 'POST', headers: { authorization: 'Bearer fixture' } }), true);
});
test('이전 저장 항목은 이름만 보고 제거하고 무관한 항목과 값은 읽지 않는다', () => {
  const names = ['sb-fixture-auth-token', 'sb-fixture-auth-token-code-verifier', 'deviceKey', 'devicePrivateKey', 'theme'];
  const removed = [];
  const storage = { length: names.length, key: i => names[i], removeItem: name => { removed.push(name); },
    getItem() { throw new Error('STORED_VALUE_MUST_NOT_BE_READ'); } };
  clearLegacyStorage(storage);
  assert.equal(removed.length, 4); assert.equal(removed.includes('theme'), false);
});
test('공개 자산에는 키·SDK 세션·브라우저 영구 저장 쓰기가 없다', () => {
  for (const file of readdirSync(new URL('../public/', import.meta.url))) {
    if (!/\.(html|js|mjs|json|webmanifest)$/u.test(file)) continue;
    const text = readFileSync(new URL('../public/' + file, import.meta.url), 'utf8');
    assert.equal(/sb_publishable_|sb_secret_|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{12,}\.eyJ/u.test(text), false, file);
    assert.equal(/\.setItem\s*\(|indexedDB\.open|createClient\s*\(|access_token|Authorization\s*:/u.test(text), false, file);
  }
});
