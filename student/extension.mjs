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

// ---- 15단계: 접속 기록·XDR 경보 목록과 상세 보기 ----
const KIND_TEXT = { access: '접속', xdr: 'XDR 경보' };
const ACCESS_STATE_TEXT = { allowed: '접속 허용됨', denied: '접속 거부됨', unknown: '확인 불가' };
const NO_WARN = new Set();
const ALL = 'all';
let eventsViewSeq = 0;

function kindLabel(kind) {
  return KIND_TEXT[kind] ? `${KIND_TEXT[kind]}(${kind})` : `종류 확인 불가(${kind === '' || kind == null ? '값 없음' : kind})`;
}

// state 값은 한국어 뜻과 받은 원래 값을 함께 적습니다. 모르는 값은 정상으로 바꾸지 않고 확인 불가로 둡니다.
function stateLabel(map, warnSet, value) {
  if (value == null || value === '') return '확인 불가(unknown)';
  if (map[value] === undefined) return `확인 불가(unknown) — 받은 값: ${value}`;
  return `${statusText(map, warnSet, value)}(${value})`;
}

// 시각은 한국 시각으로 읽을 수 있게 하고 받은 원래 값도 함께 적습니다.
function formatAt(at) {
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) return at ? `시각 확인 불가 (원래 값: ${at})` : '시각 확인 불가';
  const kst = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(ms));
  return `${kst} KST (원래 값: ${at})`;
}

// 받은 배열을 복사해 at 기준 최신순으로 정렬합니다. 원본 배열은 바꾸지 않습니다.
function sortedEvents(list) {
  return list
    .map((event, index) => ({ event, index, ms: Date.parse(event.at) }))
    .sort((a, b) => {
      const aBad = Number.isNaN(a.ms);
      const bBad = Number.isNaN(b.ms);
      if (aBad && bBad) return a.index - b.index;
      if (aBad) return 1;
      if (bBad) return -1;
      return (b.ms - a.ms) || (a.index - b.index);
    })
    .map((item) => item.event);
}

function optionValues(events, pick) {
  const seen = new Set();
  const values = [];
  for (const event of events) {
    const value = pick(event);
    if (!seen.has(value)) { seen.add(value); values.push(value); }
  }
  return values;
}

function listField(items, toText, emptyText) {
  if (!Array.isArray(items)) return el('p', '확인 불가: 목록 형식이 아님');
  if (items.length === 0) return el('p', emptyText);
  const list = el('ul');
  for (const item of items) list.appendChild(el('li', toText(item)));
  return list;
}

function renderEventDetail(event) {
  const box = el('section');
  box.setAttribute('data-student-event-detail', String(event.id));
  box.appendChild(el('h4', '기록 상세'));
  const list = el('dl');
  row(list, '사건 ID', String(event.id ?? '확인 불가'));
  row(list, '앱(appId)', event.appId ? String(event.appId) : '앱을 확인할 수 없음(appId 없음)');
  box.appendChild(list);

  box.appendChild(el('h5', '근거(evidence)'));
  box.appendChild(listField(event.evidence, (item) => `${item?.id ?? '확인 불가'}: ${item?.text ?? '내용 없음'}`, '근거 없음'));
  box.appendChild(el('h5', '규칙(rules)'));
  box.appendChild(listField(event.rules, (item) => `${item?.id ?? '확인 불가'}: ${item?.text ?? '내용 없음'}`, '적용된 규칙 없음'));

  box.appendChild(el('h5', '상태(state)'));
  const states = el('dl');
  row(states, '접속 상태(state.access)', stateLabel(ACCESS_STATE_TEXT, NO_WARN, event.state?.access));
  row(states, '세션 상태(state.session)', stateLabel(SESSION_STATUS_TEXT, WARN_SESSION, event.state?.session));
  row(states, '기기 상태(state.device)', stateLabel(DEVICE_STATUS_TEXT, WARN_DEVICE, event.state?.device));
  box.appendChild(states);
  return box;
}

