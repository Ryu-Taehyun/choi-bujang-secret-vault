import test from 'node:test';
import assert from 'node:assert/strict';
import { detect } from '../src/detect.mjs';

const start = Date.UTC(2026, 9, 1);
const event = (offset, sub = 'learner_fixture', method = 'GET') => ({
  at: new Date(start + offset).toISOString(), method, identity: { sub },
});
const observe = { action: 'observe' };
const proposal = {
  action: 'propose_revocation', reasonCode: 'burst_read', subject: 'learner_fixture',
};

test('120/121건, 정확히 10분 경계와 경계 밖을 구분한다', () => {
  const first = Array.from({ length: 120 }, () => event(0));
  assert.deepEqual(detect(first), observe);
  assert.deepEqual(detect([...first, event(600_000)]), proposal);
  assert.deepEqual(detect([...first, event(600_001)]), observe);
});

test('정렬되지 않은 이동 창과 같은 시각의 사건을 센다; 입력을 변경하지 않는다', () => {
  const events = [event(0), ...Array.from({ length: 121 }, (_, i) => event(590_000 + i * 1000))].reverse();
  const original = structuredClone(events);
  assert.deepEqual(detect(events), proposal);
  assert.deepEqual(events, original);
  assert.deepEqual(detect(Array.from({ length: 121 }, () => event(0))), proposal);
});

test('다른 사용자와 GET 이외 요청을 합치지 않는다', () => {
  const events = Array.from({ length: 120 }, () => event(0));
  assert.deepEqual(detect([...events, event(0, 'other_fixture'), event(0, 'learner_fixture', 'POST')]), observe);
  assert.deepEqual(detect(Array.from({ length: 200 }, (_, i) => event(i * 7000))), observe);
  assert.deepEqual(detect([]), observe);
});

test('세 입력값 밖의 필드는 읽지 않는다', () => {
  const events = Array.from({ length: 121 }, () => {
    const identity = new Proxy({ sub: 'learner_fixture' }, {
      get(target, key) { assert.equal(key, 'sub'); return target[key]; },
    });
    return new Proxy({ at: new Date(start).toISOString(), method: 'GET', identity }, {
      get(target, key) { assert.ok(['at', 'method', 'identity'].includes(key)); return target[key]; },
    });
  });
  assert.deepEqual(detect(events.slice(0, 120)), observe);
  assert.deepEqual(detect(events), proposal);
});

test('누락 또는 잘못된 입력은 원문 없는 고정 오류로 거부한다', () => {
  assert.throws(() => detect(null), { message: 'invalid_detection_events' });
  for (const invalid of [null, {}, event(0, ''), { ...event(0), at: 'invalid' },
    { ...event(0), method: null }, { ...event(0), identity: {} }]) {
    assert.throws(() => detect([invalid]), { message: 'invalid_detection_event' });
  }
});
