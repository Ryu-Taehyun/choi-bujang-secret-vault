// 로컬 탐지 연습: 제안만 반환하며 접속이나 기기 권한을 변경하지 않습니다.
// 반 엔진이 검증한 사건만 전달해야 하며, 브라우저가 보낸 사용자 번호는 받지 않습니다.
function readEvent(event) {
  const at = event?.at;
  const method = event?.method;
  const subject = event?.identity?.sub;
  if (typeof at !== 'string' || typeof method !== 'string'
      || typeof subject !== 'string' || !subject.trim()) {
    throw new TypeError('invalid_detection_event');
  }
  const time = Date.parse(at);
  if (!Number.isFinite(time)) throw new TypeError('invalid_detection_event');
  return { time, method, subject };
}

export function detect(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  const reads = new Map();
  for (const event of events) {
    const { time, method, subject } = readEvent(event);
    if (method !== 'GET') continue;
    if (!reads.has(subject)) reads.set(subject, []);
    reads.get(subject).push(time);
  }
  for (const [subject, times] of reads) {
    times.sort((a, b) => a - b);
    let left = 0;
    for (let right = 0; right < times.length; right += 1) {
      // 양 끝 시각의 차이가 정확히 10분인 사건도 같은 창에 포함합니다.
      while (times[right] - times[left] > 10 * 60 * 1000) left += 1;
      if (right - left + 1 > 120) {
        return { action: 'propose_revocation', reasonCode: 'burst_read', subject };
      }
    }
  }
  return { action: 'observe' };
}
