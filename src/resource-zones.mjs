// Resource IDs are derived server-side; no new decision-contract field is added.
const reserved = new Set(['export', 'import', 'search', 'bulk', 'admin']);
export function resourceAt(service, path) {
  if (!['notes', 'announcements', 'instructor-materials'].includes(service)
      || typeof path !== 'string') return null;
  const prefix = `/${service}/`;
  if (!path.startsWith(prefix)) return null;
  const id = path.slice(prefix.length);
  if (!id || /[\s/\\%?#\u0000-\u001f\u007f]/u.test(id)
      || id === '.' || id === '..' || reserved.has(id.toLowerCase())) return null;
  return { service, id, resourceId: `${service}:${encodeURIComponent(id)}`, route: `GET /${service}/:id` };
}

export function readableResource(request) {
  const resource = resourceAt(request.service, request.path);
  return resource && request.service !== 'instructor-materials'
    && request.method === 'GET' && request.route === resource.route
    && request.queryLength === 0 ? resource : null;
}
