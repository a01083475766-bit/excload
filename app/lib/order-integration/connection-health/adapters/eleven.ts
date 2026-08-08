import type { OrderIntegrationAccount } from '@prisma/client';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { invokeIntegrationHttp } from '@/app/lib/integration-proxy/http-transport';
import {
  ELEVEN_API_ORIGIN,
  formatElevenApiDateTime,
  type ElevenCredentials,
  type ElevenOrderStatusEndpoint,
} from '@/app/lib/eleven/client';
import { extractElevenApiError } from '@/app/lib/eleven/xml-parser';
import { toElevenCredentials } from '@/app/lib/order-integration/eleven-account';
import { categorizeApiError } from '../error-categories';
import type { ConnectionHealthAdapter, ConnectionHealthResult, HealthErrorCategory } from '../types';

const RAW_MESSAGE_MAX = 200;
function truncate(message: string | undefined): string | undefined {
  if (!message) return undefined;
  return message.length > RAW_MESSAGE_MAX ? `${message.slice(0, RAW_MESSAGE_MAX)}…` : message;
}

export type ElevenHealthHttpFn = (input: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | null;
}) => Promise<{ httpStatus: number; bodyText: string }>;

const HEALTH_ENDPOINTS: ElevenOrderStatusEndpoint[] = ['complete', 'standing'];

function classifyElevenError(input: { httpStatus?: number; message?: string; code?: string }): HealthErrorCategory {
  const msg = (input.message ?? '').toLowerCase();
  const code = (input.code ?? '').toLowerCase();

  if (
    code.includes('unregistered') ||
    code.includes('invalidopenapi') ||
    code === '003' ||
    code === '013' ||
    msg.includes('openapikey') ||
    msg.includes('인증') ||
    msg.includes('api key') ||
    msg.includes('인증키') ||
    msg.includes('unregisteredkey') ||
    msg.includes('invalidopenapikey')
  ) {
    return 'AUTH_REQUIRED';
  }

  if (
    code.includes('accessdeny') ||
    code === '005' ||
    msg.includes('accessdeny') ||
    msg.includes('접근이 거부') ||
    msg.includes('접근 거부') ||
    /\bip\b/i.test(input.message ?? '') ||
    msg.includes('아이피')
  ) {
    return 'IP_NOT_ALLOWED';
  }

  if (code.includes('overedtraffic') || code === '004' || msg.includes('overedtraffic') || msg.includes('호출 가능')) {
    return 'RATE_LIMITED';
  }

  const category = categorizeApiError({ httpStatus: input.httpStatus, message: input.message });
  if (category !== 'UNKNOWN') return category;
  if (input.httpStatus === 401) return 'AUTH_REQUIRED';
  if (input.httpStatus === 403) return 'IP_NOT_ALLOWED';
  return 'UNKNOWN';
}

/** 수동 테스트·실제 주문조회도 자동 확인과 동일한 11번가 분류기를 사용한다. */
export function classifyElevenOperationError(error: unknown): HealthErrorCategory {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const codeMatch = /^\[([^\]]+)\]\s*/.exec(message);
  return classifyElevenError({
    message,
    code: codeMatch?.[1],
  });
}

function buildHealthPath(endpoint: ElevenOrderStatusEndpoint, start: Date, end: Date): string {
  return `/rest/ordservices/${endpoint}/${formatElevenApiDateTime(start)}/${formatElevenApiDateTime(end)}`;
}

/**
 * 11번가 연결 확인 코어(테스트 주입용).
 * 주문조회와 같이 complete+standing을 읽기 조회한다. 주문 저장/쓰기 없음.
 * 정상 빈 응답은 HEALTHY. XML/HTTP 오류는 공통 카테고리로 매핑.
 */
export async function runElevenHealthCheck(input: {
  http: ElevenHealthHttpFn;
  credentials: ElevenCredentials;
  now?: Date;
}): Promise<ConnectionHealthResult> {
  const now = input.now ?? new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  for (const endpoint of HEALTH_ENDPOINTS) {
    let res: { httpStatus: number; bodyText: string };
    try {
      res = await input.http({
        method: 'GET',
        url: `${ELEVEN_API_ORIGIN}${buildHealthPath(endpoint, start, now)}`,
        headers: {
          openapikey: input.credentials.openapikey.trim(),
          Accept: 'application/xml, text/xml, */*',
        },
        body: null,
      });
    } catch {
      return { status: 'TEMPORARY_ERROR', rawCode: 'NETWORK', checkedAt: now };
    }

    const apiError = extractElevenApiError(res.bodyText);

    if (res.httpStatus >= 200 && res.httpStatus < 300) {
      if (!apiError) continue;
      return {
        status: classifyElevenError({
          httpStatus: res.httpStatus,
          message: apiError.displayMessage,
          code: apiError.code,
        }),
        rawCode: apiError.code,
        rawMessage: truncate(apiError.displayMessage),
        checkedAt: now,
      };
    }

    return {
      status: classifyElevenError({
        httpStatus: res.httpStatus,
        message: apiError?.displayMessage,
        code: apiError?.code,
      }),
      rawCode: apiError?.code ?? String(res.httpStatus),
      rawMessage: truncate(apiError?.displayMessage),
      checkedAt: now,
    };
  }

  return { status: 'HEALTHY', checkedAt: now };
}

export const elevenHealthAdapter: ConnectionHealthAdapter<OrderIntegrationAccount> = {
  provider: 'ELEVEN',
  readiness: 'VERIFIED',
  async checkConnection(account) {
    const now = new Date();
    if (!isIntegrationProxyConfigured()) {
      return { status: 'ACCOUNT_CONFIG_ERROR', rawCode: 'PROXY_NOT_CONFIGURED', checkedAt: now };
    }
    let credentials: ElevenCredentials;
    try {
      credentials = toElevenCredentials(account);
    } catch (error) {
      return {
        status: 'ACCOUNT_CONFIG_ERROR',
        rawCode: 'CREDENTIALS_MISSING',
        rawMessage: truncate(error instanceof Error ? error.message : undefined),
        checkedAt: now,
      };
    }
    return runElevenHealthCheck({ http: invokeIntegrationHttp, credentials, now });
  },
};
