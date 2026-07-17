import type { OrderIntegrationAccount } from '@prisma/client';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { invokeIntegrationHttp } from '@/app/lib/integration-proxy/http-transport';
import {
  SMARTSTORE_API_ORIGIN,
  SMARTSTORE_TOKEN_URL,
  buildSmartstoreQueryWindowsFromRange,
  buildSmartstoreTokenRequestBody,
  type SmartstoreCredentials,
} from '@/app/lib/smartstore/client';
import { toSmartstoreCredentials } from '@/app/lib/order-integration/smartstore-account';
import { categorizeApiError } from '../error-categories';
import type { ConnectionHealthAdapter, ConnectionHealthResult, HealthStatus } from '../types';

/** 헬스체크에서 사용하는 최소 읽기 조회 범위(분). 짧은 단일 구간만 사용한다. */
const HEALTH_CHECK_WINDOW_MS = 10 * 60 * 1000;
const RAW_MESSAGE_MAX = 200;

/** 관리자 진단용으로만 저장하는 짧은 원본 메시지. 시크릿/토큰/헤더는 담지 않는다. */
function truncate(message: string | undefined): string | undefined {
  if (!message) return undefined;
  return message.length > RAW_MESSAGE_MAX ? `${message.slice(0, RAW_MESSAGE_MAX)}…` : message;
}

function parseNaverError(bodyText: string): { code?: string; message?: string } {
  try {
    const parsed = JSON.parse(bodyText) as { code?: string; message?: string };
    return { code: parsed.code, message: parsed.message };
  } catch {
    return {};
  }
}

/**
 * 토큰 발급 실패를 분류한다. 토큰 엔드포인트에는 조회 파라미터가 없으므로
 * IP/호출제한/일시오류가 아닌 인증정보·전자서명·invalid_client 계열은 AUTH_REQUIRED로 본다.
 * (엑클로드 서버 설정 누락은 이 단계 이전 프록시 점검에서 ACCOUNT_CONFIG_ERROR로 처리된다.)
 */
function classifyTokenFailure(input: {
  httpStatus?: number;
  code?: string;
  message?: string;
}): HealthStatus {
  const category = categorizeApiError(input);
  switch (category) {
    case 'IP_NOT_ALLOWED':
      return 'IP_NOT_ALLOWED';
    case 'RATE_LIMITED':
      return 'RATE_LIMITED';
    case 'TEMPORARY_ERROR':
      return 'TEMPORARY_ERROR';
    case 'UNKNOWN': {
      const code = (input.code ?? '').toLowerCase();
      const msg = (input.message ?? '').toLowerCase();
      const looksLikeAuth =
        code.includes('invalid_client') ||
        code.includes('unauthorized') ||
        msg.includes('sign') ||
        msg.includes('서명') ||
        input.httpStatus === 401 ||
        input.httpStatus === 400;
      return looksLikeAuth ? 'AUTH_REQUIRED' : 'UNKNOWN';
    }
    default:
      // AUTH_REQUIRED / ACCOUNT_CONFIG_ERROR / PERMISSION_DENIED / APPROVAL_REQUIRED / REQUEST_INVALID
      return 'AUTH_REQUIRED';
  }
}

/** 프록시 저수준 HTTP 호출자(테스트 주입 가능). */
export type SmartstoreHealthHttpFn = (input: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | null;
}) => Promise<{ httpStatus: number; bodyText: string }>;

type TokenOutcome =
  | { ok: true; accessToken: string }
  | { ok: false; result: ConnectionHealthResult };

type OrderCallOutcome =
  | { kind: 'ok' }
  | { kind: 'network' }
  | { kind: 'http'; httpStatus: number; code?: string; message?: string };

