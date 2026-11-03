import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from '../src/verify-login.mjs';
import { establishDeviceCookie, deviceStatus } from '../src/device-access.mjs';

let verifyLogin;
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  const fail = (status, error) => response.status(status).json({ error });
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST');
    return fail(405, 'METHOD_NOT_ALLOWED');
  }
  const authorization = request.headers?.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return fail(401, 'LOGIN_REQUIRED');
  let identity;
  try {
    verifyLogin ??= createLoginVerifier({ config, supabaseSecretKey: process.env.SUPABASE_SECRET_KEY });
    identity = await verifyLogin(authorization);
  } catch { return fail(503, 'LOGIN_UNAVAILABLE'); }
  if (!identity) return fail(401, 'INVALID_LOGIN');
  if (identity.kind !== 'student') return fail(403, 'STUDENT_LOGIN_REQUIRED');
  if (request.method === 'POST') {
    if (request.headers.origin && request.headers.origin !== new URL(config.publicAppUrl).origin) return fail(403, 'ORIGIN_FORBIDDEN');
    if (!/^application\/json(?:;|$)/iu.test(request.headers['content-type'] ?? '')) return fail(415, 'JSON_REQUIRED');
    let input;
    try { input = typeof request.body === 'string' ? JSON.parse(request.body) : request.body; }
    catch { return fail(400, 'INVALID_REQUEST'); }
    if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).length) return fail(400, 'INVALID_REQUEST');
  }
  const cookie = establishDeviceCookie(request, response);
  try {
    const state = await deviceStatus(identity, cookie, { requestApproval: request.method === 'POST' });
    return response.status(200).json({ schema: 'vault.device.v1', state, registered: state === 'approved' });
  } catch { return fail(503, 'DEVICE_UNAVAILABLE'); }
}
