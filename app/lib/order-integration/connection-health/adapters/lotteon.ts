import type { OrderIntegrationAccount } from '@prisma/client';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { testLotteonConnection } from '@/app/lib/lotteon/client';
import { toLotteonCredentials } from '@/app/lib/order-integration/lotteon-account';
import type { ConnectionHealthAdapter } from '../types';
import { runProbeHealthCheck, truncateRaw } from './probe-health';

/**
 * 롯데ON 연결 확인. 기존 testLotteonConnection(최근 24시간, 출고지시 단계, 최소 결과, 저장/쓰기 없음)을
 * probe로 재사용한다. 커스텀 에러 클래스가 없어 메시지 기반 공통 분류를 사용한다.
 */
export const lotteonHealthAdapter: ConnectionHealthAdapter<OrderIntegrationAccount> = {
  provider: 'LOTTEON',
  readiness: 'VERIFIED',
  async checkConnection(account) {
    const now = new Date();
    if (!isIntegrationProxyConfigured()) {
      return { status: 'ACCOUNT_CONFIG_ERROR', rawCode: 'PROXY_NOT_CONFIGURED', checkedAt: now };
    }
    let credentials: ReturnType<typeof toLotteonCredentials>;
    try {
      credentials = toLotteonCredentials(account);
    } catch (error) {
      return {
        status: 'ACCOUNT_CONFIG_ERROR',
        rawCode: 'CREDENTIALS_MISSING',
        rawMessage: truncateRaw(error instanceof Error ? error.message : undefined),
        checkedAt: now,
      };
    }
    return runProbeHealthCheck({ probe: () => testLotteonConnection(credentials), now });
  },
};
