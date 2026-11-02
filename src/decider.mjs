// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6단계: 등록 기기의 자료실 읽기만 허용하고 나머지는 기본 거부합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
import { inspectAccessSignals } from './access-signals.mjs';

export const RULE_IDS = Object.freeze(['starter.deny', 'device_registered', 'step_up_required']);

export async function decide(request) {
  if (request.deviceRegistered !== true) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'deny',
      reasonCode: 'device_not_registered',
      ruleIds: ['device_registered'],
    };
  }
  if (request.service === 'notes' && request.method === 'GET'
      && ['GET /notes', 'GET /notes/:id'].includes(request.route)) {
    const { fixture } = inspectAccessSignals(request);
    // Only the provided simulation has these signals. Unknown live telemetry
    // does not become "normal" and cannot prove that real step-up is connected.
    const unusual = fixture && (fixture.hour < 8 || fixture.hour >= 21)
      && fixture.network === 'unusual'
      && fixture.recentEvents.some(event => event.kind === 'risk_signal'
        && event.ageSeconds <= 60 && event.count >= 20);
    const confirmedFixture = fixture && request.stepUp?.verified === true
      && Number.isInteger(request.stepUp.authAgeSeconds)
      && request.stepUp.authAgeSeconds >= 0 && request.stepUp.authAgeSeconds <= 900;
    if (unusual && !confirmedFixture) {
      return {
        schema: 'aleph.decision.v1',
        requestId: request.requestId,
        decision: 'step_up',
        reasonCode: 'step_up_required',
        ruleIds: ['device_registered', 'step_up_required'],
      };
    }
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'allow',
      reasonCode: 'approved',
      ruleIds: ['device_registered'],
    };
  }
  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: 'deny',
    reasonCode: 'starter_not_ready',
    ruleIds: [RULE_IDS[0]],
  };
}
