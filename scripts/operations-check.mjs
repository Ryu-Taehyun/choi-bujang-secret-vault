import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import config from '../aleph.config.json' with { type: 'json' };
import { collectOperations } from '../src/operations.mjs';
const root = resolve(import.meta.dirname, '..');
try {
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  if (dirty) throw new Error('UNCOMMITTED_FILES');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  const snapshot = await collectOperations(config, { commit, root });
  mkdirSync(resolve(root, 'artifacts'), { recursive: true });
  writeFileSync(resolve(root, 'artifacts/operations-evidence.json'), JSON.stringify(snapshot, null, 2) + '\n');
  const cell = value => String(value ?? '—').replace(/\|/gu, '\\|').replace(/[\r\n]/gu, ' ');
  const table = ['# 1~11단계 API 관측표', '', `검사 코드 커밋: ${snapshot.checkedCommit ?? '미확인'}`,
    '', '실제 요청의 HTTP 상태만 기록합니다. 운영 엔진/보호 자료 실측과 공식 41종 시험은 별도입니다.', '',
    '| 단계 | 종류 | 기대 결과 | 실제 API 결과 | 요청 ID (작전실 관측자 발급) | 확인 시각 UTC |',
    '| --- | --- | --- | --- | --- | --- |',
    ...snapshot.checklist.map(item => {
      const observation = item.observation;
      return '| ' + [item.stage, item.kind === 'normal' ? '정상' : '금지', item.expected,
        observation ? `${observation.method} ${observation.route}: HTTP ${observation.httpStatus ?? '미확인'} / ${observation.verdict}` : `미실행: ${item.requirement ?? '관측 없음'}`,
        observation?.requestId, observation?.checkedAt].map(cell).join(' | ') + ' |';
    }), '', '공식 41종: 미실행. 실행하지 않은 항목에 성공을 기입하지 않습니다.',
  ];
  writeFileSync(resolve(root, 'artifacts/operations-evidence.md'), table.join('\n') + '\n');
  console.log(JSON.stringify({ checkedCommit: snapshot.checkedCommit, snapshotId: snapshot.snapshotId,
    summary: snapshot.summary, checklistNotRun: snapshot.checklist.filter(row => row.status === 'not_run').length,
    officialAttacks: snapshot.officialAttacks }, null, 2));
} catch { console.error('작전실 읽기 점검을 완료하지 못했습니다.'); process.exitCode = 1; }
