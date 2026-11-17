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

  // 16단계: 연결되지 않은 조치가 넘어온 경우에만 요청을 보내지 않는 비활성 안내 버튼을 둡니다.
  if (Array.isArray(event.supportedActions) && event.supportedActions.length > 0) {
    box.appendChild(el('h5', '조치(supportedActions)'));
    const actions = el('ul');
    for (const action of event.supportedActions) {
      const name = typeof action === 'string' ? action : (action?.id ?? action?.name ?? action?.action ?? '확인 불가');
      const item = el('li');
      const button = el('button', `${name} 미지원`);
      button.type = 'button';
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      item.appendChild(button);
      item.appendChild(el('span', ' 아직 지원하지 않는 조치입니다. 조치 실행 연결은 준비 중이며 요청을 보내지 않습니다.'));
      actions.appendChild(item);
    }
    box.appendChild(actions);
  }
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

// ---- 16단계: 기기·세션·알림·진단 상태와 도움정보 ----
const RETRY_GUIDE = '다시 시도는 위쪽 다시 불러오기 버튼을 직접 누르세요. 자동으로 다시 요청하지 않습니다.';
const SECRET_LIKE = /(sk-[A-Za-z0-9]{8,}|Bearer\s+\S+|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/;
const DIAG_FIELDS = [
  ['요청 ID(requestId)', (d) => d.requestId],
  ['구성요소(component)', (d) => d.component],
  ['버전(version)', (d) => d.version],
  ['확인 시각(checkedAt)', (d) => d.checkedAt],
  ['엔진 모드(engine.mode)', (d) => d.engine?.mode],
  ['엔진 코드(engine.code)', (d) => d.engine?.code],
];

function isTimeout(error) {
  return /timeout|timed out|시간\s*초과/i.test(`${error?.code ?? ''} ${error?.message ?? ''}`);
}

function safeValue(value) {
  if (value == null || value === '') return '확인 불가';
  const text = String(value).slice(0, 200);
  return SECRET_LIKE.test(text) ? '[가림]' : text;
}

// 자료 하나(devices·sessions·diagnostics)의 loading / ok / error를 서로 다른 문장으로 보여 줍니다.
function statusSection(title, what, part, build) {
  const section = el('section');
  section.appendChild(el('h4', title));
  const modeText = MODE_TEXT[part?.mode];
  if (modeText) section.appendChild(el('p', `자료 출처: ${modeText}`));
  const status = part?.status;
  if (status === 'loading') {
    section.appendChild(el('p', `${what} 불러오는 중`));
  } else if (status === 'error') {
    const message = part?.error?.message;
    section.appendChild(el('p', `${what}을(를) 불러오지 못했습니다${isTimeout(part?.error) ? ' (시간 초과)' : ''}: ${message ? message : '서버 메시지 없음'}`));
    section.appendChild(el('p', RETRY_GUIDE));
  } else if (status === 'ok') {
    build(section, part?.data);
  } else {
    section.appendChild(el('p', `확인 불가: ${what} 상태를 알 수 없습니다.`));
  }
  return section;
}

function buildDevices(section, data) {
  if (!Array.isArray(data)) {
    section.appendChild(el('p', '확인 불가: 목록 형식이 아님'));
  } else if (data.length === 0) {
    section.appendChild(el('p', '등록된 기기가 없습니다.'));
  } else {
    const list = el('ul');
    for (const d of data) {
      list.appendChild(el('li', `${d?.label ?? '확인 불가'} (ID: ${d?.id ?? '확인 불가'}): ${stateLabel(DEVICE_STATUS_TEXT, WARN_DEVICE, d?.status)}`));
    }
    section.appendChild(list);
  }
}

function buildSessions(section, data) {
  const items = Array.isArray(data) ? data : (data != null && typeof data === 'object' ? [data] : null);
  if (data != null && items === null) {
    section.appendChild(el('p', '확인 불가: 세션 형식이 아님'));
  } else if (items === null || items.length === 0) {
    section.appendChild(el('p', '현재 연결 없음'));
  } else {
    const list = el('ul');
    for (const s of items) {
      list.appendChild(el('li', `ID: ${s?.id ?? '확인 불가'}: ${stateLabel(SESSION_STATUS_TEXT, WARN_SESSION, s?.status)}`));
    }
    section.appendChild(list);
  }
  section.appendChild(el('p', '세션은 현재 검증된 연결 한 개만 표시하며 과거 세션은 포함하지 않습니다.'));
}

function renderNotifications(notifications) {
  const section = el('section');
  section.appendChild(el('h4', '알림'));
  if (!Array.isArray(notifications)) {
    section.appendChild(el('p', '확인 불가: 알림 형식이 맞지 않습니다.'));
  } else if (notifications.length === 0) {
    section.appendChild(el('p', '알림 없음: 주의할 알림이 없습니다.'));
  } else {
    const list = el('ul');
    for (const n of notifications) {
      list.appendChild(el('li', `자료(resource): ${n?.resource ?? '확인 불가'} / 코드(code): ${n?.code ?? '확인 불가'} / 메시지: ${n?.message ?? '메시지 없음'}`));
    }
    section.appendChild(list);
  }
  return section;
}

// 도움정보에는 허용한 진단 값 여섯 개만 넣습니다. 그 밖의 값은 복사하지 않습니다.
function helpText(part) {
  const data = part?.data;
  if (part?.status === 'ok' && data != null && typeof data === 'object') {
    return DIAG_FIELDS.map(([label, get]) => `${label}: ${safeValue(get(data))}`).join('\n');
  }
  return `진단 정보 없음 (상태: ${part?.status ?? '확인 불가'})`;
}

function renderDiagnostics(part) {
  const section = statusSection('진단 정보', '진단 정보', part, (target, data) => {
    if (data == null || typeof data !== 'object') {
      target.appendChild(el('p', '확인 불가: 받은 진단 정보가 없습니다.'));
      return;
    }
    const list = el('dl');
    for (const [label, get] of DIAG_FIELDS) row(list, label, safeValue(get(data)));
    target.appendChild(list);
  });
  section.appendChild(el('p', '도움정보 복사 버튼은 도움 요청에 쓸 점검 정보(요청 ID·구성요소·버전·확인 시각·엔진 상태)만 복사하며, 누를 때만 복사합니다. 비밀번호·토큰·API 키는 포함하지 않습니다.'));
  const button = el('button', '도움정보 복사');
  button.type = 'button';
  const result = el('p');
  result.setAttribute('role', 'status');
  button.addEventListener('click', async () => {
    try {
      const clipboard = globalThis.navigator?.clipboard;
      if (!clipboard?.writeText) throw new Error('clipboard unavailable');
      await clipboard.writeText(helpText(part));
      result.textContent = '도움정보를 복사했습니다.';
    } catch {
      result.textContent = '도움정보를 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.';
    }
  });
  section.appendChild(button);
  section.appendChild(result);
  return section;
}

// ---- 17단계: AI 연결 점검 결과와 사건 설명 실행을 구분 ----
const AI_SECRET_LIKE = /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+\S+|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|[A-Za-z0-9_-]{40,}|api[_-]?key\s*[:=]\s*\S+)/gi;
const AI_MANUAL_RETRY = '다시 점검은 현재 API 연결 점검 버튼을 직접 누르세요. 자동으로 다시 점검하지 않습니다.';
const AI_AUDIENCE_TEXT = {
  test: '시험 연결 점검(test)',
  verified: '앱 권한 확인 후 점검(verified)',
};

