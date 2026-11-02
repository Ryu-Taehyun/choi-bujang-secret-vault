import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from './verify-login.mjs';
import { resourceAt } from './resource-zones.mjs';

let verifyLogin;
export function zoneHandler(service, { admin = false } = {}) {
  return async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const fail = (status, error) => response.status(status).json({ error });
    // Writes never go through the student-facing announcement endpoint.
    const method = admin ? 'PUT' : 'GET';
    if (request.method !== method) {
      response.setHeader('Allow', method);
      return fail(405, 'METHOD_NOT_ALLOWED');
    }
    const authorization = request.headers?.authorization;
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      return fail(401, 'LOGIN_REQUIRED');
    }
    let identity;
    try {
      verifyLogin ??= createLoginVerifier({ config,
        supabaseSecretKey: process.env.SUPABASE_SECRET_KEY });
      identity = await verifyLogin(authorization);
    } catch { return fail(503, 'LOGIN_UNAVAILABLE'); }
    if (!identity) return fail(401, 'INVALID_LOGIN');
    // Instructor material is never available through the student data plane.
    if (service === 'instructor-materials') return fail(403, 'ZONE_FORBIDDEN');
    const prefix = admin ? '/api/admin/announcements/' : '/api/announcements/';
    const path = typeof request.url === 'string' ? request.url.split('?')[0] : '';
    const resource = path.startsWith(prefix)
      ? resourceAt(service, `/${service}/${path.slice(prefix.length)}`) : null;
    if (!resource || request.url.includes('?')) return fail(404, 'RESOURCE_NOT_FOUND');
    response.setHeader('X-Resource-Id', resource.resourceId);
    let base;
    const secret = process.env.SUPABASE_SECRET_KEY;
    try {
      base = new URL(process.env.SUPABASE_URL);
      if (base.protocol !== 'https:' || base.username || base.password || base.search
          || base.hash || base.pathname !== '/'
          || base.origin !== new URL(config.identityProvider.issuer).origin
          || typeof secret !== 'string' || !secret.trim()) throw new Error();
    } catch { return fail(503, 'ZONE_NOT_CONFIGURED'); }
    const headers = { apikey: secret, 'Content-Type': 'application/json' };
    async function rows(table, params) {
      const url = new URL(`/rest/v1/${table}`, base);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
      const result = await fetch(url, { headers, redirect: 'error',
        signal: AbortSignal.timeout(10000) });
      if (!result.ok) throw new Error();
      const data = await result.json();
      if (!Array.isArray(data)) throw new Error();
      return data;
    }
    try {
      // Only stored memberships for the verified identity grant class access.
      const memberships = await rows('training_class_memberships', {
        select: 'class_id,user_id,role', user_id: `eq.${identity.userId}`,
      });
      const permitted = memberships.filter(row => row && row.user_id === identity.userId
        && typeof row.class_id === 'string' && /^[a-zA-Z0-9_-]+$/u.test(row.class_id)
        && (admin ? row.role === 'instructor' : ['student', 'instructor'].includes(row.role)));
      if (!permitted.length) return fail(403, admin ? 'INSTRUCTOR_REQUIRED' : 'CLASS_MEMBERSHIP_REQUIRED');
      const classes = [...new Set(permitted.map(row => row.class_id))];
      if (admin) {
        if (!/^application\/json(?:;|$)/iu.test(request.headers?.['content-type'] ?? '')) {
          return fail(415, 'JSON_REQUIRED');
        }
        let input;
        try { input = typeof request.body === 'string' ? JSON.parse(request.body) : request.body; }
        catch { return fail(400, 'INVALID_JSON'); }
        if (!input || typeof input !== 'object' || Array.isArray(input)
            || Object.keys(input).some(key => !['title', 'body'].includes(key))
            || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200
            || typeof input.body !== 'string' || input.body.length > 20000) {
          return fail(400, 'INVALID_ANNOUNCEMENT');
        }
        // The DB function repeats the membership check atomically with the write.
        const result = await fetch(new URL('/rest/v1/rpc/update_training_announcement', base), {
          method: 'POST', headers, body: JSON.stringify({ actor: identity.userId,
            resource_id: resource.id, new_title: input.title.trim(), new_content: input.body }),
          redirect: 'error', signal: AbortSignal.timeout(10000),
        });
        if (!result.ok) throw new Error();
        const data = await result.json();
        if (!Array.isArray(data) || data.length > 1) throw new Error();
        if (!data.length) return fail(404, 'RESOURCE_NOT_FOUND');
        if (data[0].id !== resource.id || !classes.includes(data[0].class_id)
            || typeof data[0].title !== 'string' || typeof data[0].content !== 'string') throw new Error();
        return response.status(200).json({ id: data[0].id, title: data[0].title, body: data[0].content });
      }
      const data = await rows('training_announcements', { select: 'id,class_id,title,content',
        id: `eq.${resource.id}`, class_id: `in.(${classes.join(',')})` });
      if (data.length > 1) throw new Error();
      if (!data.length) return fail(404, 'RESOURCE_NOT_FOUND');
      const row = data[0];
      if (!row || row.id !== resource.id || !classes.includes(row.class_id)
          || typeof row.title !== 'string' || typeof row.content !== 'string') throw new Error();
      return response.status(200).json({ id: row.id, title: row.title, body: row.content });
    } catch {
      // No upstream errors, headers, tokens, or note bodies are logged.
      return fail(502, 'ZONE_UNAVAILABLE');
    }
  };
}
