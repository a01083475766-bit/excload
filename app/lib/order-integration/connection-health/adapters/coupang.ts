import type { OrderIntegrationAccount } from '@prisma/client';
import { testCoupangConnection } from '@/app/lib/coupang/client';
import { CoupangApiError } from '@/app/lib/coupang/errors';
import {
  isCoupangApiKeyExpired,
  toCoupangCredentials,
} from '@/app/lib/order-integration/coupang-account';
import { categorizeApiError } from '../error-categories';
import type { ConnectionHealthAdapter, ConnectionHealthResult, HealthErrorCategory } from '../types';

const RAW_MESSAGE_MAX = 200;
function truncate(message: string | undefined): string | undefined {
  if (!message) return undefined;
  return message.length > RAW_MESSAGE_MAX ? `${message.slice(0, RAW_MESSAGE_MAX)}…` : message;
}

/** 쿠팡 CoupangApiError.code(및 httpStatus)를 공통 헬스 상태로 매핑한다. */
export function classifyCoupangError(error: unknown): HealthErrorCategory {
  if (error instanceof CoupangApiError) {
    switch (error.code) {
      case 'INVALID_CREDENTIALS':
      case 'API_KEY_EXPIRED':
        return 'AUTH_REQUIRED';
      case 'IP_NOT_REGISTERED':
        return 'IP_NOT_ALLOWED';
      case 'PERMISSION_DENIED':
        return 'PERMISSION_DENIED';
      case 'VENDOR_MISMATCH':
        return 'ACCOUNT_CONFIG_ERROR';
      case 'SERVER_DELAY':
        return error.httpStatus === 429 ? 'RATE_LIMITED' : 'TEMPORARY_ERROR';
      default:
        if (error.httpStatus) {
          return categorizeApiError({ httpStatus: error.httpStatus, message: error.coupangMessage });
        }
        return 'TEMPORARY_ERROR'; // httpStatus 없는 UNKNOWN → 네트워크/프록시로 추정
    }
  }
  if (error instanceof Error && error.message.includes('EXCLOAD_INTEGRATION_ENCRYPTION_KEY')) {
    return 'ACCOUNT_CONFIG_ERROR';
  }
  if (error instanceof Error && error.message.includes('업체코드')) {
    return 'ACCOUNT_CONFIG_ERROR';
  }
  return 'TEMPORARY_ERROR';
}

/**
 * 쿠팡 연결 확인 코어(테스트 주입용).
 * - 만료된 키는 API 호출 전에 AUTH_REQUIRED로 판정
 * - probe 성공(주문 0건 포함) → HEALTHY, 실패 → 오류 매핑
 */
export async function runCoupangHealthCheck(input: {
  probe: () => Promise<unknown>;
  expiresAt?: Date | null;
  now?: Date;
}): Promise<ConnectionHealthResult> {
  const now = input.now ?? new Date();
  if (isCoupangApiKeyExpired(input.expiresAt ?? null, now)) {
    return { status: 'AUTH_REQUIRED', rawCode: 'API_KEY_EXPIRED', checkedAt: now };
  }
  try {
    await input.probe();
    return { status: 'HEALTHY', checkedAt: now };
  } catch (error) {
    const rawCode = error instanceof CoupangApiError ? error.code : undefined;
    const rawMessage =
      error instanceof CoupangApiError
        ? truncate(error.coupangMessage ?? error.message)
        : truncate(error instanceof Error ? error.message : undefined);
    return { status: classifyCoupangError(error), rawCode, rawMessage, checkedAt: now };
  }
}

export const coupangHealthAdapter: ConnectionHealthAdapter<OrderIntegrationAccount> = {
  provider: 'COUPANG',
  readiness: 'VERIFIED',
  async checkConnection(account) {
    const now = new Date();
    let credentials: ReturnType<typeof toCoupangCredentials>;
    try {
      credentials = toCoupangCredentials(account);
    } catch (error) {
      return {
        status: 'ACCOUNT_CONFIG_ERROR',
        rawCode: 'CREDENTIALS_MISSING',
        rawMessage: truncate(error instanceof Error ? error.message : undefined),
        checkedAt: now,
      };
    }
    return runCoupangHealthCheck({
      probe: () => testCoupangConnection(credentials),
      expiresAt: account.expiresAt,
      now,
    });
  },
};
