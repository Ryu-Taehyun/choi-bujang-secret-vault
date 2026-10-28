// Stage 2 intentionally has no user authentication. See README.md.
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const rawUrl = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  let endpoint;
  try {
    const base = new URL(rawUrl);
    if (base.protocol !== 'https:' || base.username || base.password
        || base.search || base.hash || base.pathname !== '/'
        || typeof secret !== 'string' || !secret.trim()) throw new Error();
    endpoint = new URL('/rest/v1/training_notes', base);
  } catch {
    return response.status(503).json({ error: 'NOTES_NOT_CONFIGURED' });
  }
  endpoint.searchParams.set('select', 'title,content');
  endpoint.searchParams.set('id', 'in.(sample_note_1,sample_note_2,sample_note_3,sample_note_4)');
  endpoint.searchParams.set('order', 'id.asc');
  endpoint.searchParams.set('limit', '4');
  try {
    const upstream = await fetch(endpoint, {
      headers: { apikey: secret, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (!upstream.ok) return response.status(502).json({ error: 'NOTES_UNAVAILABLE' });
    const rows = await upstream.json();
    if (!Array.isArray(rows) || rows.length > 4
        || rows.some(row => !row || typeof row.title !== 'string'
          || typeof row.content !== 'string')) {
      return response.status(502).json({ error: 'NOTES_UNAVAILABLE' });
    }
    return response.status(200).json({
      notes: rows.map(({ title, content }) => ({ title, content })),
    });
  } catch {
    // Never log or return upstream errors, request headers, URLs or credentials.
    return response.status(502).json({ error: 'NOTES_UNAVAILABLE' });
  }
}
