import { CHECKLIST, summarize, evidenceRows } from './operations-model.mjs';
const $ = selector => document.querySelector(selector);
const labels = { matched: '기대 일치', mismatch: '기대 불일치', request_failed: '요청 실패', not_run: '미실행' };
let snapshot, manual = new Map(), generation = 0;
const stamp = value => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) + ' KST' : '—';
function render() {
  const observations = [...(snapshot?.observations ?? []), ...manual.values()];
  const stats = summarize(observations);
  $('#ops-metrics').replaceChildren(...[['실제 요청', stats.attempted], ['HTTP 응답 확인', stats.received], ['HTTP 기대 일치', stats.matched], ['불일치·접속 실패', stats.mismatched + stats.failed]].map(([name, value]) => {
    const box = document.createElement('div'); box.className = 'metric';
    const count = document.createElement('strong'); count.textContent = snapshot ? value : '—';
    const label = document.createElement('span'); label.textContent = name; box.append(count, label); return box;
  }));
  $('#ops-matrix').replaceChildren(...evidenceRows(observations).map(check => {
    const tr = document.createElement('tr'), obs = check.observation;
    const cells = [check.stage, check.kind === 'normal' ? '정상' : '금지', check.expected,
      obs ? `${obs.httpStatus === null ? 'HTTP 미확인' : 'HTTP ' + obs.httpStatus} · ${labels[obs.verdict]}` : `미실행${check.requirement ? ' · ' + check.requirement : ''}`,
      obs ? `${obs.requestId} (관측 ID)` : '—', stamp(obs?.checkedAt)];
    for (const text of cells) { const td = document.createElement('td'); td.textContent = text; tr.append(td); }
    tr.children[3].className = check.status; return tr;
  }));
  if (!snapshot) return;
  const deployment = snapshot.observations.find(row => row.probe === 'deployment')?.deployment;
  $('#ops-commit').textContent = `검사 코드 커밋: ${snapshot.checkedCommit ?? '미확인'} · 응답 배포 커밋: ${deployment?.commit ?? '미확인'} · ${stamp(snapshot.generatedAt)}`;
  $('#ops-rules').textContent = snapshot.policy.rules.join(' · ');
  $('#ops-detection').textContent = `burst_read · 10분 GET 120건 초과 / 운영 사건 수 미확인 · 미연결`;
  $('#ops-revocation').textContent = '실제 회수 집행: 미실행·미연결 (0건으로 추정하지 않음)';
  $('#ops-recovery').textContent = `구성 사본 ${snapshot.recovery.configuredVersion} / 검증 사본 ${snapshot.recovery.verifiedCopyVersion ?? '미검증'} / 운영 복원 버전 ${snapshot.recovery.restoredLiveVersion ?? '미확인'} · ${snapshot.recovery.copyVerification}`;
  $('#ops-attacks').textContent = '공식 41종 시험: 미실행 · 실행/통과 건수 미확인. 이 표의 HTTP 점검을 공식 통과로 합산하지 않습니다.';
  $('#ops-records').textContent = JSON.stringify({ snapshotId: snapshot.snapshotId, checkedCommit: snapshot.checkedCommit,
    generatedAt: snapshot.generatedAt, summary: stats, observations, checklist: evidenceRows(observations),
    officialAttacks: snapshot.officialAttacks, policy: snapshot.policy, detection: snapshot.detection,
    revocation: snapshot.revocation, recovery: snapshot.recovery, limitation: snapshot.limitation }, null, 2);
  $('#ops-export').disabled = false;
}
async function confirmDevice() {
  $('#ops-note-run').disabled = true;
  try {
    const session = await (await fetch('/api/session', { cache: 'no-store', credentials: 'same-origin' })).json();
    if (session.signedIn !== true) throw new Error();
    const response = await fetch('/api/device', { cache: 'no-store', credentials: 'same-origin' });
    const device = await response.json();
    if (!response.ok || device.registered !== true || device.state !== 'approved') throw new Error();
    $('#ops-auth-status').textContent = '서버의 기기 승인을 확인했습니다. 본문을 받지 않고 한 건의 GET 상태만 기록합니다.';
    $('#ops-note-run').disabled = false;
  } catch { $('#ops-auth-status').textContent = '로그인·기기 승인 또는 등록부 준비가 필요합니다. 보호 자료 실측은 미실행입니다.'; }
}
$('#ops-refresh').addEventListener('click', async () => {
  const version = ++generation;
  $('#ops-refresh').disabled = true; $('#ops-status').textContent = '서버가 고정된 경로의 실제 HTTP 응답을 확인하는 중입니다.';
  try {
    const response = await fetch('/api/operations', { cache: 'no-store' });
    const value = await response.json();
    if (!response.ok || value.schema !== 'vault.operations.v1') throw new Error();
    if (version !== generation) return;
    snapshot = value; manual.clear(); render();
    $('#ops-status').textContent = `관측 완료 · snapshot ${snapshot.snapshotId} · 15초 이내 재요청은 같은 기록/시각을 재사용할 수 있습니다.`;
    await confirmDevice();
  } catch { $('#ops-status').textContent = '새 관측 실패. 이전 기록이 있으면 그 시각 그대로 남깁니다. 성공 결과를 추가하지 않았습니다.'; }
  finally { $('#ops-refresh').disabled = false; }
});
$('#ops-note-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!snapshot) return;
  const version = generation;
  $('#ops-note-run').disabled = true;
  try {
    const response = await fetch('/api/operations', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ probe: $('#ops-note-kind').value, targetId: $('#ops-note-id').value.trim() }) });
    const result = await response.json();
    if (!response.ok || result.schema !== 'vault.observation.v1') throw new Error();
    if (version !== generation) return;
    manual.set(result.observation.probe, result.observation); render();
    $('#ops-auth-status').textContent = '이 한 건의 실제 HTTP 결과를 기록했습니다. 404의 대상 존재 여부는 상대 계정에서 별도 확인해야 합니다.';
  } catch { $('#ops-auth-status').textContent = '관측하지 못했습니다. 해당 행을 통과로 채우지 않았습니다.'; }
  finally { $('#ops-note-id').value = ''; await confirmDevice(); }
});
$('#ops-export').addEventListener('click', () => {
  if (!snapshot) return;
  const url = URL.createObjectURL(new Blob([$('#ops-records').textContent], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'operations-masked-evidence.json'; link.click(); URL.revokeObjectURL(url);
});
window.addEventListener('offline', () => { generation++; $('#ops-note-run').disabled = true; $('#ops-note-id').value = ''; $('#ops-status').textContent = '오프라인 · 이전 기록의 시각을 확인하세요. 새 실측은 하지 않습니다.'; });
render(); $('#ops-refresh').click();
