import assert from 'node:assert/strict';
import test from 'node:test';
import { decide } from '../src/decider.mjs';
import { inspectAccessSignals } from '../src/access-signals.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

test('missing signals and client headers never become fixture telemetry', () => {
  const { normal } = fixtureRequests();
  for (const patch of [
    { signals: undefined }, { recentEvents: undefined },
    { signals: { ...normal.signals, source: 'client_header' } },
    { signals: { source: 'none', region: 'unknown', network: 'unknown', hour: 14 } },
    ...['source', 'region', 'network', 'hour'].map(key => {
      const signals = { ...normal.signals }; delete signals[key]; return { signals };
    }),
    { signals: { ...normal.signals, hour: '3' } },
    { recentEvents: [{ kind: 'risk_signal', ageSeconds: -1, count: 20 }] },
  ]) {
    const input = { ...normal, ...patch, headers: { 'x-source': 'judge_fixture',
      'x-region': 'local', 'x-network': 'usual', 'x-hour': '14' } };
    const before = structuredClone(input);
    assert.equal(inspectAccessSignals(input).fixture, null);
    assert.deepEqual(input, before);
  }
});

test('combined fixture requests step-up; region alone never blocks', async () => {
  const { normal, suspicious } = fixtureRequests();
  assert.equal((await decide(normal)).decision, 'allow');
  assert.equal((await decide(suspicious)).reasonCode, 'step_up_required');
  assert.equal((await decide({ ...suspicious, headers: {
    'x-network': 'usual', 'x-hour': '14', 'x-step-up-verified': 'true',
  } })).decision, 'step_up');
  for (const signals of [
    { ...normal.signals, region: 'foreign' },
    { ...suspicious.signals, hour: 14 },
    { ...suspicious.signals, network: 'usual' },
  ]) assert.equal((await decide({ ...suspicious, signals })).decision, 'allow');
  assert.equal((await decide({ ...suspicious, recentEvents: [] })).decision, 'allow');
});

test('fixture confirmation must be fresh; device rule still takes priority', async () => {
  const { suspicious } = fixtureRequests();
  for (const age of [0, 60, 900]) assert.equal((await decide({ ...suspicious,
    stepUp: { verified: true, authAgeSeconds: age } })).decision, 'allow');
  for (const age of [-1, 901, null, '60']) assert.equal((await decide({ ...suspicious,
    stepUp: { verified: true, authAgeSeconds: age } })).decision, 'step_up');
  for (const deviceRegistered of [false, undefined, 'true']) {
    const result = await decide({ ...suspicious, deviceRegistered,
      stepUp: { verified: true, authAgeSeconds: 60 } });
    assert.equal(result.decision, 'deny');
    assert.equal(result.reasonCode, 'device_not_registered');
  }
  assert.equal((await decide({ ...suspicious, method: 'POST',
    route: 'POST /notes' })).decision, 'deny');
});
