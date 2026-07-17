import type { OrderIntegrationAccount } from '@prisma/client';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { testCjonstyleConnection } from '@/app/lib/cjonstyle/client';
import { toCjonstyleCredentials } from '@/app/lib/order-integration/cjonstyle-account';
import type { ConnectionHealthAdapter } from '../types';
import { runProbeHealthCheck, truncateRaw } from './probe-health';

/**
 * CJ온스타일 연결 확인. 기존 testCjonstyleConnection(authenticationKey+vendorCode, 첫 배송 타입,
 * 최근 24시간, 최소 결과, 저장/쓰기 없음)을 probe로 재사용한다. 메시지 기반 공통 분류 사용.
 */
export const cjonstyleHealthAdapter: ConnectionHealthAdapter<OrderIntegrationAccount> = {
  provider: 'CJONSTYLE',
  // app/lib/cjonstyle/api-spec.ts가 placeholder(추정)이므로 공식 파트너 스펙 확인 전까지 PROVISIONAL.
  // 운영 자동 확인에서 제외되어 잘못된 추정 호출로 정상 계정을 오류 표시하지 않는다.
  readiness: 'PROVISIONAL',
  async checkConnection(account) {
    const now = new Date();
    if (!isIntegrationProxyConfigured()) {
      return { status: 'ACCOUNT_CONFIG_ERROR', rawCode: 'PROXY_NOT_CONFIGURED', checkedAt: now };
    }
    let credentials: ReturnType<typeof toCjonstyleCredentials>;
    try {
      credentials = toCjonstyleCredentials(account);
    } catch (error) {
      return {
        status: 'ACCOUNT_CONFIG_ERROR',
        rawCode: 'CREDENTIALS_MISSING',
        rawMessage: truncateRaw(error instanceof Error ? error.message : undefined),
        checkedAt: now,
      };
    }
    return runProbeHealthCheck({ probe: () => testCjonstyleConnection(credentials), now });
  },
};
