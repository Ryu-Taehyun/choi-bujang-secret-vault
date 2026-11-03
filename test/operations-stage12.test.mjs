import test from 'node:test';
import assert from 'node:assert/strict';
import { collectOperations, observeSelectedNote } from '../src/operations.mjs';
import { summarize, evidenceRows } from '../public/operations-model.mjs';
const config = { step: 12, publicAppUrl: 'https://vault-fixture.vercel.app/', repoUrl: 'https://github.com/fixture/vault' };
const commit = 'a'.repeat(40);
test('실제 호출한 고정 경로만 기록하고 화면 수치·가린 기록·표가 일치한다', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ path: url.pathname, method: options.method });
    assert.equal(options.headers.Cookie, undefined); assert.equal(options.headers.Authorization, undefined);
    assert.equal(url.origin, new URL(config.publicAppUrl).origin);
    if (url.pathname === '/aleph.json') return new Response(JSON.stringify({ step: 12, commit,
      repoUrl: config.repoUrl, privateKey: 'NEVER_EXPORT_THIS' }));
    const status = url.pathname === '/data.json' ? 404 : url.pathname === '/api/announcements/demo' ? 405
      : ['/api/notes', '/api/device'].includes(url.pathname) ? 401 : 200;
    return { status, headers: new Headers({ 'x-request-id': 'NEVER_EXPORT_THIS' }),
      body: { cancel: async () => {} }, json() { throw new Error('BODY_READ_FORBIDDEN'); } };
  };
  const snapshot = await collectOperations(config, { fetchImpl, commit });
  assert.equal(calls.length, 8);
  assert.deepEqual(snapshot.summary, summarize(snapshot.observations));
  assert.equal(snapshot.summary.matched, 8);
  assert.equal(snapshot.checklist.length, 22);
  assert.deepEqual(snapshot.checklist, evidenceRows(snapshot.observations));
  assert.equal(snapshot.checklist.filter(row => row.status === 'not_run').length, 15);
  assert.equal(snapshot.officialAttacks.status, 'not_run');
  assert.equal(snapshot.officialAttacks.passed, null);
  assert.equal(snapshot.revocation.executed, null);
  assert.equal(snapshot.detection.observedEvents, null);
  assert.equal(snapshot.recovery.restoredLiveVersion, null);
  assert.equal(JSON.stringify(snapshot).includes('NEVER_EXPORT_THIS'), false);
  for (const item of snapshot.observations) {
    assert.match(item.requestId, /^[a-f0-9-]{36}$/u);
    assert.ok(Number.isFinite(Date.parse(item.checkedAt)));
  }
});
test('접속 실패·기대 불일치·배포 차이를 성공으로 바꾸지 않는다', async () => {
  const snapshot = await collectOperations(config, { fetchImpl: async url => {
    if (url.pathname === '/api/notes') throw new Error('NEVER_EXPORT_THIS');
    if (url.pathname === '/aleph.json') return new Response(JSON.stringify({ step: 11, commit, repoUrl: config.repoUrl }));
    return new Response(null, { status: 503 });
  }, root: 'missing-recovery-fixture' });
  assert.equal(snapshot.summary.matched, 0); assert.equal(snapshot.summary.failed, 1);
  assert.equal(snapshot.observations.find(row => row.probe === 'anonymous-notes').httpStatus, null);
  assert.equal(snapshot.observations.find(row => row.probe === 'deployment').verdict, 'mismatch');
  assert.equal(snapshot.recovery.copyVerification, 'unverified');
  assert.equal(snapshot.recovery.verifiedCopyVersion, null);
  assert.equal(JSON.stringify(snapshot).includes('NEVER_EXPORT_THIS'), false);
});
test('본인 허용·타인 거부를 실제 GET 상태로 기록하고 ID·인증·본문을 보관하지 않는다', async () => {
  const targetId = '20000000-0000-4000-8000-000000000001';
  for (const probe of ['own-note', 'other-note']) {
    let called = false;
    const row = await observeSelectedNote(config, { probe, targetId }, {
      headers: { Cookie: 'fixture-private-session' }, fetchImpl: async (url, options) => {
        called = true; assert.equal(url.pathname, `/api/notes/${targetId}`);
        assert.equal(options.method, 'GET'); assert.equal(options.headers.Cookie, 'fixture-private-session');
        return { status: probe === 'own-note' ? 200 : 404, headers: new Headers(),
          body: { cancel: async () => {} }, json() { throw new Error('BODY_READ_FORBIDDEN'); } };
      },
    });
    assert.equal(called, true); assert.equal(row.verdict, 'matched');
    assert.equal(row.route, '/api/notes/:id');
    assert.equal(JSON.stringify(row).includes(targetId), false);
    assert.equal(JSON.stringify(row).includes('fixture-private-session'), false);
  }
  for (const input of [{ probe: 'own-note', targetId: '../private' }, { probe: 'own-note', targetId: targetId + '\n' },
    { probe: 'other-note', targetId, url: 'https://other.invalid' }, { probe: 'restore', targetId }]) {
    await assert.rejects(observeSelectedNote(config, input, { fetchImpl: () => { throw new Error('MUST_NOT_CALL'); } }), /INVALID/);
  }
});
test('관측 배열이 없을 때는 22행 모두 미실행이고 가상 성공을 채우지 않는다', () => {
  assert.equal(evidenceRows([]).length, 22);
  assert.equal(evidenceRows([]).every(row => row.status === 'not_run' && row.observation === null), true);
  assert.deepEqual(summarize([]), { attempted: 0, received: 0, matched: 0, mismatched: 0, failed: 0 });
});
