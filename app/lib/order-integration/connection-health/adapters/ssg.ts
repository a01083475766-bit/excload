import type { OrderIntegrationAccount } from '@prisma/client';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { testSsgConnection } from '@/app/lib/ssg/client';
import { toSsgCredentials } from '@/app/lib/order-integration/ssg-account';
import type { ConnectionHealthAdapter } from '../types';
import { runProbeHealthCheck, truncateRaw } from './probe-health';

/**
 * SSG 연결 확인. 기존 testSsgConnection(배송지시 조회, 최근 24시간, 최소 결과, 저장/쓰기 없음)을
 * probe로 재사용한다. 메시지 기반 공통 분류 사용.
 */
export const ssgHealthAdapter: ConnectionHealthAdapter<OrderIntegrationAccount> = {
  provider: 'SSG',
  readiness: 'VERIFIED',
  async checkConnection(account) {
    const now = new Date();
    if (!isIntegrationProxyConfigured()) {
      return { status: 'ACCOUNT_CONFIG_ERROR', rawCode: 'PROXY_NOT_CONFIGURED', checkedAt: now };
    }
    let credentials: ReturnType<typeof toSsgCredentials>;
    try {
      credentials = toSsgCredentials(account);
    } catch (error) {
      return {
        status: 'ACCOUNT_CONFIG_ERROR',
        rawCode: 'CREDENTIALS_MISSING',
        rawMessage: truncateRaw(error instanceof Error ? error.message : undefined),
        checkedAt: now,
      };
    }
    return runProbeHealthCheck({ probe: () => testSsgConnection(credentials), now });
  },
};
