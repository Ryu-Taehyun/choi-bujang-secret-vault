import config from '../aleph.config.json' with { type: 'json' };
import { collectOperations, observeSelectedNote } from '../src/operations.mjs';
import { sameOrigin, sessionToken } from '../src/session-auth.mjs';
import { deviceCookie } from '../src/device-access.mjs';
let recent, collectedAt = 0;
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  const fail = (status, error) => response.status(status).json({ error });
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST'); return fail(405, 'METHOD_NOT_ALLOWED');
  }
  if (request.method === 'GET') {
    try {
      // A reused snapshot keeps its original IDs and times. No fake fresh logs.
      if (!recent || Date.now() - collectedAt > 15000) {
        collectedAt = Date.now();
        recent = collectOperations(config, { commit: process.env.VERCEL_GIT_COMMIT_SHA });
      }
      const snapshot = await recent;
      response.setHeader('X-Vault-Snapshot-Id', snapshot.snapshotId);
      return response.status(200).json(snapshot);
    } catch { recent = null; return fail(503, 'OPERATIONS_UNAVAILABLE'); }
  }
  if (!sameOrigin(request)) return fail(403, 'ORIGIN_FORBIDDEN');
  if (!/^application\/json(?:;|$)/iu.test(request.headers?.['content-type'] ?? '')) return fail(415, 'JSON_REQUIRED');
  const session = sessionToken(request), device = deviceCookie(request);
  if (!session || !device) return fail(401, 'LOGIN_AND_DEVICE_REQUIRED');
  let input;
  try { input = typeof request.body === 'string' ? JSON.parse(request.body) : request.body; }
  catch { return fail(400, 'INVALID_OBSERVATION_TARGET'); }
  try {
    // Fixed self-origin GET only. Credentials stay inside server-to-server call.
    const observation = await observeSelectedNote(config, input, { headers: {
      Cookie: `__Host-vault-session=${session}; __Host-vault-device=${device}`,
    } });
    response.setHeader('X-Vault-Observation-Id', observation.requestId);
    return response.status(200).json({ schema: 'vault.observation.v1', observation });
  } catch { return fail(400, 'INVALID_OBSERVATION_TARGET'); }
}