// 화면에는 안전한 code·message만 쓰고, 열쇠처럼 보이는 값은 가립니다.
function aiSafe(value, fallback) {
  if (value == null || value === '') return fallback;
  return String(value).slice(0, 300).replace(AI_SECRET_LIKE, '[가림]');
}

// 원인은 error.code로 나눕니다. 위에서부터 처음 맞는 항목을 씁니다.
const AI_ERROR_KINDS = [
  { test: /CANCEL|ABORT/i, title: '취소됨', guide: '점검이 취소되었습니다. 이전 결과는 현재 결과가 아닙니다.' },
  { test: /OUTSIDE_HOURS|TIME_WINDOW|USAGE_HOURS|SERVICE_HOURS|CLASS_HOURS|SCHEDULE/i, title: '이용 시간 아님', guide: '지금은 수업용 AI 이용 시간이 아닙니다. 이용 시간을 확인하세요.' },
  { test: /NO_MODEL|MODEL_NOT|MODEL_UNAVAILABLE|NO_USABLE_MODEL|MODELS?_EMPTY/i, title: '쓸 수 있는 모델 없음', guide: '담당자에게 모델 허용 설정 확인을 요청하세요.' },
  { test: /RATE_?LIMIT|TOO_MANY|THROTTL|TIMEOUT|TIMED_?OUT|NETWORK|ECONN|ENOTFOUND|FETCH_FAILED|429/i, title: '요청 제한·시간 초과·네트워크', guide: '잠시 뒤 직접 다시 점검하세요.' },
  { test: /QUOTA|USAGE|BUDGET|LIMIT/i, title: '반 사용량·이용 한도', guide: '담당자에게 사용량·한도 확인을 요청하세요.' },
  { test: /AUTH|UNAUTHORIZED|FORBIDDEN|RESTRICT|TOKEN|CREDENTIAL|DENIED|401|403/i, title: '인증 실패·접근 제한', guide: '계정 연결을 다시 확인하고, 계속되면 담당자에게 확인을 요청하세요.' },
  { test: /PREPAR|NOT_READY|PENDING|UNKNOWN|NATIVE_HOST|NOT_PROVISION|UNAVAILABLE|CONNECT/i, title: '권한 준비 중·확인 불가', guide: '운영 측 준비가 끝나지 않았을 수 있으며 학생 잘못이 아닙니다. 담당자에게 계정 연결과 앱 권한 확인을 요청하세요.' },
];

