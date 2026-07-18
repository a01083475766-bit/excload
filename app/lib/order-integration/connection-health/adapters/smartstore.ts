import type { OrderIntegrationAccount } from '@prisma/client';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { invokeIntegrationHttp } from '@/app/lib/integration-proxy/http-transport';
import {
  SMARTSTORE_API_ORIGIN,
  SMARTSTORE_TOKEN_URL,
  SmartstoreApiError,
  buildSmartstoreQueryWindowsFromRange,
  buildSmartstoreTokenRequestBody,
  type SmartstoreCredentials,
} from '@/app/lib/smartstore/client';
import { toSmartstoreCredentials } from '@/app/lib/order-integration/smartstore-account';
import { categorizeApiError } from '../error-categories';
import type {
  ConnectionHealthAdapter,
  ConnectionHealthResult,
  ConnectionOperationResult,
  HealthErrorCategory,
  HealthStatus,
} from '../types';

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
export type SmartstoreApiFailureInput = {
  httpStatus?: number;
  code?: string;
  message?: string;
  stage: 'TOKEN' | 'ORDER';
  networkFailure?: boolean;
};

/**
 * 스마트스토어가 돌려준 구조화된 HTTP 정보로 오류를 한 번만 분류한다.
 * 토큰 단계의 `invalid_client`를 일반적인 `invalid` 요청 오류보다 먼저 처리하는 것이 중요하다.
 */
export function classifySmartstoreApiFailure(
  input: SmartstoreApiFailureInput,
): HealthErrorCategory {
  const code = (input.code ?? '').trim().toLowerCase();
  const message = (input.message ?? '').trim().toLowerCase();
  const status = input.httpStatus;

  if (
    input.networkFailure ||
    status === 408 ||
    (typeof status === 'number' && status >= 500) ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network error') ||
    message.includes('connection reset')
  ) {
    return 'TEMPORARY_ERROR';
  }
  if (status === 429 || code.includes('rate_limit') || code.includes('quota')) {
    return 'RATE_LIMITED';
  }
  if (
    code.includes('ip_not_allowed') ||
    code.includes('gw.ip') ||
    message.includes('not allowed ip') ||
    message.includes('ip is not') ||
    message.includes('ip address') ||
    message.includes('허용되지 않은 ip') ||
    message.includes('ip 미등록') ||
    message.includes('아이피')
  ) {
    return 'IP_NOT_ALLOWED';
  }

  const looksLikeAuth =
    code.includes('gw.authn') ||
    code.includes('invalid_client') ||
    code.includes('unauthorized') ||
    code.includes('unauthenticated') ||
    message.includes('invalid_client') ||
    message.includes('invalid client') ||
    message.includes('client id') ||
    message.includes('clientid') ||
    message.includes('client_id') ||
    message.includes('client secret') ||
    message.includes('clientsecret') ||
    message.includes('client_secret') ||
    message.includes('전자서명') ||
    message.includes('전자 서명') ||
    message.includes('서명 실패') ||
    message.includes('signature') ||
    message.includes('authentication failed') ||
    message.includes('인증 실패');
  if (looksLikeAuth || status === 401) return 'AUTH_REQUIRED';

  if (
    code.includes('approval') ||
    code.includes('contract') ||
    message.includes('approval') ||
    message.includes('pending') ||
    message.includes('승인') ||
    message.includes('계약')
  ) {
    return 'APPROVAL_REQUIRED';
  }

  if (
    code.includes('authz') ||
    code.includes('forbidden') ||
    message.includes('permission') ||
    message.includes('forbidden') ||
    message.includes('scope') ||
    message.includes('권한') ||
    status === 403
  ) {
    return 'PERMISSION_DENIED';
  }

  if (code.includes('client_configuration')) return 'ACCOUNT_CONFIG_ERROR';

  // 토큰 엔드포인트에는 주문 조회 날짜/조건 파라미터가 없다. 따라서 이 단계의
  // 400은 조회 조건 오류가 아니라 클라이언트 인증정보/서명 실패로 취급한다.
  if (input.stage === 'TOKEN' && status === 400) return 'AUTH_REQUIRED';

  if (
    message.includes('parameter') ||
    message.includes('lastchangedfrom') ||
    message.includes('lastchangedto') ||
    message.includes('조회 조건') ||
    message.includes('조회 기간') ||
    message.includes('날짜') ||
    message.includes('시작일') ||
    message.includes('종료일') ||
    status === 400
  ) {
    return 'REQUEST_INVALID';
  }

  const fallback = categorizeApiError(input);
  // 공통 분류기의 광범위한 `invalid` 규칙은 스마트스토어에는 적용하지 않는다.
  // 조회 날짜/조건 오류는 위에서 명시적으로 확인한 경우에만 REQUEST_INVALID이다.
  return fallback === 'REQUEST_INVALID' ? 'UNKNOWN' : fallback;
}

