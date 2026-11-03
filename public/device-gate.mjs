export function createDeviceGate({ fetchImpl = fetch, open, close, show }) {
  let session = null;
  let generation = 0;
  async function check(next = session, requestApproval = false) {
    session = next;
    const version = ++generation;
    close();
    if (session?.signedIn !== true) { show('signedout'); return false; }
    show('checking');
    const current = session;
    try {
      const response = await fetchImpl('/api/device', { method: requestApproval ? 'POST' : 'GET',
        cache: 'no-store', credentials: 'same-origin',
        ...(requestApproval ? { headers: { 'Content-Type': 'application/json' } } : {}),
        ...(requestApproval ? { body: '{}' } : {}) });
      const data = await response.json();
      if (version !== generation) return false;
      if (!response.ok || data.schema !== 'vault.device.v1'
          || !['unregistered', 'pending', 'approved', 'revoked'].includes(data.state)
          || data.registered !== (data.state === 'approved')) throw new Error();
      show(data.state);
      if (data.state !== 'approved') return false;
      await open(current);
      return version === generation;
    } catch {
      if (version === generation) { close(); show('unavailable'); }
      return false;
    }
  }
  return { setSession: next => check(next), refresh: () => check(), request: () => check(session, true),
    lock(state = 'unavailable') { generation += 1; close(); show(state); } };
}