function renderEventList(events) {
  const seq = ++eventsViewSeq;
  const sorted = sortedEvents(events);
  const root = el('div');
  root.appendChild(el('p', '내 접속 기록과 서버에 이미 저장된 XDR 경보 중 최근 기록만 보여 줍니다. 전체 직원 로그나 실시간 위협 탐지가 아니며, 화면을 열 때 새로 탐지하지 않습니다.'));

  const filterDefs = [
    { name: '기록 종류', pick: (e) => String(e.kind ?? ''), text: (v) => (v === '' ? '종류 확인 불가(값 없음)' : kindLabel(v)) },
    { name: '업무 앱', pick: (e) => String(e.appId ?? ''), text: (v) => (v === '' ? '앱을 확인할 수 없음(appId 없음)' : v) },
    { name: '접속 상태', pick: (e) => String(e.state?.access ?? ''), text: (v) => (v === '' ? '확인 불가(값 없음)' : stateLabel(ACCESS_STATE_TEXT, NO_WARN, v)) },
  ];
  const filters = el('div');
  const selects = filterDefs.map((def, i) => {
    const id = `student-events-${seq}-filter-${i}`;
    const label = el('label', def.name);
    label.setAttribute('for', id);
    const select = el('select');
    select.id = id;
    const all = el('option', '전체');
    all.value = ALL;
    select.appendChild(all);
    for (const value of optionValues(sorted, def.pick)) {
      const option = el('option', def.text(value));
      option.value = value;
      select.appendChild(option);
    }
    filters.appendChild(label);
    filters.appendChild(select);
    return { def, select };
  });
  root.appendChild(filters);

  const count = el('p');
  count.setAttribute('role', 'status');
  const listBox = el('ul');
  const detailBox = el('div');
  detailBox.setAttribute('aria-live', 'polite');
  root.appendChild(count);
  root.appendChild(listBox);
  root.appendChild(detailBox);

  let selected = null;
  let visible = sorted;

  function drawDetail() {
    detailBox.replaceChildren();
    if (selected) detailBox.appendChild(renderEventDetail(selected));
    for (const button of listBox.querySelectorAll ? listBox.querySelectorAll('button') : []) {
      button.setAttribute('aria-expanded', String(button.__event === selected));
    }
  }

  function draw() {
    // 필터는 받은 배열 안에서만 걸러 냅니다.
    visible = sorted.filter((event) => selects.every(({ def, select }) => select.value === ALL || def.pick(event) === select.value));
    if (selected && !visible.includes(selected)) selected = null;
    count.textContent = `표시 중 ${visible.length}건 / 받은 기록 ${sorted.length}건`;
    listBox.replaceChildren();
    if (visible.length === 0) {
      listBox.appendChild(el('li', '선택한 조건에 맞는 기록이 없습니다.'));
    }
    for (const event of visible) {
      const item = el('li');
      item.setAttribute('data-student-event-id', String(event.id));
      item.appendChild(el('div', `사건 ID: ${event.id ?? '확인 불가'}`));
      item.appendChild(el('div', `시각: ${formatAt(event.at)}`));
      item.appendChild(el('div', `종류: ${kindLabel(event.kind)}`));
      item.appendChild(el('div', `앱: ${event.appId ? event.appId : '앱을 확인할 수 없음(appId 없음)'}`));
      item.appendChild(el('div', `요약: ${event.summary ?? '요약 없음'}`));
      const button = el('button', `${event.id} 상세`);
      button.type = 'button';
      button.__event = event;
      button.setAttribute('aria-expanded', String(event === selected));
      button.addEventListener('click', () => { selected = event; drawDetail(); });
      item.appendChild(button);
      listBox.appendChild(item);
    }
    drawDetail();
  }

  for (const { select } of selects) select.addEventListener('change', draw);
  draw();
  return root;
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
    renderEvents({ status, mode, data, error } = {}) {
      // 호출할 때마다 새 요소를 만들므로 이전 목록과 상세 선택이 남지 않습니다.
      const root = el('div');
      root.appendChild(el('h3', '접속 기록·XDR 경보'));
      const modeText = MODE_TEXT[mode];
      if (modeText) root.appendChild(el('p', `자료 출처: ${modeText}`));

      if (status === 'loading') {
        root.appendChild(el('p', '기록 불러오는 중'));
        return root;
      }
      if (status === 'CONTRACT_MISMATCH' || error?.code === 'CONTRACT_MISMATCH') {
        root.appendChild(el('p', '확인 불가: 받은 자료가 약속된 형식과 맞지 않습니다(CONTRACT_MISMATCH). 이전 목록은 표시하지 않습니다.'));
        return root;
      }
      if (status === 'error') {
        // 조회 실패는 빈 목록과 다르게, 이전 목록 없이 표시합니다.
        const message = error?.message;
        root.appendChild(el('p', `기록을 불러오지 못했습니다: ${message ? message : '서버 메시지 없음'}`));
        return root;
      }
      if (status !== 'ok') {
        root.appendChild(el('p', '확인 불가: 기록 상태를 알 수 없습니다.'));
        return root;
      }
      if (!Array.isArray(data) || data.some((event) => event == null || typeof event !== 'object')) {
        root.appendChild(el('p', '확인 불가: 받은 기록 형식이 맞지 않습니다. 이전 목록은 표시하지 않습니다.'));
        return root;
      }
      if (data.length === 0) {
        root.appendChild(el('p', '표시할 기록이 없습니다.'));
        return root;
      }
      root.appendChild(renderEventList(data));
      return root;
    },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
