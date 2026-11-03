import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { initialize, loadSafe, readState, writeState, invade, policyPlan, restorePolicy,
  notePlan, restoreNote, trialRead, digest, sha256, inspectRestored, TARGET_ID, ACCOUNT_A, ACCOUNT_B } from '../src/recovery.mjs';
import { recoveryHandler } from '../src/recovery-http.mjs';
import { runRecoveryRetests } from '../src/recovery-retest.mjs';

const root = resolve(import.meta.dirname, '..');
const testRoot = join(root, 'artifacts/recovery-tests');
mkdirSync(testRoot, { recursive: true });
const aNote = '20000000-0000-4000-8000-000000000001';
function fixture() {
  const dir = mkdtempSync(join(testRoot, 'vault-recovery-test-'));
  initialize(root, dir);
  return dir;
}

test('정책 버전·한 줄 차이 사전 확인 후 복원; A 허용/B의 A 접근 거부 및 다른 규칙·감사 보존', async () => {
  const dir = fixture();
  const before = readState(dir);
  assert.equal(trialRead(dir, ACCOUNT_A, aNote), true);
  assert.equal(trialRead(dir, ACCOUNT_B, aNote), false);
  const plan = invade(root, dir);
  assert.equal(trialRead(dir, ACCOUNT_B, aNote), true);
  assert.deepEqual(plan.changes, [{ path: '/dbAccess/ownerOnly', before: false, after: true }]);
  assert.equal(plan.version, 'stage9-safe-v1');
  assert.throws(() => restorePolicy(root, dir), /CONFIRMATION/);
  restorePolicy(root, dir, plan.confirmation);
  const after = readState(dir);
  assert.equal(trialRead(dir, ACCOUNT_A, aNote), true);
  assert.equal(trialRead(dir, ACCOUNT_B, aNote), false);
  assert.equal(digest(after.otherServices), digest(before.otherServices));
  assert.equal(digest(after.notes), digest(before.notes));
  assert.equal(digest(after.audit.slice(0, before.audit.length)), digest(before.audit));
  assert.equal(after.audit.length, before.audit.length + 2);
  assert.equal(policyPlan(root, dir).changes.length, 0);
  // Execute restored source copies, rather than claiming the live policy changed.
  mkdirSync(join(dir, 'src'));
  for (const path of ['src/decider.mjs', 'src/access-signals.mjs', 'src/resource-zones.mjs']) {
    writeFileSync(join(dir, path), after.policy.sources[path]);
  }
  const { decide } = await import(pathToFileURL(join(dir, 'src/decider.mjs')).href);
  const request = { requestId: 'fixture', deviceRegistered: true, service: 'notes',
    method: 'GET', path: `/notes/${aNote}`, route: 'GET /notes/:id', queryLength: 0 };
  assert.equal((await decide(request)).decision, 'allow');
  assert.equal((await decide({ ...request, deviceRegistered: false })).decision, 'deny');
  assert.equal((await decide({ ...request, method: 'DELETE' })).decision, 'deny');
});

test('없거나 손상된 안전 사본과 오래된 확인 계획은 아무것도 변경하지 않는다', () => {
  const dir = fixture();
  const before = digest(readState(dir));
  writeFileSync(join(dir, 'writer.lock'), '');
  assert.throws(() => restorePolicy(root, dir, 'invalid'), /WRITER_BUSY/);
  unlinkSync(join(dir, 'writer.lock'));
  assert.equal(digest(readState(dir)), before);
  const fakeRoot = mkdtempSync(join(testRoot, 'vault-policy-copy-'));
  mkdirSync(join(fakeRoot, 'recovery'));
  assert.throws(() => restorePolicy(fakeRoot, dir, 'invalid'));
  for (const name of ['safe-policy.json', 'safe-policy.sha256']) {
    copyFileSync(join(root, 'recovery', name), join(fakeRoot, 'recovery', name));
  }
  writeFileSync(join(fakeRoot, 'recovery/safe-policy.json'), '{}');
  assert.throws(() => restorePolicy(fakeRoot, dir, 'invalid'), /HASH_MISMATCH/);
  assert.equal(digest(readState(dir)), before);
  const plan = invade(root, dir);
  const state = readState(dir);
  state.otherServices.newService = { deny: true };
  writeState(dir, state);
  const changed = digest(readState(dir));
  assert.throws(() => restorePolicy(root, dir, plan.confirmation), /STALE/);
  assert.equal(digest(readState(dir)), changed);
});