async function issueToken(
  http: SmartstoreHealthHttpFn,
  credentials: SmartstoreCredentials,
  now: Date,
): Promise<TokenOutcome> {
  const { body } = buildSmartstoreTokenRequestBody(credentials);

  let res: { httpStatus: number; bodyText: string };
  try {
    res = await http({
      method: 'POST',
      url: SMARTSTORE_TOKEN_URL,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    return {
      ok: false,
      result: { status: 'TEMPORARY_ERROR', rawCode: 'NETWORK', checkedAt: now },
    };
  }

  if (res.httpStatus < 200 || res.httpStatus >= 300) {
    const { code, message } = parseNaverError(res.bodyText);
    return {
      ok: false,
      result: {
        status: classifyTokenFailure({ httpStatus: res.httpStatus, code, message }),
        rawCode: code ?? String(res.httpStatus),
        rawMessage: truncate(message),
        checkedAt: now,
      },
    };
  }

  let parsed: { access_token?: string };
  try {
    parsed = JSON.parse(res.bodyText) as { access_token?: string };
  } catch {
    return {
      ok: false,
      result: { status: 'UNKNOWN', rawCode: 'TOKEN_PARSE', checkedAt: now },
    };
  }

  if (!parsed.access_token) {
    // 2xx인데 토큰이 없는 비정상 응답 → 판별 불가.
    return {
      ok: false,
      result: { status: 'UNKNOWN', rawCode: 'NO_ACCESS_TOKEN', checkedAt: now },
    };
  }

  return { ok: true, accessToken: parsed.access_token };
}

async function callMinimalOrderApi(
  http: SmartstoreHealthHttpFn,
  accessToken: string,
  pathWithQuery: string,
): Promise<OrderCallOutcome> {
  let res: { httpStatus: number; bodyText: string };
  try {
    res = await http({
      method: 'GET',
      url: `${SMARTSTORE_API_ORIGIN}${pathWithQuery}`,
      headers: { Authorization: `Bearer ${accessToken}` },
      body: null,
    });
  } catch {
    return { kind: 'network' };
  }

  if (res.httpStatus >= 200 && res.httpStatus < 300) {
    // 주문 0건의 정상 빈 응답도 성공으로 본다.
    return { kind: 'ok' };
  }

  const { code, message } = parseNaverError(res.bodyText);
  return { kind: 'http', httpStatus: res.httpStatus, code, message };
}

function buildMinimalOrderPath(now: Date): string {
  const windows = buildSmartstoreQueryWindowsFromRange({
    fromMs: now.getTime() - HEALTH_CHECK_WINDOW_MS,
    toMs: now.getTime(),
    now,
  });
  const win = windows[0];
  const params = new URLSearchParams({
    lastChangedFrom: win.fromIso,
    lastChangedTo: win.toIso,
  });
  return `/external/v1/pay-order/seller/product-orders/last-changed-statuses?${params.toString()}`;
}

/**
 * 스마트스토어 연결 상태를 실제로 확인한다.
 * 토큰 발급 성공 + 최소 범위 읽기 전용 주문 API 1회 성공까지 확인해야 HEALTHY.
 * 실제 주문 저장/동기화/쓰기 API는 절대 호출하지 않는다.
 */
export async function runSmartstoreHealthCheck(input: {
  credentials: SmartstoreCredentials;
  http: SmartstoreHealthHttpFn;
  now?: Date;
}): Promise<ConnectionHealthResult> {
  const now = input.now ?? new Date();

  const firstToken = await issueToken(input.http, input.credentials, now);
  if (!firstToken.ok) return firstToken.result;

  const path = buildMinimalOrderPath(now);
  const first = await callMinimalOrderApi(input.http, firstToken.accessToken, path);

  if (first.kind === 'ok') return { status: 'HEALTHY', checkedAt: now };
  if (first.kind === 'network') return { status: 'TEMPORARY_ERROR', rawCode: 'NETWORK', checkedAt: now };

  const category = categorizeApiError({
    httpStatus: first.httpStatus,
    code: first.code,
    message: first.message,
  });

  // 401 GW.AUTHN 등 인증 오류면 토큰 재발급 후 정확히 1회만 재시도한다.
  if (category === 'AUTH_REQUIRED') {
    const retryToken = await issueToken(input.http, input.credentials, now);
    if (!retryToken.ok) return retryToken.result;

    const second = await callMinimalOrderApi(input.http, retryToken.accessToken, path);
    if (second.kind === 'ok') return { status: 'HEALTHY', checkedAt: now };
    if (second.kind === 'network') {
      return { status: 'TEMPORARY_ERROR', rawCode: 'NETWORK', checkedAt: now };
    }
    return {
      status: 'AUTH_REQUIRED',
      rawCode: second.code ?? first.code ?? '401',
      rawMessage: truncate(second.message ?? first.message),
      checkedAt: now,
    };
  }

  return {
    status: category,
    rawCode: first.code ?? String(first.httpStatus),
    rawMessage: truncate(first.message),
    checkedAt: now,
  };
}

/**
 * 실제 스마트스토어 주문조회 등에서 던져진 오류(문자열 메시지)를 공통 헬스 결과로 분류한다.
 * 클라이언트가 httpStatus를 숨기므로 메시지에 담긴 게이트웨이 코드(GW.*)와 키워드를 활용한다.
 * REQUEST_INVALID(조회 조건 오류)는 호출 전에 검증되어 이 경로로 오지 않는다.
 */
export function categorizeSmartstoreError(error: unknown, now: Date = new Date()): ConnectionHealthResult {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const codeMatch = message.match(/GW\.[A-Z_]+/i);
  const code = codeMatch?.[0];
  return {
    status: categorizeApiError({ code, message }),
    rawCode: code,
    rawMessage: truncate(message),
    checkedAt: now,
  };
}

export const smartstoreHealthAdapter: ConnectionHealthAdapter<OrderIntegrationAccount> = {
  provider: 'SMARTSTORE',
  readiness: 'VERIFIED',
  async checkConnection(account) {
    const now = new Date();

    if (!isIntegrationProxyConfigured()) {
      return { status: 'ACCOUNT_CONFIG_ERROR', rawCode: 'PROXY_NOT_CONFIGURED', checkedAt: now };
    }

    let credentials: SmartstoreCredentials;
    try {
      credentials = toSmartstoreCredentials(account);
    } catch (error) {
      return {
        status: 'ACCOUNT_CONFIG_ERROR',
        rawCode: 'CREDENTIALS_MISSING',
        rawMessage: truncate(error instanceof Error ? error.message : undefined),
        checkedAt: now,
      };
    }

    return runSmartstoreHealthCheck({ credentials, http: invokeIntegrationHttp, now });
  },
};
