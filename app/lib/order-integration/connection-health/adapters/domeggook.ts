import type { OrderIntegrationAccount } from '@prisma/client';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { invokeIntegrationHttp } from '@/app/lib/integration-proxy/http-transport';
import {
  type DomeggookCredentials,
  type DomeggookHttpFn,
  redactDomeggookSecrets,
  testDomeggookConnection,
} from '@/app/lib/domeggook/client';
import { toDomeggookCredentials } from '@/app/lib/order-integration/domeggook-account';
import { categorizeApiError } from '../error-categories';
import type { ConnectionHealthAdapter, ConnectionHealthResult, HealthErrorCategory } from '../types';

const RAW_MESSAGE_MAX = 200;
function truncate(message: string | undefined): string | undefined {
  if (!message) return undefined;
  return message.length > RAW_MESSAGE_MAX ? `${message.slice(0, RAW_MESSAGE_MAX)}…` : message;
}

function classifyDomeggookError(input: {
  httpStatus?: number;
  message?: string;
}): HealthErrorCategory {
  const msg = (input.message ?? '').toLowerCase();
  if (msg.includes('네트워크') || msg.includes('연결에 실패')) {
    return 'TEMPORARY_ERROR';
  }
  if (msg.includes('호출 제한') || msg.includes('rate') || input.httpStatus === 429) {
    return 'RATE_LIMITED';
  }
  if (
    msg.includes('권한') ||
    msg.includes('private') ||
    msg.includes('승인되지') ||
    input.httpStatus === 403
  ) {
    return 'PERMISSION_DENIED';
  }
  if (
    msg.includes('api key') ||
    msg.includes('api키') ||
    msg.includes('로그인에 실패') ||
    msg.includes('비밀번호') ||
    msg.includes('회원 id') ||
    input.httpStatus === 401
  ) {
    return 'AUTH_REQUIRED';
  }
  if (msg.includes('고정 ip') || msg.includes('outbound_ip') || msg.includes('프록시')) {
    return 'ACCOUNT_CONFIG_ERROR';
  }
  const category = categorizeApiError({ httpStatus: input.httpStatus, message: input.message });
  if (category !== 'UNKNOWN') return category;
  return 'UNKNOWN';
}

/** 수동 테스트·주문조회도 자동 확인과 동일한 분류기를 사용한다. */
export function classifyDomeggookOperationError(error: unknown): HealthErrorCategory {
  return classifyDomeggookError({
    message: error instanceof Error ? error.message : String(error ?? ''),
  });
}

/**
 * 도매꾹 연결 확인 코어(테스트 주입용).
 * setLogin → getOrderList(판매, day=1) 읽기만. 상태 변경 API 없음.
 * 주문 0건이어도 HEALTHY.
 */
export async function runDomeggookHealthCheck(input: {
  http: DomeggookHttpFn;
  credentials: DomeggookCredentials;
  outboundIp?: string;
  now?: Date;
}): Promise<ConnectionHealthResult> {
  const now = input.now ?? new Date();
  const secrets = [
    input.credentials.password,
    input.credentials.apiKey,
    input.credentials.memberId,
  ];

  try {
    await testDomeggookConnection({
      credentials: input.credentials,
      outboundIp: input.outboundIp,
      http: input.http,
    });
    return { status: 'HEALTHY', checkedAt: now };
  } catch (error) {
    const message = redactDomeggookSecrets(
      error instanceof Error ? error.message : String(error ?? ''),
      secrets,
    );
    return {
      status: classifyDomeggookError({ message }),
      rawMessage: truncate(message),
      checkedAt: now,
    };
  }
}

export const domeggookHealthAdapter: ConnectionHealthAdapter<OrderIntegrationAccount> = {
  provider: 'DOMEGGOOK',
  readiness: 'VERIFIED',
  async checkConnection(account) {
    const now = new Date();
    if (!isIntegrationProxyConfigured()) {
      return { status: 'ACCOUNT_CONFIG_ERROR', rawCode: 'PROXY_NOT_CONFIGURED', checkedAt: now };
    }
    let credentials: DomeggookCredentials;
    try {
      credentials = toDomeggookCredentials(account);
    } catch (error) {
      return {
        status: 'ACCOUNT_CONFIG_ERROR',
        rawCode: 'CREDENTIALS_MISSING',
        rawMessage: truncate(error instanceof Error ? error.message : undefined),
        checkedAt: now,
      };
    }
    return runDomeggookHealthCheck({ http: invokeIntegrationHttp, credentials, now });
  },
};
