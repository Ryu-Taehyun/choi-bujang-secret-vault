import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from '../src/verify-login.mjs';
import { randomUUID } from 'node:crypto';

let verifyLogin;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const LEGACY_NOTE_IDS = new Set(['sample_note_1', 'sample_note_2', 'sample_note_3', 'sample_note_4']);

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  const routeId = request.query?.noteId;
  const single = routeId !== undefined;
  const methods = single ? ['GET', 'PUT', 'DELETE'] : ['GET', 'POST'];
  if (!methods.includes(request.method)) {
    response.setHeader('Allow', methods.join(', '));
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const authorization = request.headers?.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return response.status(401).json({ error: 'LOGIN_REQUIRED' });
  }
  let identity;
  try {
    verifyLogin ??= createLoginVerifier({
      config, supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
    });
    identity = await verifyLogin(authorization);
  } catch {
    return response.status(503).json({ error: 'LOGIN_UNAVAILABLE' });
  }
  if (!identity) return response.status(401).json({ error: 'INVALID_LOGIN' });
  // Only the verifier's result grants access. Client userId/role are never used.
  if (single && (typeof routeId !== 'string' || (!UUID.test(routeId) && !LEGACY_NOTE_IDS.has(routeId)))) {
    return response.status(400).json({ error: 'INVALID_NOTE_ID' });
  }
  const id = single ? routeId.toLowerCase() : null;
  let input;
  let newId;
  if (request.method === 'POST' || request.method === 'PUT') {
    if (!/^application\/json(?:;|$)/iu.test(request.headers?.['content-type'] ?? '')) {
      return response.status(415).json({ error: 'JSON_REQUIRED' });
    }
    try {
      input = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    } catch {
      return response.status(400).json({ error: 'INVALID_JSON' });
    }
    if (!input || Array.isArray(input) || typeof input !== 'object'
        || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200
        || typeof input.body !== 'string' || input.body.length > 20000) {
      return response.status(400).json({ error: 'INVALID_NOTE' });
    }
    if (request.method === 'PUT' && Object.hasOwn(input, 'owner_id')) {
      return response.status(403).json({ error: 'OWNER_CHANGE_FORBIDDEN' });
    }
    if (request.method === 'POST') {
      if (input.id !== undefined && (typeof input.id !== 'string' || !UUID.test(input.id))) {
        return response.status(400).json({ error: 'INVALID_NOTE_ID' });
      }
      newId = input.id?.toLowerCase() ?? randomUUID();
    }
  }
  const rawUrl = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  let endpoint;
  try {
    const base = new URL(rawUrl);
    if (base.protocol !== 'https:' || base.username || base.password
        || base.search || base.hash || base.pathname !== '/'
        || base.origin !== new URL(config.identityProvider.issuer).origin
        || typeof secret !== 'string' || !secret.trim()) throw new Error();
    endpoint = new URL('/rest/v1/training_notes', base);
  } catch {
    return response.status(503).json({ error: 'NOTES_NOT_CONFIGURED' });
  }
  endpoint.searchParams.set('select', 'id,title,content,owner_id');
  if (single) {
    // Scope the read/write itself, so ownership cannot change between a
    // separate authorization read and the mutation.
    endpoint.searchParams.set('id', `eq.${id}`);
    endpoint.searchParams.set('owner_id', `eq.${identity.userId}`);
  } else if (request.method === 'GET') {
    endpoint.searchParams.set('owner_id', `eq.${identity.userId}`);
    endpoint.searchParams.set('order', 'id.asc');
  }
  const method = request.method === 'PUT' ? 'PATCH' : request.method;
  let payload;
  if (input) {
    // The old row is scoped above; the new row's owner is fixed here.
    payload = { title: input.title.trim(), content: input.body, owner_id: identity.userId };
    if (request.method === 'POST') {
      payload.id = newId;
    }
  }
  try {
    const upstream = await fetch(endpoint, {
      method,
      headers: { apikey: secret, Accept: 'application/json',
        'Content-Type': 'application/json', Prefer: 'return=representation' },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (request.method === 'POST' && upstream.status === 409) {
      return response.status(409).json({ error: 'NOTE_ID_EXISTS' });
    }
    if (!upstream.ok) return response.status(502).json({ error: 'NOTES_UNAVAILABLE' });
    const rows = await upstream.json();
    if (!Array.isArray(rows) || (single && rows.length > 1)
        || rows.some(row => !row || row.owner_id !== identity.userId
          || typeof row.id !== 'string' || typeof row.title !== 'string'
          || typeof row.content !== 'string')) {
      return response.status(502).json({ error: 'NOTES_UNAVAILABLE' });
    }
    if (single && rows.length === 0) return response.status(404).json({ error: 'NOTE_NOT_FOUND' });
    if (request.method === 'DELETE') return response.status(200).json({ id });
    if (request.method === 'POST') {
      if (rows.length !== 1 || rows[0].id !== newId) {
        return response.status(502).json({ error: 'NOTES_UNAVAILABLE' });
      }
      return response.status(201).json({ id: newId });
    }
    const notes = rows.map(({ id, title, content }) => ({ id, title, body: content }));
    return response.status(200).json(single ? notes[0] : notes);
  } catch {
    // Never log or return upstream errors, request headers, URLs or credentials.
    return response.status(502).json({ error: 'NOTES_UNAVAILABLE' });
  }
}