function classifyTokenFailure(input: {
  httpStatus?: number;
  code?: string;
  message?: string;
}): HealthStatus {
  return classifySmartstoreApiFailure({ ...input, stage: 'TOKEN' });
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

  const category = classifySmartstoreApiFailure({
    stage: 'ORDER',
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
    const secondCategory = classifySmartstoreApiFailure({
      stage: 'ORDER',
      httpStatus: second.httpStatus,
      code: second.code,
      message: second.message,
    });
    return {
      status: secondCategory,
      rawCode: second.code ?? String(second.httpStatus),
      rawMessage: truncate(second.message),
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

/** 실제 주문조회가 보존한 SmartstoreApiError를 저장용 구조화 결과로 변환한다. */
export function categorizeSmartstoreOperationError(
  error: unknown,
): Extract<ConnectionOperationResult, { success: false }> {
  const structured = findSmartstoreApiError(error);
  if (structured) {
    const category = classifySmartstoreApiFailure({
      stage: structured.stage,
      httpStatus: structured.httpStatus,
      code: structured.code,
      message: structured.rawMessage,
      networkFailure: structured.networkFailure,
    });
    return {
      success: false,
      category,
      errorCode: structured.code ?? (structured.httpStatus ? String(structured.httpStatus) : undefined),
      userMessage: smartstoreUserMessage(category),
      rawMessage: truncate(structured.rawMessage),
    };
  }

  // 구조화 정보가 없는 예상 밖 오류는 문자열로 원인을 추측하지 않는다.
  const message = error instanceof Error ? error.message : String(error ?? '');
  return {
    success: false,
    category: 'UNKNOWN',
    userMessage: smartstoreUserMessage('UNKNOWN'),
    rawMessage: truncate(message),
  };
}

export function smartstoreHealthResultToOperationResult(
  result: ConnectionHealthResult,
): ConnectionOperationResult {
  if (result.status === 'HEALTHY') return { success: true };
  return {
    success: false,
    category: result.status,
    errorCode: result.rawCode,
    userMessage: smartstoreUserMessage(result.status),
    rawMessage: result.rawMessage,
  };
}

function smartstoreUserMessage(category: HealthErrorCategory): string {
  switch (category) {
    case 'AUTH_REQUIRED':
      return '스마트스토어 연결 정보를 확인해 주세요.';
    case 'IP_NOT_ALLOWED':
      return '스마트스토어에 등록한 접근 IP를 확인해 주세요.';
    case 'PERMISSION_DENIED':
      return '스마트스토어 주문 조회 권한을 확인해 주세요.';
    case 'APPROVAL_REQUIRED':
      return '스마트스토어 API 이용 승인 또는 계약 상태를 확인해 주세요.';
    case 'RATE_LIMITED':
      return '스마트스토어 호출이 많습니다. 잠시 후 다시 시도해 주세요.';
    case 'TEMPORARY_ERROR':
      return '스마트스토어 연결이 일시적으로 원활하지 않습니다. 잠시 후 다시 시도해 주세요.';
    case 'ACCOUNT_CONFIG_ERROR':
      return '스마트스토어 연결 설정을 확인해 주세요.';
    case 'REQUEST_INVALID':
      return '스마트스토어 주문 조회 조건을 확인해 주세요.';
    case 'UNKNOWN':
      return '스마트스토어 연결 상태를 확인하지 못했습니다.';
  }
}

function findSmartstoreApiError(error: unknown): SmartstoreApiError | null {
  let current = error;
  const seen = new Set<unknown>();

  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof SmartstoreApiError) return current;
    if (current instanceof Error && 'cause' in current) {
      current = current.cause;
      continue;
    }
    break;
  }
  return null;
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
