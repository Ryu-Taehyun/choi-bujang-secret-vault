// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.

const MODE_TEXT = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' };
const DEVICE_STATUS_TEXT = { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' };
const SESSION_STATUS_TEXT = { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };
const WARN_DEVICE = new Set(['noncompliant']);
const WARN_SESSION = new Set(['expired', 'revoked']);

function el(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

// 정상처럼 보이지 않아야 하는 상태는 색상이 아니라 글자("주의:")로도 구분합니다.
function statusText(map, warnSet, value) {
  const label = map[value] ?? '확인 불가';
  return warnSet.has(value) ? `주의: ${label}` : label;
}

// 하나의 영역(me·devices·sessions)을 상태에 맞게 그립니다.
// 매 호출마다 새 요소를 만들므로 이전 값이 남지 않습니다.
function renderPart(title, part, renderOk) {
  const section = el('section');
  section.appendChild(el('h4', title));
  const modeText = MODE_TEXT[part?.mode];
  if (modeText) section.appendChild(el('p', `자료 출처: ${modeText}`));

  const status = part?.status;
  if (status === 'loading') {
    section.appendChild(el('p', '불러오는 중'));
  } else if (status === 'error') {
    const message = part?.error?.message;
    section.appendChild(el('p', `연결 실패: ${message ? message : '서버 메시지 없음'}`));
  } else if (status === 'ok' && part?.data != null) {
    renderOk(section, part.data);
  } else if (status === 'ok') {
    section.appendChild(el('p', '확인 불가: 받은 자료 없음'));
  } else {
    section.appendChild(el('p', '확인 불가'));
  }
  return section;
}

function row(list, term, value) {
  list.appendChild(el('dt', term));
  list.appendChild(el('dd', value));
}

function renderMe(section, data) {
  const list = el('dl');
  row(list, '사용자', `${data.user?.label ?? '확인 불가'} (ID: ${data.user?.id ?? '확인 불가'})`);
  row(list, '현재 기기', `${data.device?.label ?? '확인 불가'} (ID: ${data.device?.id ?? '확인 불가'})`);
  row(list, '현재 기기 상태', statusText(DEVICE_STATUS_TEXT, WARN_DEVICE, data.device?.status));
  row(list, '현재 세션', `ID: ${data.session?.id ?? '확인 불가'}`);
  row(list, '현재 세션 상태', statusText(SESSION_STATUS_TEXT, WARN_SESSION, data.session?.status));
  section.appendChild(list);
}

function renderList(items, toText) {
  return (section) => {
    if (!Array.isArray(items) || items.length === 0) {
      section.appendChild(el('p', Array.isArray(items) ? '항목 없음' : '확인 불가: 목록 형식이 아님'));
      return;
    }
    const list = el('ul');
    for (const item of items) list.appendChild(el('li', toText(item)));
    section.appendChild(list);
  };
}

// 판정은 한국어 뜻과 원래 코드값을 함께 글자로 표시합니다.
// 목록에 없는 값은 허용으로 읽히지 않도록 확인 불가(unknown)로 처리하고 받은 값을 함께 적습니다.
function decisionText(decision) {
  switch (decision) {
    case 'allow': return '접근 허용(allow) — 정책상 허용이며 앱 접속 성공을 보장하지 않습니다.';
    case 'deny': return '접근 거부(deny)';
    case 'challenge': return '추가 확인 필요(challenge) — 이 화면은 추가 인증을 대신 수행하지 않습니다.';
    case 'unknown': return '확인 불가(unknown) — 접근이 허용되지 않음';
    default: return `확인 불가(unknown) — 접근이 허용되지 않음 (받은 값: ${String(decision)})`;
  }
}

export function createStudentView() {
  return {
    renderIdentity({ me, devices, sessions } = {}) {
      const root = el('div');
      root.appendChild(el('h3', '로그인 사용자·기기·세션'));
      root.appendChild(renderPart('현재 계정', me, renderMe));
      root.appendChild(renderPart('등록 기기', devices, (section, data) => renderList(data, (d) =>
        `${d?.label ?? '확인 불가'} (ID: ${d?.id ?? '확인 불가'}): ${statusText(DEVICE_STATUS_TEXT, WARN_DEVICE, d?.status)}`)(section)));
      root.appendChild(renderPart('로그인 세션', sessions, (section, data) => renderList(data, (s) =>
        `ID: ${s?.id ?? '확인 불가'}: ${statusText(SESSION_STATUS_TEXT, WARN_SESSION, s?.status)}`)(section)));
      return root;
    },
    renderDecision({ status, mode, data, error, appId } = {}) {
      const root = el('div');
      root.appendChild(el('h3', '업무 앱 접근 판정'));
      const modeText = MODE_TEXT[mode];
      if (modeText) root.appendChild(el('p', `자료 출처: ${modeText}`));

      if (status === 'idle') {
        root.appendChild(el('p', '앱을 골라 접속을 요청하세요.'));
        return root;
      }
      if (status === 'loading') {
        root.appendChild(el('p', `대상 앱: ${appId ?? '확인 불가'}`));
        root.appendChild(el('p', '판정 확인 중'));
        return root;
      }
      if (status === 'error') {
        // 요청 실패는 서버 판정을 받지 못한 것으로, 접근 거부 판정과 다르게 표시합니다.
        const message = error?.message;
        root.appendChild(el('p', `대상 앱: ${appId ?? '확인 불가'}`));
        root.appendChild(el('p', `요청 실패: ${message ? message : '서버 메시지 없음'}`));
        root.appendChild(el('p', '판정을 받지 못했습니다. 접근 거부 판정이 아니며, 접근이 허용된 것도 아닙니다.'));
        return root;
      }
      if (status !== 'ok' || data == null) {
        root.appendChild(el('p', `대상 앱: ${appId ?? '확인 불가'}`));
        root.appendChild(el('p', '판정: 확인 불가(unknown) — 접근이 허용되지 않음'));
        return root;
      }

      root.appendChild(el('p', `대상 앱: ${data.appId ?? appId ?? '확인 불가'}`));
      root.appendChild(el('p', `판정: ${decisionText(data.decision)}`));
      root.appendChild(el('p', `판정 이유: ${data.reason ? data.reason : '제공되지 않음'}`));
      root.appendChild(el('p', `판정 시각: ${data.checkedAt ? data.checkedAt : '제공되지 않음'}`));
      return root;
    },
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