function classifyAiError(code) {
  return AI_ERROR_KINDS.find((kind) => kind.test.test(String(code ?? ''))) ?? {
    title: '원인 확인 불가',
    guide: '분류되지 않은 오류 코드입니다. 담당자에게 오류 코드와 함께 문의하세요.',
  };
}

function aiErrorLines(root, error) {
  const kind = classifyAiError(error?.code);
  root.appendChild(el('p', `원인 구분: ${kind.title}`));
  root.appendChild(el('p', `오류 코드(code): ${aiSafe(error?.code, '코드 없음')}`));
  root.appendChild(el('p', `오류 메시지(message): ${aiSafe(error?.message, '메시지 없음')}`));
  root.appendChild(el('p', `안내: ${kind.guide}`));
}

function renderAiOk(root, data, checkedAt, explanationAccepted) {
  if (data == null || typeof data !== 'object') {
    root.appendChild(el('p', '확인 불가: 받은 점검 결과가 없습니다.'));
    return;
  }
  root.appendChild(el('p', `연결 점검: ${data.transportChecked === true ? '완료(transportChecked)' : '확인 불가'}`));
  const audience = AI_AUDIENCE_TEXT[data.audienceAuthorization];
  root.appendChild(el('p', `점검 종류: ${audience ? audience : `확인 불가(unknown) — 받은 값: ${aiSafe(data.audienceAuthorization, '값 없음')}`}`));
  if (data.audienceAuthorization === 'test') {
    root.appendChild(el('p', '시험 연결이며 앱 권한 확인 결과가 아닙니다.'));
  } else if (data.audienceAuthorization === 'verified') {
    root.appendChild(el('p', '이 점검 시각 기준의 앱 권한 확인과 모델 응답입니다.'));
  }
  if (typeof data.modelCount === 'number' && Number.isFinite(data.modelCount)) {
    root.appendChild(el('p', `쓸 수 있는 모델 수(modelCount): ${data.modelCount}개`));
    if (data.modelCount === 0) {
      root.appendChild(el('p', '쓸 수 있는 모델 없음: 담당자에게 모델 허용 설정 확인을 요청하세요.'));
    }
  } else {
    root.appendChild(el('p', '쓸 수 있는 모델 수(modelCount): 확인 불가'));
  }
  const at = checkedAt ?? data.checkedAt;
  root.appendChild(el('p', `점검 시각(checkedAt): ${at ? formatAt(at) : '확인 불가'}`));
  if (data.help) root.appendChild(el('p', `도움말: ${aiSafe(data.help, '')}`));
  // 모델 목록 응답은 연결 점검일 뿐이며 사건 설명이 실행된 것이 아닙니다.
  if (explanationAccepted === true) {
    root.appendChild(el('p', '사건 설명 수락 표시를 받았습니다. 실제 설명 결과는 보안 기록의 설명 화면에서 확인하세요. 연결 점검만으로는 사건 설명 결과를 알 수 없습니다.'));
  } else {
    root.appendChild(el('p', '사건 설명은 아직 실행하지 않았습니다. 이 화면은 AI 연결 점검 결과만 보여 주며 사건 설명 결과가 아닙니다.'));
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
    renderStatus({ devices, sessions, notifications, diagnostics, mode } = {}) {
      // 호출할 때마다 새 요소를 만들므로 다시 불러와 성공하면 이전 실패 안내가 남지 않습니다. 자동 재요청은 하지 않습니다.
      const root = el('div');
      root.appendChild(el('h3', '기기·세션·알림·진단 상태'));
      const modeText = MODE_TEXT[mode];
      if (modeText) root.appendChild(el('p', `자료 출처: ${modeText}`));
      root.appendChild(statusSection('등록 기기', '등록 기기 목록', devices, buildDevices));
      root.appendChild(statusSection('현재 세션', '현재 세션', sessions, buildSessions));
      root.appendChild(renderNotifications(notifications));
      root.appendChild(renderDiagnostics(diagnostics));
      return root;
    },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection({ status, mode, data, error, checkedAt, explanationAccepted } = {}) {
      // 호출할 때마다 새 요소를 만들므로 재점검 성공이나 idle로 돌아올 때 이전 결과·오류 안내가 남지 않습니다.
      const root = el('div');
      root.appendChild(el('h3', 'AI 연결 점검'));
      const modeText = MODE_TEXT[mode];
      if (modeText) root.appendChild(el('p', `자료 출처: ${modeText}`));

      if (status === 'idle') {
        root.appendChild(el('p', 'AI 연결 점검 전'));
        root.appendChild(el('p', AI_MANUAL_RETRY));
      } else if (status === 'loading') {
        root.appendChild(el('p', 'AI 연결 점검 중'));
      } else if (status === 'ok') {
        renderAiOk(root, data, checkedAt, explanationAccepted);
        root.appendChild(el('p', AI_MANUAL_RETRY));
      } else if (status === 'error') {
        aiErrorLines(root, error);
        root.appendChild(el('p', AI_MANUAL_RETRY));
      } else {
        root.appendChild(el('p', '확인 불가: AI 연결 점검 상태를 알 수 없습니다.'));
      }
      return root;
    },
    renderExplanation({ event, explanation, checkedAt } = {}) {
      const root = el('div');
      const status = explanation?.status;
      if (status === 'ok') {
        // 사건 설명이 성공했을 때만 사건 ID 표식을 붙입니다.
        root.setAttribute('data-student-explanation-event', String(event?.id));
        root.appendChild(el('h3', '사건 설명'));
        root.appendChild(el('p', `사건 ID: ${event?.id ?? '확인 불가'}`));
        root.appendChild(el('p', `설명 요약: ${aiSafe(explanation?.data?.summary, '설명 요약 없음')}`));
        if (checkedAt) root.appendChild(el('p', `확인 시각: ${formatAt(checkedAt)}`));
      } else if (status === 'error') {
        root.appendChild(el('h3', '사건 설명'));
        root.appendChild(el('p', `사건 설명을 받지 못했습니다. 오류 코드(code): ${aiSafe(explanation?.error?.code, '코드 없음')}`));
        root.appendChild(el('p', `오류 메시지(message): ${aiSafe(explanation?.error?.message, '메시지 없음')}`));
        root.appendChild(el('p', '기록은 그대로입니다.'));
      } else if (status === 'loading') {
        root.appendChild(el('h3', '사건 설명'));
        root.appendChild(el('p', '사건 설명 중'));
      } else {
        root.appendChild(el('h3', '사건 설명'));
        root.appendChild(el('p', '사건 설명은 아직 실행하지 않았습니다.'));
      }
      return root;
    },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
