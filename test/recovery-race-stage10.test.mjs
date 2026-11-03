import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join, resolve } from 'node:path';

// Simulate another process changing the backup exactly after the candidate
// file is written, without changing the production recovery API for tests.
let afterCandidateWrite;
let replacements = 0;
mock.module('node:fs', { namedExports: {
  readFileSync: fs.readFileSync,
  mkdirSync: fs.mkdirSync,
  openSync: fs.openSync,
  closeSync: fs.closeSync,
  unlinkSync: fs.unlinkSync,
  writeFileSync(path, ...args) {
    const result = fs.writeFileSync(path, ...args);
    if (String(path).endsWith('trial.tmp') && afterCandidateWrite) {
      const change = afterCandidateWrite;
      afterCandidateWrite = undefined;
      change();
    }
    return result;
  },
  renameSync(...args) { replacements += 1; return fs.renameSync(...args); },
} });
const { initialize, invade, readState, policyPlan, restorePolicy, notePlan,
  restoreNote, digest, TARGET_ID, ACCOUNT_B, sha256 } = await import('../src/recovery.mjs');
const root = resolve(import.meta.dirname, '..');
const testRoot = join(root, 'artifacts/recovery-race-tests');
fs.mkdirSync(testRoot, { recursive: true });
function fixture() {
  const dir = fs.mkdtempSync(join(testRoot, 'trial-'));
  const copyRoot = fs.mkdtempSync(join(testRoot, 'trusted-'));
  fs.mkdirSync(join(copyRoot, 'recovery'));
  for (const name of ['safe-policy.json', 'safe-policy.sha256']) {
    fs.copyFileSync(join(root, 'recovery', name), join(copyRoot, 'recovery', name));
  }
  initialize(copyRoot, dir);
  return { dir, copyRoot };
}
function assertNoReplacement(dir, before, action) {
  const count = replacements;
  assert.throws(action);
  assert.equal(replacements, count, 'no file replacement after verification failure');
  assert.equal(digest(readState(dir)), before, 'policy, notes and audit remain unchanged');
  assert.equal(fs.existsSync(join(dir, 'trial.tmp')), false);
  assert.equal(fs.existsSync(join(dir, 'writer.lock')), false);
}

test('교체 직전 정책 사본이 삭제·변조·교체되면 복원 쓰기 0건', () => {
  for (const mode of ['missing', 'corrupt', 'replaced']) {
    const { dir, copyRoot } = fixture();
    invade(copyRoot, dir);
    const plan = policyPlan(copyRoot, dir);
    const before = digest(readState(dir));
    afterCandidateWrite = () => {
      const path = join(copyRoot, 'recovery/safe-policy.json');
      if (mode === 'missing') fs.unlinkSync(path);
      else {
        const raw = fs.readFileSync(path, 'utf8') + ' ';
        fs.writeFileSync(path, raw);
        if (mode === 'replaced') fs.writeFileSync(join(copyRoot, 'recovery/safe-policy.sha256'), sha256(raw));
      }
    };
    assertNoReplacement(dir, before, () => restorePolicy(copyRoot, dir, plan.confirmation));
  }
});

test('교체 직전 메모 사본이 삭제·변조·기준과 함께 교체되면 복원 쓰기 0건', () => {
  for (const mode of ['missing', 'corrupt', 'replaced']) {
    const { dir, copyRoot } = fixture();
    const plan = notePlan(copyRoot, dir, ACCOUNT_B, TARGET_ID);
    const before = digest(readState(dir));
    afterCandidateWrite = () => {
      const path = join(dir, 'note-backup.json');
      if (mode === 'missing') fs.unlinkSync(path);
      else {
        const raw = fs.readFileSync(path, 'utf8') + ' ';
        fs.writeFileSync(path, raw);
        if (mode === 'replaced') {
          const anchorPath = join(dir, 'note-anchor.json');
          const anchor = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));
          anchor.backupHash = sha256(raw);
          fs.writeFileSync(anchorPath, JSON.stringify(anchor));
        }
      }
    };
    assertNoReplacement(dir, before, () => restoreNote(copyRoot, dir, ACCOUNT_B, TARGET_ID, plan.confirmation));
  }
});

test('교체 직전 시험 상태가 변경되면 그 변경을 덮어쓰지 않는다', () => {
  const { dir, copyRoot } = fixture();
  const plan = policyPlan(copyRoot, dir);
  let concurrentHash;
  afterCandidateWrite = () => {
    const state = readState(dir);
    state.audit.push({ event: 'concurrent_change' });
    concurrentHash = digest(state);
    fs.writeFileSync(join(dir, 'trial.json'), JSON.stringify(state));
  };
  const count = replacements;
  assert.throws(() => restorePolicy(copyRoot, dir, plan.confirmation), /STALE/);
  assert.equal(replacements, count);
  assert.equal(digest(readState(dir)), concurrentHash);
});
