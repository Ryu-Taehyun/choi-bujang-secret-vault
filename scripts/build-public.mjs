import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploymentIdentity } from './deployment-identity.mjs';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));
const data = JSON.parse(await readFile(resolve(root, 'data.json'), 'utf8'));
if (!Array.isArray(data.notes) || data.notes.length !== 0) {
  throw new Error('공개 data.json에는 메모를 넣을 수 없습니다.');
}
await mkdir(resolve(root, 'public'), { recursive: true });
// Never copy source data into the static deployment.
await writeFile(resolve(root, 'public', 'data.json'), '{"notes":[]}\n', 'utf8');
console.log('공개 자료 목록을 비웠습니다.');
if (!process.argv.includes('--local')) {
  const identity = deploymentIdentity(process.env, config);
  await writeFile(resolve(root, 'public', 'aleph.json'),
    `${JSON.stringify(identity, null, 2)}\n`, 'utf8');
  console.log('배포 저장소·커밋·주소를 public/aleph.json에 기록했습니다.');
}
