// Student self-checks only: never a judge verdict, and never include note bodies.
export async function runAttackChecks(config) {
  if (config.step !== 2) throw new Error('현재 자기 점검은 2단계용입니다.');
  const base = new URL(config.publicAppUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search
      || base.hash || base.pathname !== '/' || base.hostname.endsWith('.example')) {
    throw new Error('실제 HTTPS 배포 주소를 확인하세요.');
  }
  const attempts = [];
  async function check(attackId, path, method, expected, summarize) {
    let observed;
    try {
      const response = await fetch(new URL(path, base), {
        method, redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { 'Cache-Control': 'no-cache' },
      });
      observed = await summarize(response);
    } catch {
      observed = '요청 실패: 접속 또는 응답 처리를 확인하지 못함';
    }
    attempts.push({ attackId, expected, observed });
  }
  await check('page_load', '/', 'GET', '자료실 화면 HTTP 200', async r =>
    `HTTP ${r.status}; 화면 ${r.ok && (await r.text()).includes('/api/notes') ? '서버 자료 API 호출 확인' : '정상 화면 미확인'}`);
  await check('static_note_read', '/data.json', 'GET', '정적 data.json 제거: HTTP 404', async r => {
    let count = null;
    if (r.ok) {
      try { const data = await r.json(); if (Array.isArray(data.notes)) count = data.notes.length; } catch {}
    }
    return `HTTP ${r.status}; ${r.status === 404 ? '정적 파일 없음' : count === null ? '메모 제거 미확인' : '메모 건수 ' + count}`;
  });
  await check('public_api_read', '/api/notes', 'GET', '설정 완료 시 가상 메모 네 건; 공개 API 약점 별도 기록', async r => {
    let count = null;
    if (r.ok) {
      try { const data = await r.json(); if (Array.isArray(data.notes)) count = data.notes.length; } catch {}
    }
    return `HTTP ${r.status}; ${r.ok && count !== null ? '비로그인 메모 건수 ' + count + ' (공개 API 노출)' : '자료 조회 미확인; 보호 성공 아님'}`;
  });
  await check('api_method_rejection', '/api/notes', 'POST', 'GET 이외 메서드 HTTP 405', async r => `HTTP ${r.status}`);
  await check('deployment_identity', '/aleph.json', 'GET', '단계 2 및 저장소 일치; 배포 커밋 기록', async r => {
    if (!r.ok) return `HTTP ${r.status}; 배포 식별 정보 미확인`;
    const data = await r.json();
    const sameRepo = typeof data.repoUrl === 'string'
      && data.repoUrl.toLowerCase().replace(/\/$/u, '') === config.repoUrl.toLowerCase().replace(/\/$/u, '');
    const sha = typeof data.commit === 'string' && /^[a-f0-9]{40}$/iu.test(data.commit) ? data.commit : '미확인';
    return `HTTP ${r.status}; 단계 ${data.step === 2 ? '2 일치' : '불일치'}; 저장소 ${sameRepo ? '일치' : '불일치'}; 배포 커밋 ${sha}`;
  });
  return attempts;
}
