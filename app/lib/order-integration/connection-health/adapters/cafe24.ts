import type { OrderIntegrationAccount } from '@prisma/client';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { testCafe24Connection } from '@/app/lib/cafe24/client';
import {
  ensureCafe24AccessToken,
  toCafe24Credentials,
} from '@/app/lib/order-integration/cafe24-account';
import type { ConnectionHealthAdapter, ConnectionHealthResult, HealthErrorCategory } from '../types';

const RAW_MESSAGE_MAX = 200;
function truncate(message: string | undefined): string | undefined {
  if (!message) return undefined;
  return message.length > RAW_MESSAGE_MAX ? `${message.slice(0, RAW_MESSAGE_MAX)}…` : message;
}

/**
 * 카페24 오류 메시지를 공통 헬스 상태로 분류한다.
 * (client가 httpStatus를 숨기고 한글 메시지만 throw하므로 메시지 신호를 사용한다.)
 */
export function classifyCafe24Error(error: unknown): HealthErrorCategory {
  const msg = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  if (msg.includes('mall.read_order') || msg.includes('scope') || msg.includes('권한')) {
    return 'PERMISSION_DENIED';
  }
  if (
    msg.includes('refresh') ||
    msg.includes('oauth 인증') ||
    msg.includes('연동을 다시') ||
    msg.includes('token') ||
    msg.includes('인증')
  ) {
    return 'AUTH_REQUIRED';
  }
  if (
    msg.includes('encryption_key') ||
    msg.includes('mall id') ||
    msg.includes('몰 id') ||
    msg.includes('저장') ||
    msg.includes('설정')
  ) {
    return 'ACCOUNT_CONFIG_ERROR';
  }
  if (msg.includes('429') || msg.includes('rate') || msg.includes('제한')) {
    return 'RATE_LIMITED';
  }
  if (
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('프록시') ||
    /http 5\d\d/.test(msg)
  ) {
    return 'TEMPORARY_ERROR';
  }
  return 'UNKNOWN';
}

/**
 * 카페24 연결 확인 코어(테스트 주입용).
 * 1) refresh token으로 토큰 갱신 가능 여부, 2) 주문 조회 scope 보유 여부를 확인한다.
 * 토큰 저장은 ensureToken 내부의 기존 보안 저장 흐름을 사용하며, 토큰은 결과에 노출하지 않는다.
 */
export async function runCafe24HealthCheck(input: {
  ensureToken: () => Promise<{ accessToken: string }>;
  verifyScope: (accessToken: string) => Promise<unknown>;
  now?: Date;
}): Promise<ConnectionHealthResult> {
  const now = input.now ?? new Date();

  let accessToken: string;
  try {
    ({ accessToken } = await input.ensureToken());
  } catch (error) {
    return {
      status: classifyCafe24Error(error),
      rawMessage: truncate(error instanceof Error ? error.message : undefined),
      checkedAt: now,
    };
  }

  try {
    await input.verifyScope(accessToken);
    return { status: 'HEALTHY', checkedAt: now };
  } catch (error) {
    return {
      status: classifyCafe24Error(error),
      rawMessage: truncate(error instanceof Error ? error.message : undefined),
      checkedAt: now,
    };
  }
}

export const cafe24HealthAdapter: ConnectionHealthAdapter<OrderIntegrationAccount> = {
  provider: 'CAFE24',
  readiness: 'VERIFIED',
  async checkConnection(account) {
    const now = new Date();
    if (!isIntegrationProxyConfigured()) {
      return { status: 'ACCOUNT_CONFIG_ERROR', rawCode: 'PROXY_NOT_CONFIGURED', checkedAt: now };
    }
    let credentials: ReturnType<typeof toCafe24Credentials>;
    try {
      credentials = toCafe24Credentials(account);
    } catch (error) {
      return {
        status: 'ACCOUNT_CONFIG_ERROR',
        rawCode: 'CREDENTIALS_MISSING',
        rawMessage: truncate(error instanceof Error ? error.message : undefined),
        checkedAt: now,
      };
    }
    return runCafe24HealthCheck({
      ensureToken: async () => {
        const { accessToken } = await ensureCafe24AccessToken(account);
        return { accessToken };
      },
      verifyScope: (accessToken) => testCafe24Connection({ credentials, accessToken }),
      now,
    });
  },
};
