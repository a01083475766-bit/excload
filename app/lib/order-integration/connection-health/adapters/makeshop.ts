import type { OrderIntegrationAccount } from '@prisma/client';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { testMakeshopConnection } from '@/app/lib/makeshop/client';
import { toMakeshopCredentials } from '@/app/lib/order-integration/makeshop-account';
import type { ConnectionHealthAdapter, HealthStatus } from '../types';
import { runProbeHealthCheck, truncateRaw } from './probe-health';

/**
 * 메이크샵 OAuth 오류 메시지 분류.
 * OAuth 인증(Client ID/Secret) 실패는 env 언급이 함께 있어도 AUTH_REQUIRED로 본다.
 * 서버 OAuth env 자체가 누락된 경우("... 환경 변수가 설정되지 않았습니다")만 ACCOUNT_CONFIG_ERROR.
 */
export function classifyMakeshopError(error: unknown): HealthStatus {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const t = raw.toLowerCase();

  // IP 등록 문제(9009, 허가된 IP)
  if (
    /(^|[^a-z])ip([^a-z]|$)/i.test(raw) ||
    t.includes('9009') ||
    t.includes('허가된 ip') ||
    t.includes('접근 허용 ip')
  ) {
    return 'IP_NOT_ALLOWED';
  }
  // 호출 횟수 제한
  if (t.includes('too_many_request') || t.includes('횟수 제한') || t.includes('rate') || t.includes('429')) {
    return 'RATE_LIMITED';
  }
  // APP 설치/미승인/scope 동의(계약·승인 상태)
  if (t.includes('설치') || t.includes('미설치') || t.includes('scope 동의') || t.includes('승인') || t.includes('install')) {
    return 'APPROVAL_REQUIRED';
  }
  // OAuth 인증(Client ID/Secret) — env 언급보다 우선
  if (
    t.includes('invalid_client') ||
    t.includes('client id') ||
    t.includes('client secret') ||
    t.includes('oauth') ||
    t.includes('인증') ||
    t.includes('access_token') ||
    t.includes('토큰')
  ) {
    return 'AUTH_REQUIRED';
  }
  // 서버 OAuth env 누락
  if (t.includes('환경 변수가 설정되지') || t.includes('환경변수') || t.includes('env가 설정')) {
    return 'ACCOUNT_CONFIG_ERROR';
  }
  // 주문 조회 권한
  if (t.includes('권한') || t.includes('permission') || t.includes('forbidden')) {
    return 'PERMISSION_DENIED';
  }
  // 요청 파라미터/상점 식별
  if (
    t.includes('shop_uid') ||
    t.includes('상점') ||
    t.includes('날짜') ||
    t.includes('파라미터') ||
    t.includes('올바르지 않') ||
    t.includes('invalid_request') ||
    t.includes('parameter')
  ) {
    return 'REQUEST_INVALID';
  }
  // 네트워크/일시 오류
  if (t.includes('timeout') || t.includes('network') || t.includes('프록시') || /http 5\d\d/.test(t)) {
    return 'TEMPORARY_ERROR';
  }
  return 'UNKNOWN';
}

/**
 * 메이크샵 연결 확인. testMakeshopConnection이 OAuth 토큰 발급 후 최근 2일 주문 1건까지 읽으므로,
 * 토큰만 성공한 상태를 HEALTHY로 오인하지 않는다. 정상 빈 주문 응답도 HEALTHY.
 * 공식 APP API 사양이 확인됨 → VERIFIED.
 */
export const makeshopHealthAdapter: ConnectionHealthAdapter<OrderIntegrationAccount> = {
  provider: 'MAKESHOP',
  readiness: 'VERIFIED',
  async checkConnection(account) {
    const now = new Date();
    if (!isIntegrationProxyConfigured()) {
      return { status: 'ACCOUNT_CONFIG_ERROR', rawCode: 'PROXY_NOT_CONFIGURED', checkedAt: now };
    }
    let credentials: ReturnType<typeof toMakeshopCredentials>;
    try {
      credentials = toMakeshopCredentials(account);
    } catch (error) {
      return {
        status: 'ACCOUNT_CONFIG_ERROR',
        rawCode: 'CREDENTIALS_MISSING',
        rawMessage: truncateRaw(error instanceof Error ? error.message : undefined),
        checkedAt: now,
      };
    }
    return runProbeHealthCheck({
      probe: () => testMakeshopConnection(credentials),
      now,
      classify: classifyMakeshopError,
    });
  },
};
