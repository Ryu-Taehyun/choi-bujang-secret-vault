import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export const TARGET_ID = '20000000-0000-4000-8000-000000000002';
export const ACCOUNT_B = '10000000-0000-4000-8000-000000000002';
export const ACCOUNT_A = '10000000-0000-4000-8000-000000000001';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const digest = value => sha256(JSON.stringify(value));
const fail = code => { throw new Error(code); };
// Pinned during the original safety-copy review. Never learn a trusted digest
// from the mutable backup or its neighbouring checksum file.
const TRUSTED_POLICY = Object.freeze({
  version: 'stage9-safe-v1',
  sourceCommit: '04a46e914962f4c954399def491f19cbdda0e53f',
  sha256: '7fa7cc0eb2682be9acb76f48a0012f19662da12bbf4e79f51e22061920263ecf',
});
const json = path => {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { fail('RECOVERY_COPY_MISSING_OR_INVALID'); }
};
export function loadSafe(root) {
  const raw = readFileSync(join(root, 'recovery/safe-policy.json'), 'utf8');
  const expected = readFileSync(join(root, 'recovery/safe-policy.sha256'), 'utf8').trim();
  if (expected !== TRUSTED_POLICY.sha256 || sha256(raw) !== TRUSTED_POLICY.sha256) {
    fail('POLICY_HASH_MISMATCH');
  }
  const copy = JSON.parse(raw);
  if (copy.version !== TRUSTED_POLICY.version || copy.sourceCommit !== TRUSTED_POLICY.sourceCommit
      || copy.schema !== 'vault.safe-policy.v1' || copy.policy.dbAccess.scope !== 'local-test'
      || copy.policy.dbAccess.ownerOnly !== true) fail('INVALID_SAFE_POLICY');
  return { ...copy, hash: expected };
}
export function readState(dir) { return json(join(dir, 'trial.json')); }
function withLock(dir, action) {
  let lock;
  try { lock = openSync(join(dir, 'writer.lock'), 'wx', 0o600); }
  catch { fail('RECOVERY_WRITER_BUSY'); }
  try { return action(); }
  finally { closeSync(lock); unlinkSync(join(dir, 'writer.lock')); }
}
// A single local transaction replaces policy/one note and appends an audit entry.
// All writers in the loopback service are synchronous, so plans cannot race writes.
export function writeState(dir, state, beforeReplace = () => {}) {
  const temp = join(dir, 'trial.tmp');
  try {
    writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
    if (digest(json(temp)) !== digest(state)) fail('RESTORE_STAGED_STATE_MISMATCH');
    // Last gate before publishing the candidate. A failed backup re-read must
    // leave trial.json and its audit history untouched.
    beforeReplace();
    renameSync(temp, join(dir, 'trial.json'));
  } catch (error) {
    try { unlinkSync(temp); } catch {}
    throw error;
  }
  const persisted = readState(dir);
  if (digest(persisted) !== digest(state)) fail('RESTORE_PERSISTED_STATE_MISMATCH');
  return persisted;
}
export function initialize(root, dir) {
  const safe = loadSafe(root);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const note = { id: TARGET_ID, owner_id: ACCOUNT_B,
    title: randomBytes(12).toString('hex'), content: randomBytes(24).toString('hex') };
  const backup = { version: 'stage10-b-fixture-v1', note };
  const raw = JSON.stringify(backup);
  const target = { version: backup.version, id: note.id, owner_id: note.owner_id,
    contentHash: digest([note.title, note.content]), backupHash: sha256(raw) };
  // Never overwrite a previous private backup or trial.
  writeFileSync(join(dir, 'note-backup.json'), raw, { flag: 'wx', mode: 0o600 });
  writeFileSync(join(dir, 'note-anchor.json'), JSON.stringify(target), { flag: 'wx', mode: 0o600 });
  writeFileSync(join(dir, 'trial.json'), JSON.stringify({
    policy: safe.policy,
    otherServices: { unrelated: { deny: true } },
    notes: [note, { id: '20000000-0000-4000-8000-000000000001', owner_id: ACCOUNT_A,
      title: randomBytes(12).toString('hex'), content: randomBytes(24).toString('hex') }],
    audit: [{ event: 'initialized', version: safe.version }],
  }), { flag: 'wx', mode: 0o600 });
  return target;
}
function differences(actual, expected, path = '') {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return [];
  if (actual && expected && typeof actual === 'object' && typeof expected === 'object'
      && !Array.isArray(actual) && !Array.isArray(expected)) {
    return [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort()
      .flatMap(key => differences(actual[key], expected[key], `${path}/${key}`));
  }
  return [{ path, before: actual ?? null, after: expected ?? null }];
}
export function policyPlan(root, dir) {
  const safe = loadSafe(root);
  const state = readState(dir);
  const plan = { kind: 'policy', version: safe.version, safeHash: safe.hash,
    stateHash: digest(state), changes: differences(state.policy, safe.policy) };
  return { ...plan, confirmation: digest(plan) };
}
export function invade(root, dir) {
  return withLock(dir, () => {
  loadSafe(root);
  const state = readState(dir);
  if (state.policy.dbAccess.ownerOnly !== true) fail('TRIAL_ALREADY_CHANGED');
  state.policy.dbAccess.ownerOnly = false;
  state.audit.push({ event: 'simulated_invasion', path: '/dbAccess/ownerOnly' });
  writeState(dir, state);
  return policyPlan(root, dir);
  });
}
export function restorePolicy(root, dir, confirmation) {
  return withLock(dir, () => {
  const plan = policyPlan(root, dir);
  if (confirmation !== plan.confirmation) fail('PLAN_CONFIRMATION_REQUIRED_OR_STALE');
  const safe = loadSafe(root);
  if (safe.hash !== plan.safeHash) fail('POLICY_COPY_CHANGED_AFTER_PLAN');
  const state = readState(dir);
  if (digest(state) !== plan.stateHash) fail('PLAN_CONFIRMATION_REQUIRED_OR_STALE');
  state.policy = safe.policy;
  state.audit.push({ event: 'policy_restored', version: plan.version, planHash: confirmation });
  const persisted = writeState(dir, state, () => {
    const latestSafe = loadSafe(root);
    if (latestSafe.hash !== plan.safeHash) fail('POLICY_COPY_CHANGED_BEFORE_REPLACE');
    if (digest(readState(dir)) !== plan.stateHash) fail('PLAN_CONFIRMATION_REQUIRED_OR_STALE');
  });
  if (digest(persisted.policy) !== digest(safe.policy)) fail('RESTORED_POLICY_MISMATCH');
  return { version: plan.version, policyHash: digest(persisted.policy), changed: plan.changes.length };
  });
}
function verifiedNote(dir) {
  const anchor = json(join(dir, 'note-anchor.json'));
  let raw;
  try { raw = readFileSync(join(dir, 'note-backup.json'), 'utf8'); }
  catch { fail('NOTE_COPY_MISSING'); }
  if (sha256(raw) !== anchor.backupHash) fail('NOTE_BACKUP_HASH_MISMATCH');
  const copy = JSON.parse(raw);
  const note = copy.note;
  if (anchor.id !== TARGET_ID || anchor.owner_id !== ACCOUNT_B || copy.version !== anchor.version
      || note?.id !== anchor.id || note.owner_id !== anchor.owner_id
      || typeof note.title !== 'string' || typeof note.content !== 'string'
      || digest([note.title, note.content]) !== anchor.contentHash) fail('NOTE_ID_OWNER_CONTENT_MISMATCH');
  return { anchor, note, anchorHash: digest(anchor) };
}
export function notePlan(root, dir, actor, id) {
  const safe = loadSafe(root);
  if (actor !== ACCOUNT_B || id !== TARGET_ID) fail('RESTORE_TARGET_FORBIDDEN');
  const { anchor, anchorHash } = verifiedNote(dir);
  const state = readState(dir);
  const current = state.notes.filter(note => note.id === id);
  if (current.length > 1 || (current.length && current[0].owner_id !== ACCOUNT_B)) {
    fail('RESTORE_OWNER_CONFLICT');
  }
  const before = current.length ? { id, owner_id: current[0].owner_id,
    contentHash: digest([current[0].title, current[0].content]) } : null;
  const plan = { kind: 'note', version: anchor.version, stateHash: digest(state),
    safeHash: safe.hash, backupHash: anchor.backupHash, anchorHash,
    changes: [{ id, before, after: { id, owner_id: anchor.owner_id, contentHash: anchor.contentHash } }] };
  return { ...plan, confirmation: digest(plan) };
}
export function restoreNote(root, dir, actor, id, confirmation) {
  return withLock(dir, () => {
  const plan = notePlan(root, dir, actor, id);
  if (confirmation !== plan.confirmation) fail('PLAN_CONFIRMATION_REQUIRED_OR_STALE');
  const safe = loadSafe(root);
  const { note, anchor, anchorHash } = verifiedNote(dir);
  if (safe.hash !== plan.safeHash || anchor.backupHash !== plan.backupHash
      || anchorHash !== plan.anchorHash) fail('BACKUP_CHANGED_AFTER_PLAN');
  const state = readState(dir);
  if (digest(state) !== plan.stateHash) fail('PLAN_CONFIRMATION_REQUIRED_OR_STALE');
  const index = state.notes.findIndex(row => row.id === id);
  if (index < 0) state.notes.push(note);
  else state.notes[index] = note;
  state.audit.push({ event: 'note_restored', id, planHash: confirmation });
  const persisted = writeState(dir, state, () => {
    const latestSafe = loadSafe(root);
    const latest = verifiedNote(dir);
    if (latestSafe.hash !== plan.safeHash || latest.anchor.backupHash !== plan.backupHash
        || latest.anchorHash !== plan.anchorHash) fail('BACKUP_CHANGED_BEFORE_REPLACE');
    if (digest(readState(dir)) !== plan.stateHash) fail('PLAN_CONFIRMATION_REQUIRED_OR_STALE');
  });
  const rows = persisted.notes.filter(row => row.id === id);
  if (rows.length !== 1 || rows[0].id !== anchor.id || rows[0].owner_id !== anchor.owner_id
      || digest([rows[0].title, rows[0].content]) !== anchor.contentHash) fail('RESTORED_NOTE_MISMATCH');
  return { id: rows[0].id, owner_id: rows[0].owner_id,
    contentHash: digest([rows[0].title, rows[0].content]) };
  });
}
export function trialRead(dir, actor, id) {
  const state = readState(dir);
  const note = state.notes.find(row => row.id === id);
  return !!note && (state.policy.dbAccess.ownerOnly ? note.owner_id === actor : true);
}

// Re-read both private backup and persisted target. Never use a planned hash as
// evidence of what was actually written.
export function inspectRestored(root, dir) {
  const safe = loadSafe(root);
  const { anchor } = verifiedNote(dir);
  const state = readState(dir);
  if (digest(state.policy) !== digest(safe.policy)) fail('RESTORED_POLICY_MISMATCH');
  const rows = state.notes.filter(row => row.id === anchor.id);
  if (rows.length !== 1 || rows[0].owner_id !== anchor.owner_id
      || digest([rows[0].title, rows[0].content]) !== anchor.contentHash) fail('RESTORED_NOTE_MISMATCH');
  return { scope: 'local-test', policyVersion: safe.version, safeHash: safe.hash,
    stateHash: digest(state), id: rows[0].id, owner_id: rows[0].owner_id,
    contentHash: digest([rows[0].title, rows[0].content]) };
}
