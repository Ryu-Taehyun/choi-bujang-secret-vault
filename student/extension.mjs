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
    renderDecision() { return '학생 구현 대기: 서버의 판정과 이유를 연결하세요.'; },
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
