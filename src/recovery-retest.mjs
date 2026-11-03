import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectRestored, readState, trialRead, digest, ACCOUNT_A, ACCOUNT_B, TARGET_ID } from './recovery.mjs';
import { checkDecider } from '../scripts/decider-test.mjs';
import { checkDetection } from '../scripts/detect-test.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

// These are executed local requests, not a substitute for the live judge's
// contract. Every report includes explicit not_run entries for live checks.
export async function runRecoveryRetests(root, dir) {
  const planned = ['A 자기 자료 읽기', 'B 자기 복구 자료 읽기', 'B의 A 자료 읽기 거부',
    'A의 B 자료 읽기 거부', '무신원 자료 읽기 거부', '등록 기기의 정상 요청',
    '미등록 기기의 가상 요청', '복합 이상 접속', '다시 확인한 복합 이상 접속',
    '정상 조회 30건', '10분 안에 120건', '10분 안에 121건', '폭주 조회 200건',
    '서로 다른 사용자 각 100건', '10분 밖으로 흩어진 조회 200건', '메모 전체 목록 거부',
    '공지 단건 읽기', '공지 쓰기 거부', '강사 자료 거부', '미지 경로 거부', '쿼리 선택 거부'];
  const report = { schema: 'vault.recovery-retest.v1', scope: 'local-test',
    startedAt: new Date().toISOString(), status: 'blocked',
    results: planned.map(name => ({ name, status: 'not_run' })),
    liveChecks: [
      { name: '운영 DB 정책·메모 복원', status: 'not_run', reason: 'DB_BACKUP_UNAVAILABLE' },
      { name: '실제 A/B 로그인·운영 복구 경로', status: 'not_run', reason: 'LIVE_RESTORE_CONTRACT_UNAVAILABLE' },
    ] };
  const reportPath = join(dir, 'retest-report.json');
  const record = result => {
    const index = report.results.findIndex(item => item.name === result.name);
    if (index < 0) throw new Error('UNPLANNED_RETEST');
    report.results[index] = result;
  };
  // Replace a previous report immediately, so a failed retry cannot expose an
  // earlier successful run as the current result.
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  try {
    const restored = inspectRestored(root, dir);
    const state = readState(dir);
    if (!state.audit.some(item => item.event === 'policy_restored')
        || !state.audit.some(item => item.event === 'note_restored')) throw new Error('RESTORE_HISTORY_MISSING');
    report.restored = restored;
    const sourceDir = mkdtempSync(join(dir, 'retest-source-'));
    mkdirSync(join(sourceDir, 'src'));
    for (const path of ['src/decider.mjs', 'src/access-signals.mjs', 'src/resource-zones.mjs', 'src/detect.mjs']) {
      writeFileSync(join(sourceDir, path), state.policy.sources[path]);
      if (readFileSync(join(sourceDir, path), 'utf8') !== state.policy.sources[path]) throw new Error('RETEST_SOURCE_MISMATCH');
    }
    const { decide, RULE_IDS } = await import(pathToFileURL(join(sourceDir, 'src/decider.mjs')).href);
    const { detect } = await import(pathToFileURL(join(sourceDir, 'src/detect.mjs')).href);
    const aId = '20000000-0000-4000-8000-000000000001';
    for (const [name, actor, id, expected] of [
      ['A 자기 자료 읽기', ACCOUNT_A, aId, true], ['B 자기 복구 자료 읽기', ACCOUNT_B, TARGET_ID, true],
      ['B의 A 자료 읽기 거부', ACCOUNT_B, aId, false], ['A의 B 자료 읽기 거부', ACCOUNT_A, TARGET_ID, false],
      ['무신원 자료 읽기 거부', undefined, TARGET_ID, false],
    ]) {
      const observed = trialRead(dir, actor, id);
      record({ name, expected, observed, status: observed === expected ? 'passed' : 'failed' });
    }
    for (const result of await checkDecider({ decide, ruleIds: RULE_IDS })) {
      record({ name: result.name, status: result.passed ? 'passed' : 'failed' });
    }
    for (const result of await checkDetection(detect)) {
      record({ name: result.name, status: result.passed ? 'passed' : 'failed' });
    }
    const { normal } = fixtureRequests();
    for (const [name, patch, expected] of [
      ['메모 전체 목록 거부', { path: '/notes', route: 'GET /notes' }, 'deny'],
      ['공지 단건 읽기', { service: 'announcements', path: '/announcements/demo', route: 'GET /announcements/:id' }, 'allow'],
      ['공지 쓰기 거부', { service: 'announcements', method: 'PUT', path: '/announcements/demo', route: 'PUT /announcements/:id' }, 'deny'],
      ['강사 자료 거부', { service: 'instructor-materials', path: '/instructor-materials/demo', route: 'GET /instructor-materials/:id' }, 'deny'],
      ['미지 경로 거부', { path: '/notes/demo/nested' }, 'deny'],
      ['쿼리 선택 거부', { queryLength: 1 }, 'deny'],
    ]) {
      const observed = (await decide({ ...normal, ...patch })).decision;
      record({ name, expected, observed, status: observed === expected ? 'passed' : 'failed' });
    }
    // Abort if policy, notes or audit changed while asynchronous tests ran.
    const after = inspectRestored(root, dir);
    if (after.stateHash !== restored.stateHash || digest(readState(dir)) !== restored.stateHash) throw new Error('RETEST_STATE_CHANGED');
    report.status = report.results.every(result => result.status === 'passed') ? 'passed' : 'failed';
  } catch {
    report.status = 'blocked';
    report.error = 'RETEST_BACKUP_OR_RESTORED_STATE_UNVERIFIED';
  }
  report.finishedAt = new Date().toISOString();
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
