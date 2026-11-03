// Cumulative current policy checklist. These are 22 planned checks, NOT the
// official 41-attack catalogue and NOT claims about historical stage results.
const row = (stage, kind, expected, probe = null, requirement = null) => ({
  id: `s${stage}-${kind}`, stage, kind, expected, probe, requirement,
});
export const CHECKLIST = Object.freeze([
  row(1, 'normal', '자료실 문서 HTTP 200', 'page'),
  row(1, 'forbidden', '이전 정적 자료 HTTP 404', 'static'),
  row(2, 'normal', '서버 자료 호출 화면 HTTP 200 (자료 읽기는 별도)', 'page'),
  row(2, 'forbidden', '정적 data.json 제거 HTTP 404', 'static'),
  row(3, 'normal', '실제 계정 로그인·세션 검증 성공', null, '실제 계정 시험'),
  row(3, 'forbidden', '무로그인 자료 HTTP 401', 'anonymous-notes'),
  row(4, 'normal', '승인 기기의 자기 메모 단건 HTTP 200', 'own-note', '승인 계정·본인 시험 메모 ID'),
  row(4, 'forbidden', '존재를 따로 확인한 타인 메모 HTTP 404', 'other-note', '상대 계정에서 존재 확인한 시험 메모 ID'),
  row(5, 'normal', '보호 경유 자기 메모 HTTP 200', 'own-note', '승인 계정·본인 시험 메모 ID'),
  row(5, 'forbidden', '원본 API 우회 읽기 거부', null, '원본 API 검사 계약·권한 준비'),
  row(6, 'normal', '엔진 등록 기기 요청 allow', null, '운영 ALEPH SDP 엔진 기록'),
  row(6, 'forbidden', '엔진 미등록 기기 요청 deny', null, '운영 ALEPH SDP 엔진 기록'),
  row(7, 'normal', '가상/운영 구분 후 재확인 요청 allow', null, '검증된 재인증·엔진 기록'),
  row(7, 'forbidden', '복합 이상 요청 step_up', null, '운영 이상 사건·엔진 기록'),
  row(8, 'normal', '같은 반 공지 단건 HTTP 200', null, '계정·반 소속·공지 DB'),
  row(8, 'forbidden', '공지 학생 경로 쓰기 HTTP 405', 'announcement-write'),
  row(9, 'normal', '검증된 정상 사건 observe', null, '운영 검증 사건 전달 기록'),
  row(9, 'forbidden', '폭주 사건 propose_revocation 및 별도 집행 검증', null, '운영 사건·회수 집행 기록'),
  row(10, 'normal', 'B 한 건 복구 후 ID·소유자·내용 해시 일치', null, '비공개 사본·승인된 복구 시험'),
  row(10, 'forbidden', '사본 누락·변조 시 쓰기 0건', null, '격리 복구 시험 및 쓰기 기록'),
  row(11, 'normal', '서버 승인 확인 뒤 자기 메모 HTTP 200', 'own-note', '기기 등록부·승인 계정'),
  row(11, 'forbidden', '무로그인 기기 상태 HTTP 401', 'anonymous-device'),
]);
export function evidenceRows(observations) {
  const byProbe = new Map(observations.map(item => [item.probe, item]));
  return CHECKLIST.map(check => ({ ...check, observation: byProbe.get(check.probe) ?? null,
    status: byProbe.get(check.probe)?.verdict ?? 'not_run' }));
}
export function summarize(observations) {
  // One counter set from the same distinct records displayed in masked log.
  return { attempted: observations.length,
    received: observations.filter(row => Number.isInteger(row.httpStatus)).length,
    matched: observations.filter(row => row.verdict === 'matched').length,
    mismatched: observations.filter(row => row.verdict === 'mismatch').length,
    failed: observations.filter(row => row.verdict === 'request_failed').length };
}
