import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { RULE_IDS } from './decider.mjs';
import { loadSafe } from './recovery.mjs';
import { summarize, evidenceRows } from '../public/operations-model.mjs';

const PUBLIC_PROBES = [
  { probe: 'page', method: 'GET', path: '/', expectedStatus: 200 },
  { probe: 'static', method: 'GET', path: '/data.json', expectedStatus: 404 },
  { probe: 'anonymous-notes', method: 'GET', path: '/api/notes', expectedStatus: 401 },
  { probe: 'announcement-write', method: 'PUT', path: '/api/announcements/demo', expectedStatus: 405 },
  { probe: 'anonymous-device', method: 'GET', path: '/api/device', expectedStatus: 401 },
  { probe: 'manifest', method: 'GET', path: '/manifest.webmanifest', expectedStatus: 200 },
  { probe: 'session-state', method: 'GET', path: '/api/session', expectedStatus: 200 },
  { probe: 'deployment', method: 'GET', path: '/aleph.json', expectedStatus: 200 },
];
const commitOrNull = value => typeof value === 'string' && /^[a-f0-9]{40}$/iu.test(value) ? value : null;
function appBase(config) {
  const base = new URL(config.publicAppUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('INVALID_OPERATIONS_BASE');
  return base;
}
async function observe(config, spec, { fetchImpl = fetch, headers = {} } = {}) {
  const requestId = randomUUID();
  const record = { probe: spec.probe, source: 'student_server_http', method: spec.method,
    route: spec.maskedRoute ?? spec.path, expectedStatus: spec.expectedStatus,
    requestId, requestIdSource: 'operations_observer', upstreamRequestId: null,
    startedAt: new Date().toISOString(), checkedAt: null, httpStatus: null, verdict: 'request_failed' };
  try {
    const response = await fetchImpl(new URL(spec.path, appBase(config)), {
      method: spec.method, headers: { 'Cache-Control': 'no-cache', 'X-Request-Id': requestId, ...headers },
      redirect: 'error', signal: AbortSignal.timeout(8000), cache: 'no-store',
    });
    record.httpStatus = response.status;
    const upstreamId = response.headers.get('x-request-id');
    if (typeof upstreamId === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(upstreamId)) record.upstreamRequestId = upstreamId;
    record.verdict = response.status === spec.expectedStatus ? 'matched' : 'mismatch';
    if (spec.probe === 'deployment' && response.ok) {
      const value = await response.json();
      record.deployment = { step: Number.isInteger(value.step) && value.step >= 1 && value.step <= 12 ? value.step : null,
        commit: commitOrNull(value.commit), repositoryMatches: value.repoUrl?.toLowerCase?.().replace(/\/$/u, '') === config.repoUrl.toLowerCase().replace(/\/$/u, '') };
      if (record.deployment.step !== config.step || !record.deployment.repositoryMatches) record.verdict = 'mismatch';
    } else {
      // Never read or save note bodies, auth responses, error bodies or headers.
      try { await response.body?.cancel(); } catch {}
    }
  } catch { record.verdict = 'request_failed'; }
  record.checkedAt = new Date().toISOString();
  return record;
}
export async function collectOperations(config, { fetchImpl = fetch, commit = null, root = resolve(import.meta.dirname, '..') } = {}) {
  appBase(config);
  const observations = await Promise.all(PUBLIC_PROBES.map(spec => observe(config, spec, { fetchImpl })));
  let recovery = { configuredVersion: 'stage9-safe-v1', copyVerification: 'unverified', verifiedCopyVersion: null,
    restoredLiveVersion: null, restoration: 'not_run', scope: 'recovery-lab/local-test' };
  try { const safe = loadSafe(root); recovery.copyVerification = 'verified_copy_only'; recovery.verifiedCopyVersion = safe.version; }
  catch { /* Missing or damaged backup never becomes an approved live restore. */ }
  return { schema: 'vault.operations.v1', snapshotId: randomUUID(), checkedCommit: commitOrNull(commit),
    generatedAt: new Date().toISOString(), source: 'student_server_http',
    summary: summarize(observations), observations, checklist: evidenceRows(observations),
    policy: { source: 'student_source_code', rules: [...RULE_IDS], activeEngineRevision: null },
    detection: { rule: 'burst_read', threshold: 120, windowMinutes: 10, status: 'not_connected', observedEvents: null, proposals: null },
    revocation: { status: 'not_connected', executed: null }, recovery,
    officialAttacks: { total: 41, status: 'not_run', executed: null, passed: null },
    limitation: 'HTTP status observations only; no live engine audit stream or judge verdict. Request IDs are observer-generated unless an upstream UUID is present.' };
}
export async function observeSelectedNote(config, input, { fetchImpl = fetch, headers = {} } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).sort().join(',') !== 'probe,targetId'
      || !['own-note', 'other-note'].includes(input.probe)
      || typeof input.targetId !== 'string'
      || input.targetId !== input.targetId.trim()
      || !/^(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|sample_note_[1-4])$/iu.test(input.targetId)) throw new Error('INVALID_OBSERVATION_TARGET');
  return observe(config, { probe: input.probe, method: 'GET', path: `/api/notes/${encodeURIComponent(input.targetId)}`,
    maskedRoute: '/api/notes/:id', expectedStatus: input.probe === 'own-note' ? 200 : 404 }, { fetchImpl, headers });
}
