import type { OrderIntegrationAccount } from '@prisma/client';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { testGodomallConnection } from '@/app/lib/godomall/client';
import { isGodomallPartnerKeyConfigured } from '@/app/lib/godomall/partner-key';
import { toGodomallCredentials } from '@/app/lib/order-integration/godomall-account';
import type { ConnectionHealthAdapter } from '../types';
import { runProbeHealthCheck, truncateRaw } from './probe-health';

/**
 * 고도몰(NHN커머스) 연결 확인. 기존 testGodomallConnection(최근 3일, 첫 페이지, 최대 1건, 저장/쓰기 없음).
 * partner_key는 서버 env(또는 개발용 override), user key는 계정별 인증 정보다.
 * - partner_key 미설정 → 불필요한 API 호출 전에 ACCOUNT_CONFIG_ERROR
 * - partner_key가 있으면 남은 인증 실패는 사용자 key 문제로 보고 AUTH_REQUIRED(공통 분류)
 */
export const godomallHealthAdapter: ConnectionHealthAdapter<OrderIntegrationAccount> = {
  provider: 'GODOMALL',
  readiness: 'VERIFIED',
  async checkConnection(account) {
    const now = new Date();
    if (!isIntegrationProxyConfigured()) {
      return { status: 'ACCOUNT_CONFIG_ERROR', rawCode: 'PROXY_NOT_CONFIGURED', checkedAt: now };
    }
    let credentials: ReturnType<typeof toGodomallCredentials>;
    try {
      credentials = toGodomallCredentials(account);
    } catch (error) {
      return {
        status: 'ACCOUNT_CONFIG_ERROR',
        rawCode: 'CREDENTIALS_MISSING',
        rawMessage: truncateRaw(error instanceof Error ? error.message : undefined),
        checkedAt: now,
      };
    }
    // 서버 partner_key(env)도 없고 계정 override도 없으면 설정 문제로 즉시 판정(불필요 호출 방지).
    if (!isGodomallPartnerKeyConfigured() && !credentials.partnerKey) {
      return { status: 'ACCOUNT_CONFIG_ERROR', rawCode: 'PARTNER_KEY_MISSING', checkedAt: now };
    }
    return runProbeHealthCheck({ probe: () => testGodomallConnection(credentials), now });
  },
};