test('POST에서 B 한 건의 ID·소유자·내용 해시 복구, 다른 메모·정책·감사 보존', async () => {
  const dir = fixture();
  const state = readState(dir);
  state.notes = state.notes.filter(note => note.id !== TARGET_ID);
  state.audit.push({ event: 'fixture_note_removed', id: TARGET_ID });
  writeState(dir, state);
  const server = createServer(recoveryHandler(root, dir));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const path = `/restore/notes/${TARGET_ID}`;
  const post = body => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(base + path)).status, 405);
    assert.equal((await fetch(base + path, { method: 'POST', headers: { origin: 'https://fixture.invalid' } })).status, 403);
    assert.equal((await fetch(base + '/restore/notes/other', { method: 'POST' })).status, 404);
    assert.equal((await post({ confirmation: 'invalid', owner_id: ACCOUNT_A })).status, 400);
    assert.equal((await post({ confirmation: 'invalid' })).status, 409);
    const preview = await (await post({ preview: true })).json();
    assert.equal(preview.changes[0].before, null);
    const response = await post({ confirmation: preview.confirmation });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(Object.keys(result).sort(), ['contentHash', 'id', 'owner_id']);
    const anchor = JSON.parse(readFileSync(join(dir, 'note-anchor.json')));
    assert.equal(result.id, TARGET_ID);
    assert.equal(result.owner_id, ACCOUNT_B);
    assert.equal(result.contentHash, anchor.contentHash);
    const after = readState(dir);
    const note = after.notes.find(row => row.id === TARGET_ID);
    assert.equal(digest([note.title, note.content]), anchor.contentHash);
    assert.equal(digest(after.notes.filter(row => row.id !== TARGET_ID)), digest(state.notes));
    assert.equal(digest(after.policy), digest(state.policy));
    assert.equal(digest(after.otherServices), digest(state.otherServices));
    assert.equal(digest(after.audit.slice(0, state.audit.length)), digest(state.audit));
    assert.equal(after.audit.length, state.audit.length + 1);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('메모 사본 누락·변조·소유자 충돌·다른 계정·미확인 계획을 거부한다', () => {
  const dir = fixture();
  const original = digest(readState(dir));
  assert.throws(() => notePlan(root, dir, ACCOUNT_A, TARGET_ID), /FORBIDDEN/);
  assert.throws(() => notePlan(root, dir, ACCOUNT_B, aNote), /FORBIDDEN/);
  assert.throws(() => restoreNote(root, dir, ACCOUNT_B, TARGET_ID), /CONFIRMATION/);
  const backup = readFileSync(join(dir, 'note-backup.json'));
  writeFileSync(join(dir, 'note-backup.json'), '{}');
  assert.throws(() => notePlan(root, dir, ACCOUNT_B, TARGET_ID), /HASH_MISMATCH/);
  unlinkSync(join(dir, 'note-backup.json'));
  assert.throws(() => notePlan(root, dir, ACCOUNT_B, TARGET_ID), /COPY_MISSING/);
  assert.equal(digest(readState(dir)), original);
  writeFileSync(join(dir, 'note-backup.json'), backup);
  const plan = notePlan(root, dir, ACCOUNT_B, TARGET_ID);
  const state = readState(dir);
  state.audit.push({ event: 'concurrent_change' });
  writeState(dir, state);
  assert.throws(() => restoreNote(root, dir, ACCOUNT_B, TARGET_ID, plan.confirmation), /STALE/);
  state.notes.find(note => note.id === TARGET_ID).owner_id = ACCOUNT_A;
  writeState(dir, state);
  assert.throws(() => notePlan(root, dir, ACCOUNT_B, TARGET_ID), /OWNER_CONFLICT/);
  assert.equal(digest(readState(dir)), digest(state));
});

