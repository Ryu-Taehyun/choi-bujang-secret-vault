import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { initialize, invade, policyPlan, restorePolicy } from '../src/recovery.mjs';
import { recoveryHandler } from '../src/recovery-http.mjs';

const root = resolve(import.meta.dirname, '..');
const dir = resolve(root, '.recovery-private');
const [command, confirmation] = process.argv.slice(2);
try {
  let result;
  if (command === 'init') result = initialize(root, dir);
  else if (command === 'invade') result = invade(root, dir);
  else if (command === 'plan') result = policyPlan(root, dir);
  else if (command === 'apply') result = restorePolicy(root, dir, confirmation);
  else if (command === 'serve') {
    const server = createServer(recoveryHandler(root, dir));
    server.listen(43110, '127.0.0.1', () => console.log('recovery-lab: http://127.0.0.1:43110 (local B fixture only)'));
    server.on('error', () => { console.error('RECOVERY_SERVER_UNAVAILABLE'); process.exitCode = 1; });
  } else throw new Error('RECOVERY_COMMAND_REQUIRED');
  if (result) console.log(JSON.stringify(result, null, 2));
} catch {
  console.error('복구 중단: 사본·해시·대상·확인 계획을 검사하세요. 원문은 출력하지 않습니다.');
  process.exitCode = 1;
}
