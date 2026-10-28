import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploymentIdentity } from './deployment-identity.mjs';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));
if (!Number.isSafeInteger(config.step) || config.step < 2) {
  throw new Error('자료 분리 빌드에는 2단계 이후 설정이 필요합니다.');
}
const data = JSON.parse(await readFile(resolve(root, 'data.json'), 'utf8'));
if (!Array.isArray(data.notes) || data.notes.length !== 0) {
  throw new Error('코드 저장소의 data.json에는 메모를 넣을 수 없습니다.');
}
await mkdir(resolve(root, 'public'), { recursive: true });
// Remove stale output too; never publish database rows as a static asset.
await rm(resolve(root, 'public', 'data.json'), { force: true });
if (!process.argv.includes('--local')) {
  const identity = deploymentIdentity(process.env, config);
  await writeFile(resolve(root, 'public', 'aleph.json'),
    `${JSON.stringify(identity, null, 2)}\n`, 'utf8');
  console.log('배포 저장소·커밋·주소를 public/aleph.json에 기록했습니다.');
}
