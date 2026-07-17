import type { ConnectionHealthResult, HealthStatus } from '../types';

const RAW_MESSAGE_MAX = 200;
export function truncateRaw(message: string | undefined): string | undefined {
  if (!message) return undefined;
  return message.length > RAW_MESSAGE_MAX ? `${message.slice(0, RAW_MESSAGE_MAX)}…` : message;
}

/**
 * 커스텀 에러 코드가 없고 HTTP 상태를 숨긴 채 한글 메시지만 던지는 몰의 오류 메시지를
 * 공통 카테고리로 "보수적으로" 변환한다.
 *
 * 원칙(구조화된 코드가 없는 몰):
 * - 조치가 필요한 원인(인증·IP·권한·승인·계정설정) 중 하나로 명확히 특정될 때만 그 카테고리 사용
 * - 여러 원인이 함께 언급되면(예: "인증키·IP 등록 확인") 특정하지 않고 UNKNOWN
 * - 조치 원인이 없고 일시/요청 신호만 있으면 RATE_LIMITED·TEMPORARY_ERROR·REQUEST_INVALID
 * - 그 외 UNKNOWN
 *
 * 사용자 조치 문구는 healthStatus와 분리해 messages.ts가 담당한다(가능한 원인을 함께 안내).
 * 이 공통 분류를 무리하게 확장하지 말고, 몰별로 신뢰할 신호가 있으면 classify 주입을 사용한다.
 */
export function classifyMallErrorMessage(error: unknown): HealthStatus {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const t = raw.toLowerCase();

  // 독립 토큰 'ip'(영문 단어 내부 매칭 방지) 또는 한글 IP 신호
  const ipSignal =
    /(^|[^a-z])ip([^a-z]|$)/i.test(raw) ||
    t.includes('아이피') ||
    t.includes('허용되지') ||
    t.includes('ip 미등록');
  const authSignal =
    t.includes('인증') ||
    t.includes('authentication') ||
    t.includes('unauthorized') ||
    t.includes('api key') ||
    t.includes('openapikey') ||
    t.includes('인증키');
  const permissionSignal =
    t.includes('권한') || t.includes('permission') || t.includes('scope') || t.includes('forbidden');
  const approvalSignal =
    t.includes('승인') ||
    t.includes('계약') ||
    t.includes('미승인') ||
    t.includes('반영 대기') ||
    t.includes('approval') ||
    t.includes('pending');
  const configSignal =
    t.includes('필수') || t.includes('환경') || t.includes('env') || t.includes('파싱');

  // 조치가 필요한 원인들(서로 다른 원인이 2개 이상이면 특정하지 않음)
  const causes = new Set<HealthStatus>();
  if (approvalSignal) causes.add('APPROVAL_REQUIRED');
  if (permissionSignal) causes.add('PERMISSION_DENIED');
  if (ipSignal) causes.add('IP_NOT_ALLOWED');
  if (authSignal) causes.add('AUTH_REQUIRED');
  if (configSignal) causes.add('ACCOUNT_CONFIG_ERROR');

  if (causes.size >= 2) return 'UNKNOWN';
  if (causes.size === 1) return [...causes][0];

  if (t.includes('429') || t.includes('rate') || t.includes('호출 제한') || t.includes('제한')) {
    return 'RATE_LIMITED';
  }
  if (
    t.includes('timeout') ||
    t.includes('network') ||
    t.includes('프록시') ||
    t.includes('지연') ||
    /http 5\d\d/.test(t)
  ) {
    return 'TEMPORARY_ERROR';
  }
  if (
    t.includes('날짜') ||
    t.includes('파라미터') ||
    t.includes('parameter') ||
    t.includes('유효하지 않') ||
    t.includes('invalid') ||
    t.includes('조회 조건') ||
    t.includes('조회 기간')
  ) {
    return 'REQUEST_INVALID';
  }
  return 'UNKNOWN';
}

/**
 * probe(기존 testXConnection 등 최소 읽기 호출)를 실행해 성공하면 HEALTHY, 실패하면 오류 분류.
 * probe는 주문 저장·쓰기 없이 최소 결과만 조회해야 한다. 정상 빈 응답도 HEALTHY.
 */
export async function runProbeHealthCheck(input: {
  probe: () => Promise<unknown>;
  now?: Date;
  classify?: (error: unknown) => HealthStatus;
}): Promise<ConnectionHealthResult> {
  const now = input.now ?? new Date();
  const classify = input.classify ?? classifyMallErrorMessage;
  try {
    await input.probe();
    return { status: 'HEALTHY', checkedAt: now };
  } catch (error) {
    return {
      status: classify(error),
      rawMessage: truncateRaw(error instanceof Error ? error.message : undefined),
      checkedAt: now,
    };
  }
}
