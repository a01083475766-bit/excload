import type { OrderIntegrationAccount } from '@prisma/client';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { testShopbyConnection } from '@/app/lib/shopby/client';
import { toShopbyCredentials } from '@/app/lib/order-integration/shopby-account';
import type { ConnectionHealthAdapter } from '../types';
import { runProbeHealthCheck, truncateRaw } from './probe-health';

/**
 * 샵바이(NHN커머스) 연결 확인. 기존 testShopbyConnection(최근 24시간, 첫 페이지, 최대 1건,
 * 저장/쓰기 없음, 프록시)을 probe로 재사용한다. 공식 서버 API 사양이 확인됨 → VERIFIED.
 * systemKey/mallKey는 자격 정보이므로 인증 메시지는 AUTH_REQUIRED로 분류된다(공통 보수적 분류).
 */
export const shopbyHealthAdapter: ConnectionHealthAdapter<OrderIntegrationAccount> = {
  provider: 'SHOPBY',
  readiness: 'VERIFIED',
  async checkConnection(account) {
    const now = new Date();
    if (!isIntegrationProxyConfigured()) {
      return { status: 'ACCOUNT_CONFIG_ERROR', rawCode: 'PROXY_NOT_CONFIGURED', checkedAt: now };
    }
    let credentials: ReturnType<typeof toShopbyCredentials>;
    try {
      credentials = toShopbyCredentials(account);
    } catch (error) {
      return {
        status: 'ACCOUNT_CONFIG_ERROR',
        rawCode: 'CREDENTIALS_MISSING',
        rawMessage: truncateRaw(error instanceof Error ? error.message : undefined),
        checkedAt: now,
      };
    }
    return runProbeHealthCheck({ probe: () => testShopbyConnection(credentials), now });
  },
};