test('미리보기 뒤 정책 사본 삭제·변조 시 사본을 다시 읽고 시험 상태를 보존한다', () => {
  const dir = fixture();
  const fakeRoot = mkdtempSync(join(testRoot, 'vault-reread-'));
  mkdirSync(join(fakeRoot, 'recovery'));
  for (const name of ['safe-policy.json', 'safe-policy.sha256']) {
    copyFileSync(join(root, 'recovery', name), join(fakeRoot, 'recovery', name));
  }
  const plan = policyPlan(fakeRoot, dir);
  const before = digest(readState(dir));
  const copyPath = join(fakeRoot, 'recovery/safe-policy.json');
  const raw = readFileSync(copyPath);
  unlinkSync(copyPath);
  assert.throws(() => restorePolicy(fakeRoot, dir, plan.confirmation));
  assert.equal(digest(readState(dir)), before);
  writeFileSync(copyPath, raw.toString() + ' ');
  assert.throws(() => restorePolicy(fakeRoot, dir, plan.confirmation), /HASH_MISMATCH/);
  assert.equal(digest(readState(dir)), before);
});

test('미리보기 뒤 메모 사본·기준 해시가 함께 교체돼도 예전 확인값으로 복원하지 않는다', () => {
  const dir = fixture();
  const plan = notePlan(root, dir, ACCOUNT_B, TARGET_ID);
  const before = digest(readState(dir));
  const backupPath = join(dir, 'note-backup.json');
  const anchorPath = join(dir, 'note-anchor.json');
  const copy = JSON.parse(readFileSync(backupPath));
  copy.extra = 'replacement';
  const raw = JSON.stringify(copy);
  const anchor = JSON.parse(readFileSync(anchorPath));
  anchor.backupHash = sha256(raw);
  writeFileSync(backupPath, raw);
  writeFileSync(anchorPath, JSON.stringify(anchor));
  assert.throws(() => restoreNote(root, dir, ACCOUNT_B, TARGET_ID, plan.confirmation), /STALE/);
  assert.equal(digest(readState(dir)), before);
});

test('사본 파일 해시가 맞아도 ID·소유자·내용 해시가 다르면 복원하지 않는다', () => {
  for (const key of ['id', 'owner_id', 'content']) {
    const dir = fixture();
    const before = digest(readState(dir));
    const backupPath = join(dir, 'note-backup.json');
    const anchorPath = join(dir, 'note-anchor.json');
    const copy = JSON.parse(readFileSync(backupPath));
    copy.note[key] = key === 'owner_id' ? ACCOUNT_A : 'changed-fixture';
    const raw = JSON.stringify(copy);
    const anchor = JSON.parse(readFileSync(anchorPath));
    anchor.backupHash = sha256(raw);
    writeFileSync(backupPath, raw);
    writeFileSync(anchorPath, JSON.stringify(anchor));
    assert.throws(() => notePlan(root, dir, ACCOUNT_B, TARGET_ID), /ID_OWNER_CONTENT_MISMATCH/);
    assert.equal(digest(readState(dir)), before);
  }
});

test('복구 뒤 정상·금지 21건을 실행·기록하고 손상된 상태의 재시도는 미확인으로 남긴다', async () => {
  const dir = fixture();
  restorePolicy(root, dir, policyPlan(root, dir).confirmation);
  const plan = notePlan(root, dir, ACCOUNT_B, TARGET_ID);
  const result = restoreNote(root, dir, ACCOUNT_B, TARGET_ID, plan.confirmation);
  const inspected = inspectRestored(root, dir);
  assert.equal(result.contentHash, inspected.contentHash);
  const before = digest(readState(dir));
  const report = await runRecoveryRetests(root, dir);
  assert.equal(report.status, 'passed');
  assert.equal(report.results.length, 21);
  assert.equal(report.results.every(result => result.status === 'passed'), true);
  assert.equal(report.liveChecks.every(result => result.status === 'not_run'), true);
  assert.equal(digest(readState(dir)), before);
  const damaged = readState(dir);
  damaged.notes.find(note => note.id === TARGET_ID).content += 'changed';
  writeState(dir, damaged);
  assert.throws(() => inspectRestored(root, dir), /RESTORED_NOTE_MISMATCH/);
  const failedRetry = await runRecoveryRetests(root, dir);
  assert.equal(failedRetry.status, 'blocked');
  assert.equal(failedRetry.results.every(result => result.status === 'not_run'), true);
  const saved = JSON.parse(readFileSync(join(dir, 'retest-report.json')));
  assert.equal(saved.status, 'blocked');
  assert.equal(saved.results.every(result => result.status === 'not_run'), true);
});
