import { resolve } from 'node:path';
import { runRecoveryRetests } from '../src/recovery-retest.mjs';

const root = resolve(import.meta.dirname, '..');
try {
  const report = await runRecoveryRetests(root, resolve(root, '.recovery-private'));
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'passed') process.exitCode = 1;
} catch {
  console.error('복구 뒤 재시험 중단: 검증 가능한 사본·복원 상태가 필요합니다.');
  process.exitCode = 1;
}
