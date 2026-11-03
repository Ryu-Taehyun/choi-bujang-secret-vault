import { TARGET_ID, ACCOUNT_B, notePlan, restoreNote } from './recovery.mjs';

// An isolated recovery-lab service. No Vercel route or production DB connector.
// Actor comes from the server-side test fixture, never the request body/header.
export function recoveryHandler(root, dir, actor = ACCOUNT_B) {
  return async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)); };
    if (request.headers.origin || request.headers['sec-fetch-site']) return reply(403, { error: 'BROWSER_REQUEST_FORBIDDEN' });
    if (request.url !== `/restore/notes/${TARGET_ID}`) return reply(404, { error: 'TARGET_NOT_FOUND' });
    if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return reply(405, { error: 'METHOD_NOT_ALLOWED' }); }
    if (request.headers['content-type'] !== 'application/json') return reply(415, { error: 'JSON_REQUIRED' });
    try {
      let raw = '';
      for await (const chunk of request) {
        raw += chunk;
        if (raw.length > 1024) return reply(413, { error: 'REQUEST_TOO_LARGE' });
      }
      let input;
      try { input = JSON.parse(raw); } catch { return reply(400, { error: 'INVALID_JSON' }); }
      if (!input || Array.isArray(input) || typeof input !== 'object'
          || Object.keys(input).some(key => !['preview', 'confirmation'].includes(key))
          || (input.preview !== true && typeof input.confirmation !== 'string')) return reply(400, { error: 'INVALID_REQUEST' });
      const result = input.preview === true ? notePlan(root, dir, actor, TARGET_ID)
        : restoreNote(root, dir, actor, TARGET_ID, input.confirmation);
      return reply(200, result);
    } catch {
      return reply(409, { error: 'RESTORE_REJECTED' });
    }
  };
}
