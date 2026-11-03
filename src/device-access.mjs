import { createHash, randomBytes } from 'node:crypto';
import config from '../aleph.config.json' with { type: 'json' };

const COOKIE = '__Host-vault-device';
export function deviceCookie(request) {
  const header = request.headers?.cookie;
  if (typeof header !== 'string') return null;
  const values = header.split(';').map(part => part.trim())
    .filter(part => part.startsWith(`${COOKIE}=`));
  if (values.length !== 1) return null;
  const value = values[0].slice(COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : null;
}
export function establishDeviceCookie(request, response) {
  const existing = deviceCookie(request);
  if (existing) return existing;
  const value = randomBytes(32).toString('base64url');
  response.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);
  return value;
}
export async function deviceStatus(identity, cookie, { requestApproval = false } = {}) {
  if (identity.kind !== 'student' || !cookie) throw new Error('DEVICE_UNAVAILABLE');
  const secret = process.env.SUPABASE_SECRET_KEY;
  const base = new URL(process.env.SUPABASE_URL);
  if (base.protocol !== 'https:' || base.origin !== new URL(config.identityProvider.issuer).origin
      || base.pathname !== '/' || base.username || base.password || base.search || base.hash
      || typeof secret !== 'string' || !secret.trim()) throw new Error('DEVICE_UNAVAILABLE');
  const hash = createHash('sha256').update(cookie).digest('hex');
  const table = new URL('/rest/v1/training_device_requests', base);
  const headers = { apikey: secret, 'Content-Type': 'application/json' };
  if (requestApproval) {
    const insert = new URL(table);
    insert.searchParams.set('on_conflict', 'user_id,device_hash');
    const result = await fetch(insert, { method: 'POST', headers: { ...headers,
      Prefer: 'resolution=ignore-duplicates,return=minimal' }, redirect: 'error',
      signal: AbortSignal.timeout(10000), body: JSON.stringify({ user_id: identity.userId,
        device_hash: hash, status: 'pending' }) });
    if (!result.ok) throw new Error('DEVICE_UNAVAILABLE');
  }
  table.searchParams.set('select', 'user_id,device_hash,status');
  table.searchParams.set('user_id', `eq.${identity.userId}`);
  table.searchParams.set('device_hash', `eq.${hash}`);
  const result = await fetch(table, { headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!result.ok) throw new Error('DEVICE_UNAVAILABLE');
  const rows = await result.json();
  if (!Array.isArray(rows) || rows.length > 1) throw new Error('DEVICE_UNAVAILABLE');
  if (!rows.length) return 'unregistered';
  const row = rows[0];
  if (row.user_id !== identity.userId || row.device_hash !== hash
      || !['pending', 'approved', 'revoked'].includes(row.status)) throw new Error('DEVICE_UNAVAILABLE');
  return row.status;
}
export async function requireApprovedDevice(request, response, identity) {
  // Preserve the existing signed judge-token data API contract. The engine's
  // registered-device decision remains in decider.mjs, never in browser input.
  if (identity.kind === 'judge') return true;
  const cookie = deviceCookie(request);
  if (!cookie) { response.status(403).json({ error: 'DEVICE_NOT_APPROVED' }); return false; }
  try {
    if (await deviceStatus(identity, cookie) === 'approved') return true;
    response.status(403).json({ error: 'DEVICE_NOT_APPROVED' });
  } catch { response.status(503).json({ error: 'DEVICE_UNAVAILABLE' }); }
  return false;
}
