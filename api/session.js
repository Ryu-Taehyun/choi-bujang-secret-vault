import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from '../src/verify-login.mjs';
import { sessionToken, sameOrigin, sessionCookie } from '../src/session-auth.mjs';
let verifyLogin;
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  const fail = (status, error) => response.status(status).json({ error });
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST, DELETE'); return fail(405, 'METHOD_NOT_ALLOWED');
  }
  if (request.method !== 'GET' && !sameOrigin(request)) return fail(403, 'ORIGIN_FORBIDDEN');
  if (request.method === 'DELETE') {
    response.setHeader('Set-Cookie', sessionCookie('', 0));
    return response.status(200).json({ signedIn: false });
  }
  try {
    if (request.method === 'GET') {
      const token = sessionToken(request);
      if (!token) return response.status(200).json({ signedIn: false });
      verifyLogin ??= createLoginVerifier({ config, supabaseSecretKey: process.env.SUPABASE_SECRET_KEY });
      const identity = await verifyLogin(`Bearer ${token}`);
      if (identity?.kind !== 'student') {
        response.setHeader('Set-Cookie', sessionCookie('', 0));
        return response.status(200).json({ signedIn: false });
      }
      return response.status(200).json({ signedIn: true });
    }
    if (!/^application\/json(?:;|$)/iu.test(request.headers?.['content-type'] ?? '')) return fail(415, 'JSON_REQUIRED');
    let input;
    try { input = typeof request.body === 'string' ? JSON.parse(request.body) : request.body; }
    catch { return fail(400, 'INVALID_LOGIN_INPUT'); }
    if (!input || Array.isArray(input) || typeof input !== 'object'
        || Object.keys(input).sort().join(',') !== 'email,password'
        || typeof input.email !== 'string' || !input.email.trim() || input.email.length > 320
        || typeof input.password !== 'string' || !input.password || input.password.length > 4096) return fail(400, 'INVALID_LOGIN_INPUT');
    const base = new URL(process.env.SUPABASE_URL);
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (base.protocol !== 'https:' || base.origin !== new URL(config.identityProvider.issuer).origin
        || base.username || base.password || base.search || base.hash || base.pathname !== '/'
        || typeof secret !== 'string' || !secret.trim()) return fail(503, 'LOGIN_UNAVAILABLE');
    const client = createClient(base.origin, secret, { auth: {
      persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
    } });
    const { data, error } = await client.auth.signInWithPassword({ email: input.email.trim(), password: input.password });
    const session = data?.session;
    if (error || !session || typeof session.access_token !== 'string'
        || !Number.isSafeInteger(session.expires_in) || session.expires_in <= 0) return fail(401, 'INVALID_LOGIN');
    // Validate the returned token before issuing a server-only session cookie.
    const { data: checked, error: checkError } = await client.auth.getClaims(session.access_token);
    const claims = checked?.claims;
    if (checkError || claims?.iss !== config.identityProvider.issuer
        || claims.aud !== config.identityProvider.audience || claims.role !== 'authenticated'
        || typeof claims.sub !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(claims.sub)
        || !Number.isSafeInteger(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)
        || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(session.access_token)) return fail(401, 'INVALID_LOGIN');
    const maxAge = Math.min(session.expires_in, claims.exp - Math.floor(Date.now() / 1000), 3600);
    response.setHeader('Set-Cookie', sessionCookie(session.access_token, maxAge));
    return response.status(200).json({ signedIn: true });
  } catch { return fail(503, 'LOGIN_UNAVAILABLE'); }
}
