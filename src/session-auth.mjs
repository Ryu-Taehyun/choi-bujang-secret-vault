import config from '../aleph.config.json' with { type: 'json' };
export const SESSION_COOKIE = '__Host-vault-session';
export function sessionToken(request) {
  const header = request.headers?.cookie;
  if (typeof header !== 'string') return null;
  const entries = header.split(';').map(part => part.trim()).filter(part => part.startsWith(`${SESSION_COOKIE}=`));
  if (entries.length !== 1) return null;
  const value = entries[0].slice(SESSION_COOKIE.length + 1);
  return value.length <= 8192 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value) ? value : null;
}
export function requestAuthorization(request) {
  // Explicit legacy/engine credentials never fall back to a cookie on failure.
  if (request.headers?.authorization !== undefined) return request.headers.authorization;
  const token = sessionToken(request);
  return token ? `Bearer ${token}` : undefined;
}
export function sameOrigin(request) {
  return request.headers?.origin === new URL(config.publicAppUrl).origin;
}
export function cookieWriteAllowed(request) {
  return request.headers?.authorization !== undefined || ['GET', 'HEAD'].includes(request.method) || sameOrigin(request);
}
export function sessionCookie(value, maxAge) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
