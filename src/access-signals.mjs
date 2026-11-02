// Input is the engine-only decision contract, never an HTTP request or headers.
// judge_fixture describes a simulation; it is not verified real-world telemetry.
export function inspectAccessSignals(request) {
  const signals = request.signals;
  const events = request.recentEvents;
  const source = signals?.source;
  const origin = source === 'judge_fixture' ? 'fixture'
    : source === 'none' ? 'unavailable' : 'unknown';
  const complete = origin === 'fixture'
    && ['local', 'foreign'].includes(signals.region)
    && ['usual', 'unusual'].includes(signals.network)
    && Number.isInteger(signals.hour) && signals.hour >= 0 && signals.hour <= 23
    && Array.isArray(events) && events.length <= 12
    && events.every(event => event && typeof event.kind === 'string'
      && Number.isSafeInteger(event.ageSeconds) && event.ageSeconds >= 0
      && Number.isSafeInteger(event.count) && event.count >= 0);
  // Missing/unknown data stays unavailable; never fill in normal values.
  return { origin, fixture: complete ? { ...signals,
    recentEvents: events.map(event => ({ ...event })) } : null };
}
