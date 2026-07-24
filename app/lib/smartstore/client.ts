import { hashSync } from 'bcryptjs';
import { assertIntegrationProxyConfigReady, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { invokeIntegrationHttp } from '@/app/lib/integration-proxy/http-transport';

export const SMARTSTORE_API_ORIGIN = 'https://api.commerce.naver.com';
export const SMARTSTORE_TOKEN_PATH = '/external/v1/oauth2/token';
export const SMARTSTORE_TOKEN_URL = `${SMARTSTORE_API_ORIGIN}${SMARTSTORE_TOKEN_PATH}`;

export type SmartstoreAuthType = 'SELF' | 'SELLER';

export type SmartstoreCredentials = {
  clientId: string;
  clientSecret: string;
  authType: SmartstoreAuthType;
};

export type SmartstoreApiErrorStage = 'TOKEN' | 'ORDER';

/** 스마트스토어 원본 응답의 구조를 보존하되 브라우저용 message에는 내부 코드를 넣지 않는다. */
export class SmartstoreApiError extends Error {
  readonly stage: SmartstoreApiErrorStage;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly rawMessage?: string;
  readonly networkFailure: boolean;

  constructor(input: {
    stage: SmartstoreApiErrorStage;
    httpStatus?: number;
    code?: string;
    rawMessage?: string;
    networkFailure?: boolean;
    cause?: unknown;
  }) {
    super(
      input.stage === 'TOKEN'
        ? '스마트스토어 연결 정보를 확인해 주세요.'
        : '스마트스토어 주문 조회에 실패했습니다.',
      input.cause === undefined ? undefined : { cause: input.cause },
    );
    this.name = 'SmartstoreApiError';
    this.stage = input.stage;
    this.httpStatus = input.httpStatus;
    this.code = input.code;
    this.rawMessage = input.rawMessage;
    this.networkFailure = input.networkFailure === true;
  }
}

function parseSmartstoreError(bodyText: string): { code?: string; message?: string } {
  try {
    const parsed = JSON.parse(bodyText) as { message?: string; code?: string };
    return { code: parsed.code, message: parsed.message };
  } catch {
    return {};
  }
}

export function generateSmartstoreClientSecretSign(input: {
  clientId: string;
  clientSecret: string;
  timestamp: number;
}): string {
  const password = `${input.clientId}_${input.timestamp}`;
  const hashed = hashSync(password, input.clientSecret);
  return Buffer.from(hashed, 'utf8').toString('base64');
}

export function buildSmartstoreTokenRequestBody(credentials: SmartstoreCredentials): {
  body: string;
  timestamp: number;
} {
  const timestamp = Date.now();
  const clientSecretSign = generateSmartstoreClientSecretSign({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    timestamp,
  });

  const params = new URLSearchParams({
    client_id: credentials.clientId,
    timestamp: String(timestamp),
    client_secret_sign: clientSecretSign,
    grant_type: 'client_credentials',
    type: credentials.authType,
  });

  return {
    body: params.toString(),
    timestamp,
  };
}

/** 한 번의 주문조회(또는 동일 세션 요청)에만 묶는 토큰 재사용 범위. 전역 캐시 금지. */
export type SmartstoreFetchSession = {
  credentials: SmartstoreCredentials;
  accessToken: string | null;
  tokenIssueCount: number;
  /** 401로 인한 토큰 재발급 횟수 */
  authRefreshCount: number;
  /** 429 백오프 재시도 누적 횟수 */
  rateLimitRetryCount: number;
  startedAtMs: number;
  sleep: (ms: number) => Promise<void>;
};

/** 429 추가 재시도 상한(최초 실패 제외). */
export const SMARTSTORE_RATE_LIMIT_MAX_RETRIES = 2;
/** Retry-After / 지수 백오프 대기 상한(ms). */
export const SMARTSTORE_RATE_LIMIT_BACKOFF_MAX_MS = 10_000;
const SMARTSTORE_RATE_LIMIT_BACKOFF_BASE_MS = 400;

export type SmartstoreFetchDiagnostic = {
  stage: SmartstoreApiErrorStage | 'ORDER' | 'TOKEN';
  httpStatus?: number;
  code?: string;
  windowCount?: number;
  failedWindowIndex?: number;
  failedPage?: number;
  tokenIssueCount?: number;
  authRefreshCount?: number;
  rateLimitRetryCount?: number;
  durationMs?: number;
};

/** 민감정보 없이 진단용 필드만 기록한다. */
export function logSmartstoreFetchDiagnostic(input: SmartstoreFetchDiagnostic): void {
  console.error('[Smartstore Fetch]', {
    stage: input.stage,
    httpStatus: input.httpStatus ?? null,
    code: input.code ?? null,
    windowCount: input.windowCount ?? null,
    failedWindowIndex: input.failedWindowIndex ?? null,
    failedPage: input.failedPage ?? null,
    tokenIssueCount: input.tokenIssueCount ?? null,
    authRefreshCount: input.authRefreshCount ?? null,
    rateLimitRetryCount: input.rateLimitRetryCount ?? null,
    durationMs: input.durationMs ?? null,
  });
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function createSmartstoreFetchSession(input: {
  credentials: SmartstoreCredentials;
  sleep?: (ms: number) => Promise<void>;
  nowMs?: number;
}): SmartstoreFetchSession {
  return {
    credentials: input.credentials,
    accessToken: null,
    tokenIssueCount: 0,
    authRefreshCount: 0,
    rateLimitRetryCount: 0,
    startedAtMs: input.nowMs ?? Date.now(),
    sleep: input.sleep ?? defaultSleep,
  };
}

/**
 * Retry-After 헤더 값을 ms로 변환. 초 단위 숫자만 허용(날짜 형식은 무시).
 * 상한을 넘는 값은 상한으로 자른다.
 */
export function parseRetryAfterMs(
  raw: string | null | undefined,
  maxMs: number = SMARTSTORE_RATE_LIMIT_BACKOFF_MAX_MS,
): number | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const seconds = Number(trimmed);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(Math.ceil(seconds * 1000), maxMs);
}

/** attemptIndex 0 = 첫 429 재시도. Retry-After 우선, 없으면 지수 백오프. */
export function computeRateLimitBackoffMs(input: {
  attemptIndex: number;
  retryAfterHeader?: string | null;
}): number {
  const fromHeader = parseRetryAfterMs(input.retryAfterHeader);
  if (fromHeader != null) return fromHeader;
  const exp = SMARTSTORE_RATE_LIMIT_BACKOFF_BASE_MS * 2 ** Math.max(0, input.attemptIndex);
  return Math.min(exp, SMARTSTORE_RATE_LIMIT_BACKOFF_MAX_MS);
}

function readRetryAfterHeader(
  headers: Record<string, string> | null | undefined,
): string | null {
  if (!headers) return null;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'retry-after') return value;
  }
  return null;
}

export async function requestSmartstoreAccessToken(
  credentials: SmartstoreCredentials,
): Promise<{ accessToken: string; expiresIn?: number }> {
  if (!isIntegrationProxyConfigured()) {
    throw new Error('스마트스토어 API는 고정 IP 프록시 설정이 필요합니다.');
  }

  try {
    assertIntegrationProxyConfigReady();
  } catch (cause) {
    throw new SmartstoreApiError({
      stage: 'TOKEN',
      code: 'CLIENT_CONFIGURATION',
      cause,
    });
  }

  const { body } = buildSmartstoreTokenRequestBody(credentials);

  let response: { httpStatus: number; bodyText: string };
  try {
    response = await invokeIntegrationHttp({
      method: 'POST',
      url: SMARTSTORE_TOKEN_URL,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
  } catch (cause) {
    throw new SmartstoreApiError({ stage: 'TOKEN', networkFailure: true, cause });
  }

  const { httpStatus, bodyText } = response;

  if (httpStatus < 200 || httpStatus >= 300) {
    const parsed = parseSmartstoreError(bodyText);
    throw new SmartstoreApiError({
      stage: 'TOKEN',
      httpStatus,
      code: parsed.code,
      rawMessage: parsed.message,
    });
  }

  let parsed: { access_token?: string; expires_in?: number };
  try {
    parsed = JSON.parse(bodyText) as { access_token?: string; expires_in?: number };
  } catch {
    throw new SmartstoreApiError({
      stage: 'TOKEN',
      httpStatus,
      code: 'TOKEN_RESPONSE_INVALID',
    });
  }

  if (!parsed.access_token) {
    throw new SmartstoreApiError({
      stage: 'TOKEN',
      httpStatus,
      code: 'TOKEN_RESPONSE_INVALID',
    });
  }

  return {
    accessToken: parsed.access_token,
    expiresIn: parsed.expires_in,
  };
}

async function ensureSmartstoreSessionToken(session: SmartstoreFetchSession): Promise<string> {
  if (session.accessToken) return session.accessToken;
  const issued = await requestSmartstoreAccessToken(session.credentials);
  session.accessToken = issued.accessToken;
  session.tokenIssueCount += 1;
  return session.accessToken;
}

type SmartstoreHttpResult = {
  httpStatus: number;
  bodyText: string;
  responseHeaders?: Record<string, string> | null;
};

async function invokeSmartstoreOrderHttp(input: {
  method: string;
  url: string;
  accessToken: string;
  body?: string | null;
  contentType?: string;
}): Promise<SmartstoreHttpResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
  };
  if (input.body != null) {
    headers['Content-Type'] = input.contentType ?? 'application/json';
  }

  try {
    const response = await invokeIntegrationHttp({
      method: input.method,
      url: input.url,
      headers,
      body: input.body ?? null,
    });
    return {
      httpStatus: response.httpStatus,
      bodyText: response.bodyText,
      responseHeaders:
        (response as { responseHeaders?: Record<string, string> }).responseHeaders ?? null,
    };
  } catch (cause) {
    throw new SmartstoreApiError({ stage: 'ORDER', networkFailure: true, cause });
  }
}

function parseOrderSuccessBody<T>(httpStatus: number, bodyText: string): T {
  try {
    return JSON.parse(bodyText) as T;
  } catch {
    throw new SmartstoreApiError({
      stage: 'ORDER',
      httpStatus,
      code: 'RESPONSE_INVALID',
    });
  }
}

/**
 * 주문 API 호출. session이 있으면 토큰을 재사용한다.
 * - 401: 토큰 재발급 1회 후 해당 요청만 1회 재시도
 * - 429: 최대 2회 추가 재시도(짧은 백오프 / Retry-After)
 */
export async function smartstoreAuthorizedRequest<T>(input: {
  credentials: SmartstoreCredentials;
  method: string;
  pathWithQuery: string;
  body?: string;
  contentType?: string;
  session?: SmartstoreFetchSession;
}): Promise<T> {
  const session = input.session ?? createSmartstoreFetchSession({ credentials: input.credentials });
  const url = `${SMARTSTORE_API_ORIGIN}${input.pathWithQuery}`;

  let accessToken = await ensureSmartstoreSessionToken(session);
  let authRetried = false;
  let rateLimitAttempt = 0;

  for (;;) {
    const response = await invokeSmartstoreOrderHttp({
      method: input.method,
      url,
      accessToken,
      body: input.body,
      contentType: input.contentType,
    });

    if (response.httpStatus >= 200 && response.httpStatus < 300) {
      return parseOrderSuccessBody<T>(response.httpStatus, response.bodyText);
    }

    const parsed = parseSmartstoreError(response.bodyText);

    if (response.httpStatus === 401 && !authRetried) {
      authRetried = true;
      session.accessToken = null;
      session.authRefreshCount += 1;
      accessToken = await ensureSmartstoreSessionToken(session);
      continue;
    }

    if (response.httpStatus === 429 && rateLimitAttempt < SMARTSTORE_RATE_LIMIT_MAX_RETRIES) {
      const backoffMs = computeRateLimitBackoffMs({
        attemptIndex: rateLimitAttempt,
        retryAfterHeader: readRetryAfterHeader(response.responseHeaders),
      });
      rateLimitAttempt += 1;
      session.rateLimitRetryCount += 1;
      await session.sleep(backoffMs);
      continue;
    }

    throw new SmartstoreApiError({
      stage: 'ORDER',
      httpStatus: response.httpStatus,
      code: parsed.code,
      rawMessage: parsed.message,
    });
  }
}

function formatKstIsoWithMillis(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  const ss = String(kst.getUTCSeconds()).padStart(2, '0');
  const ms = String(kst.getUTCMilliseconds()).padStart(3, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}.${ms}+09:00`;
}

/** 발송처리 dispatchDate 등 — ISO 8601, 밀리초 3자리, +09:00 명시. */
export function formatSmartstoreApiDateTime(date: Date): string {
  return formatKstIsoWithMillis(date);
}

export type SmartstoreLastChangedStatus = {
  productOrderId?: string;
  orderId?: string;
  lastChangedType?: string;
  productOrderStatus?: string;
  lastChangedDate?: string;
  paymentDate?: string;
};

export type SmartstoreMoreCursor = {
  moreFrom?: string;
  moreSequence?: string;
};

type SmartstoreLastChangedResponse = {
  data?: {
    lastChangeStatuses?: SmartstoreLastChangedStatus[];
    more?: SmartstoreMoreCursor;
  };
};

export type SmartstoreProductOrderDetail = {
  order?: {
    orderId?: string;
    orderDate?: string;
    paymentDate?: string;
    ordererName?: string;
    ordererTel?: string;
    /** 결제 수단 (예: 신용카드, 무통장입금 등). */
    paymentMeans?: string;
  };
  productOrder?: {
    productOrderId?: string;
    productName?: string;
    productOption?: string;
    /** 레거시 수량(호환용 폴백). 처리 수량은 remain → quantity → initial 순으로 판단. */
    quantity?: number;
    /** 주문 시점 수량(클레임 이후에도 불변). */
    initialQuantity?: number;
    /** API 호출 시점 잔여 수량(부분/전체 클레임 반영). */
    remainQuantity?: number;
    productOrderStatus?: string;
    /** 발주확인 상태 (NOT_YET / OK). 상세 조회로만 확인 가능. */
    placeOrderStatus?: string;
    placeOrderDate?: string;
    /** 클레임(취소·반품·교환) 상태·유형. */
    claimStatus?: string;
    claimType?: string;
    /** 진행 중 클레임 요청 수량. */
    currentClaim?: {
      cancel?: { requestQuantity?: number };
      return?: { requestQuantity?: number };
      exchange?: { requestQuantity?: number };
    };
    /** 완료된 클레임 내역(판정 참고용, 신규 처리 기능은 만들지 않음). */
    completedClaims?: Array<{ claimType?: string; claimStatus?: string; claimQuantity?: number }>;
    /** 판매자 상품코드. */
    sellerProductCode?: string;
    /**
     * 결제 금액. 네이버 수량 클레임 확대 이후 initial-/remain- 필드로 세분화됨.
     * 폐기 예정인 totalPaymentAmount 대비 remain(호출 시점) → initial(주문 시점) 순으로 사용.
     */
    totalPaymentAmount?: number;
    initialPaymentAmount?: number;
    remainPaymentAmount?: number;
    shippingMemo?: string;
    shippingAddress?: {
      name?: string;
      tel1?: string;
      tel2?: string;
      zipCode?: string;
      baseAddress?: string;
      detailedAddress?: string;
    };
  };
  /** 배송 정보(발송 후 상태·송장 확인용). */
  delivery?: {
    deliveryStatus?: string;
    deliveryMethod?: string;
    deliveryCompany?: string;
    deliveryCompanyCode?: string;
    trackingNumber?: string;
    sendDate?: string;
  };
};

/** 네이버 커머스API 변경 주문 조회는 한 요청당 최대 24시간 범위만 허용된다. */
const SMARTSTORE_MAX_WINDOW_MS = 24 * 60 * 60 * 1000;
/** 데이터 누락 방지를 위해 조회 종료 시각을 현재보다 5초 이전으로 둔다(네이버 권장). */
const SMARTSTORE_FETCH_LAG_MS = 5 * 1000;
/** 상세 조회(product-orders/query)는 한 번에 최대 300건. */
const SMARTSTORE_DETAIL_BATCH_SIZE = 300;
/** 무한 페이지네이션 방지용 구간별 최대 페이지 수(안전장치). */
const SMARTSTORE_MAX_PAGES_PER_WINDOW = 1000;

const MIN_FETCH_DAYS = 1;
const MAX_FETCH_DAYS = 30;
const DEFAULT_FETCH_DAYS = 7;

export type SmartstoreQueryWindow = {
  fromIso: string;
  toIso: string;
};

/**
 * 요청한 days 범위를 24시간 이하 구간으로 나눈다.
 * - 각 구간은 최대 24시간
 * - 마지막 구간의 종료 시각은 전체 종료 시각(now - 5초)을 넘지 않는다
 */
export function buildSmartstoreQueryWindows(input: {
  now: Date;
  days: number;
}): SmartstoreQueryWindow[] {
  const days = Math.min(
    MAX_FETCH_DAYS,
    Math.max(MIN_FETCH_DAYS, Math.floor(input.days) || DEFAULT_FETCH_DAYS),
  );
  const overallToMs = input.now.getTime() - SMARTSTORE_FETCH_LAG_MS;
  const overallFromMs = input.now.getTime() - days * 24 * 60 * 60 * 1000;

  return splitWindows(overallFromMs, overallToMs);
}

/**
 * 명시적인 시작·종료 시각(epoch ms)을 24시간 이하 구간으로 나눈다.
 * 날짜 직접 선택(과거 특정 기간 조회)에서 사용하며, days 기반과 동일한 24시간 분할 로직을 재사용한다.
 * 종료 시각은 현재 시각(now)을 넘지 않도록 제한한다. 프리셋/직접 선택 화면에서 표시한
 * "현재까지" 범위를 그대로 사용하며, days 기반 롤링 조회의 5초 지연과 명확히 분리한다.
 */
export function buildSmartstoreQueryWindowsFromRange(input: {
  fromMs: number;
  toMs: number;
  now: Date;
}): SmartstoreQueryWindow[] {
  const overallToMs = Math.min(input.toMs, input.now.getTime());
  const overallFromMs = input.fromMs;
  return splitWindows(overallFromMs, overallToMs);
}

function splitWindows(overallFromMs: number, overallToMs: number): SmartstoreQueryWindow[] {
  const windows: SmartstoreQueryWindow[] = [];
  let startMs = overallFromMs;
  while (startMs < overallToMs) {
    const endMs = Math.min(startMs + SMARTSTORE_MAX_WINDOW_MS, overallToMs);
    windows.push({
      fromIso: formatKstIsoWithMillis(new Date(startMs)),
      toIso: formatKstIsoWithMillis(new Date(endMs)),
    });
    startMs = endMs;
  }

  return windows;
}

/** 크리덴셜에 묶이지 않은 스마트스토어 API 호출자(테스트 주입용). */
export type SmartstoreApiRequestFn = <T>(input: {
  method: string;
  pathWithQuery: string;
  body?: string;
  contentType?: string;
}) => Promise<T>;

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return '알 수 없는 오류';
}

export type SmartstoreCollectionFailureMeta = {
  windowCount: number;
  failedWindowIndex?: number;
  failedPage?: number;
};

const SMARTSTORE_COLLECTION_META = Symbol.for('excload.smartstore.collectionMeta');

function collectionError(
  message: string,
  cause: unknown,
  meta?: SmartstoreCollectionFailureMeta,
): Error {
  const error = new Error(message, { cause });
  if (meta) {
    Object.defineProperty(error, SMARTSTORE_COLLECTION_META, {
      value: meta,
      enumerable: false,
      configurable: true,
    });
  }
  return error;
}

export function getSmartstoreCollectionFailureMeta(
  error: unknown,
): SmartstoreCollectionFailureMeta | null {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    if (current instanceof Error) {
      const meta = (current as Error & { [SMARTSTORE_COLLECTION_META]?: SmartstoreCollectionFailureMeta })[
        SMARTSTORE_COLLECTION_META
      ];
      if (meta) return meta;
      current = current.cause;
      continue;
    }
    break;
  }
  return null;
}

function findSmartstoreApiError(error: unknown): SmartstoreApiError | null {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    if (current instanceof SmartstoreApiError) return current;
    if (current instanceof Error) {
      current = current.cause;
      continue;
    }
    break;
  }
  return null;
}

function logFetchSessionFailure(input: {
  session: SmartstoreFetchSession;
  error: unknown;
}): void {
  const apiError = findSmartstoreApiError(input.error);
  const meta = getSmartstoreCollectionFailureMeta(input.error);
  logSmartstoreFetchDiagnostic({
    stage: apiError?.stage ?? 'ORDER',
    httpStatus: apiError?.httpStatus,
    code: apiError?.code,
    windowCount: meta?.windowCount,
    failedWindowIndex: meta?.failedWindowIndex,
    failedPage: meta?.failedPage,
    tokenIssueCount: input.session.tokenIssueCount,
    authRefreshCount: input.session.authRefreshCount,
    rateLimitRetryCount: input.session.rateLimitRetryCount,
    durationMs: Date.now() - input.session.startedAtMs,
  });
}

/**
 * 변경 주문 조회 → 상세 조회까지 수행하는 핵심 수집 로직.
 * 크리덴셜 대신 request 함수를 주입받아 단위 테스트가 가능하도록 분리했다.
 */
export async function collectSmartstoreProductOrders(input: {
  request: SmartstoreApiRequestFn;
  days?: number;
  /** 날짜 직접 선택 시 명시적인 조회 범위(epoch ms). 지정되면 days 대신 사용한다. */
  range?: { fromMs: number; toMs: number };
  now?: Date;
}): Promise<SmartstoreProductOrderDetail[]> {
  const now = input.now ?? new Date();
  const windows = input.range
    ? buildSmartstoreQueryWindowsFromRange({ fromMs: input.range.fromMs, toMs: input.range.toMs, now })
    : buildSmartstoreQueryWindows({ now, days: input.days ?? DEFAULT_FETCH_DAYS });

  const productOrderIdSet = new Set<string>();

  for (let windowIndex = 0; windowIndex < windows.length; windowIndex += 1) {
    const win = windows[windowIndex];
    const windowLabel = `구간 ${windowIndex + 1}/${windows.length}`;

    let lastChangedFrom = win.fromIso;
    let moreSequence: string | undefined;
    let previousCursorKey: string | null = null;

    for (let page = 1; ; page += 1) {
      if (page > SMARTSTORE_MAX_PAGES_PER_WINDOW) {
        throw new Error(
          `스마트스토어 주문 변경내역이 너무 많은 페이지로 이어져 조회를 중단했습니다. (${windowLabel})`,
        );
      }

      const params = new URLSearchParams({
        lastChangedFrom,
        lastChangedTo: win.toIso,
      });
      if (moreSequence) {
        params.set('moreSequence', moreSequence);
      }

      let response: SmartstoreLastChangedResponse;
      try {
        response = await input.request<SmartstoreLastChangedResponse>({
          method: 'GET',
          pathWithQuery: `/external/v1/pay-order/seller/product-orders/last-changed-statuses?${params.toString()}`,
        });
      } catch (error) {
        throw collectionError(
          `스마트스토어 주문 변경내역 조회에 실패했습니다. (${windowLabel}, 페이지 ${page}) 원인: ${toSafeErrorMessage(error)}`,
          error,
          {
            windowCount: windows.length,
            failedWindowIndex: windowIndex,
            failedPage: page,
          },
        );
      }

      for (const item of response.data?.lastChangeStatuses ?? []) {
        const id = item.productOrderId?.trim();
        if (id) productOrderIdSet.add(id);
      }

      const more = response.data?.more;
      if (!more?.moreFrom) break;

      const nextMoreSequence = more.moreSequence;
      const cursorKey = `${more.moreFrom}|${nextMoreSequence ?? ''}`;
      // 커서가 직전과 동일하거나(진행 없음) 현재 요청과 동일하면 중단해 무한 루프를 막는다.
      if (
        cursorKey === previousCursorKey ||
        (more.moreFrom === lastChangedFrom && (nextMoreSequence ?? '') === (moreSequence ?? ''))
      ) {
        break;
      }

      previousCursorKey = cursorKey;
      lastChangedFrom = more.moreFrom;
      moreSequence = nextMoreSequence;
    }
  }

  const productOrderIds = [...productOrderIdSet];
  if (!productOrderIds.length) {
    return [];
  }

  const details: SmartstoreProductOrderDetail[] = [];
  const batchCount = Math.ceil(productOrderIds.length / SMARTSTORE_DETAIL_BATCH_SIZE);

  for (let index = 0, batch = 1; index < productOrderIds.length; index += SMARTSTORE_DETAIL_BATCH_SIZE, batch += 1) {
    const batchIds = productOrderIds.slice(index, index + SMARTSTORE_DETAIL_BATCH_SIZE);

    let detailResponse: { data?: SmartstoreProductOrderDetail[] };
    try {
      detailResponse = await input.request<{ data?: SmartstoreProductOrderDetail[] }>({
        method: 'POST',
        pathWithQuery: '/external/v1/pay-order/seller/product-orders/query',
        // 수량 클레임(부분 취소·반품·교환) 확대 대응: initial-/remain- 필드를 받기 위해 필수.
        body: JSON.stringify({ productOrderIds: batchIds, quantityClaimCompatibility: true }),
        contentType: 'application/json',
      });
    } catch (error) {
      throw collectionError(
        `스마트스토어 주문 상세 조회에 실패했습니다. (상세 배치 ${batch}/${batchCount}) 원인: ${toSafeErrorMessage(error)}`,
        error,
        { windowCount: windows.length },
      );
    }

    details.push(...(detailResponse.data ?? []));
  }

  return details;
}

export async function fetchSmartstoreProductOrders(input: {
  credentials: SmartstoreCredentials;
  days?: number;
  /** 날짜 직접 선택 시 명시적인 조회 범위(epoch ms). 지정되면 days 대신 사용한다. */
  range?: { fromMs: number; toMs: number };
  /** 테스트용: 세션 sleep/시작시각 주입 */
  session?: SmartstoreFetchSession;
}): Promise<SmartstoreProductOrderDetail[]> {
  const session =
    input.session ?? createSmartstoreFetchSession({ credentials: input.credentials });
  const request: SmartstoreApiRequestFn = <T,>(req: {
    method: string;
    pathWithQuery: string;
    body?: string;
    contentType?: string;
  }) =>
    smartstoreAuthorizedRequest<T>({
      credentials: input.credentials,
      session,
      ...req,
    });

  try {
    return await collectSmartstoreProductOrders({
      request,
      days: input.days,
      range: input.range,
    });
  } catch (error) {
    logFetchSessionFailure({ session, error });
    throw error;
  }
}

/**
 * 상품주문번호 목록으로 상세 조회 (최대 300건/배치).
 * 전송 직후 상태 확인(B)용 — 변경주문 목록 없이 단건·소량 조회.
 */
export async function fetchSmartstoreProductOrdersByIds(input: {
  credentials: SmartstoreCredentials;
  productOrderIds: ReadonlyArray<string>;
  session?: SmartstoreFetchSession;
}): Promise<SmartstoreProductOrderDetail[]> {
  const ids = [
    ...new Set(
      input.productOrderIds
        .map((id) => String(id ?? '').trim())
        .filter(Boolean),
    ),
  ];
  if (!ids.length) return [];

  const session =
    input.session ?? createSmartstoreFetchSession({ credentials: input.credentials });
  const details: SmartstoreProductOrderDetail[] = [];
  const batchCount = Math.ceil(ids.length / SMARTSTORE_DETAIL_BATCH_SIZE);

  for (let index = 0, batch = 1; index < ids.length; index += SMARTSTORE_DETAIL_BATCH_SIZE, batch += 1) {
    const batchIds = ids.slice(index, index + SMARTSTORE_DETAIL_BATCH_SIZE);
    try {
      const detailResponse = await smartstoreAuthorizedRequest<{ data?: SmartstoreProductOrderDetail[] }>({
        credentials: input.credentials,
        session,
        method: 'POST',
        pathWithQuery: '/external/v1/pay-order/seller/product-orders/query',
        body: JSON.stringify({ productOrderIds: batchIds, quantityClaimCompatibility: true }),
        contentType: 'application/json',
      });
      details.push(...(detailResponse.data ?? []));
    } catch (error) {
      logFetchSessionFailure({ session, error });
      throw collectionError(
        `스마트스토어 상품주문 상세 조회에 실패했습니다. (배치 ${batch}/${batchCount}) 원인: ${toSafeErrorMessage(error)}`,
        error,
      );
    }
  }

  return details;
}

/** 발주확인 요청당 최대 상품주문번호 수(네이버 공식 한도). */
export const SMARTSTORE_CONFIRM_MAX_BATCH = 30;
export const SMARTSTORE_CONFIRM_PATH = '/external/v1/pay-order/seller/product-orders/confirm';

/**
 * 발주확인 POST. HTTP 상태와 bodyText를 그대로 반환한다(부분 성공 파싱용).
 * - 요청당 최대 30건(호출 측에서 chunk 보장)
 * - 자동 재시도 없음
 * - 고정 IP 프록시(`/internal/integration/invoke`)만 사용
 * - 시크릿·원문 로깅 없음
 */
export async function postSmartstoreProductOrdersConfirm(input: {
  credentials: SmartstoreCredentials;
  productOrderIds: ReadonlyArray<string>;
}): Promise<{ httpStatus: number; bodyText: string }> {
  const productOrderIds = [
    ...new Set(
      input.productOrderIds
        .map((id) => String(id ?? '').trim())
        .filter(Boolean),
    ),
  ];
  if (productOrderIds.length === 0) {
    throw new SmartstoreApiError({
      stage: 'ORDER',
      code: 'CONFIRM_EMPTY',
      rawMessage: 'productOrderIds required',
    });
  }
  if (productOrderIds.length > SMARTSTORE_CONFIRM_MAX_BATCH) {
    throw new SmartstoreApiError({
      stage: 'ORDER',
      code: 'CONFIRM_BATCH_TOO_LARGE',
      rawMessage: `max ${SMARTSTORE_CONFIRM_MAX_BATCH}`,
    });
  }

  if (!isIntegrationProxyConfigured()) {
    throw new Error('스마트스토어 API는 고정 IP 프록시 설정이 필요합니다.');
  }
  try {
    assertIntegrationProxyConfigReady();
  } catch (cause) {
    throw new SmartstoreApiError({
      stage: 'ORDER',
      code: 'CLIENT_CONFIGURATION',
      cause,
    });
  }

  const { accessToken } = await requestSmartstoreAccessToken(input.credentials);
  const url = `${SMARTSTORE_API_ORIGIN}${SMARTSTORE_CONFIRM_PATH}`;

  try {
    return await invokeIntegrationHttp({
      method: 'POST',
      url,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productOrderIds }),
    });
  } catch (cause) {
    throw new SmartstoreApiError({ stage: 'ORDER', networkFailure: true, cause });
  }
}

/** 발송처리 요청당 최대 상품주문번호 수(네이버 공식 한도). */
export const SMARTSTORE_DISPATCH_MAX_BATCH = 30;
export const SMARTSTORE_DISPATCH_PATH = '/external/v1/pay-order/seller/product-orders/dispatch';

export type SmartstoreDispatchProductOrderRequest = {
  productOrderId: string;
  deliveryMethod: 'DELIVERY';
  deliveryCompanyCode: string;
  trackingNumber: string;
  dispatchDate: string;
};

/**
 * 발송처리 POST. HTTP 상태와 bodyText를 그대로 반환한다(부분 성공 파싱용).
 * - 요청당 최대 30건(호출 측에서 chunk 보장)
 * - 자동 재시도 없음
 * - 고정 IP 프록시만 사용
 */
export async function postSmartstoreProductOrdersDispatch(input: {
  credentials: SmartstoreCredentials;
  dispatchProductOrders: ReadonlyArray<SmartstoreDispatchProductOrderRequest>;
}): Promise<{ httpStatus: number; bodyText: string }> {
  const dispatchProductOrders = [...input.dispatchProductOrders];
  if (dispatchProductOrders.length === 0) {
    throw new SmartstoreApiError({
      stage: 'ORDER',
      code: 'DISPATCH_EMPTY',
      rawMessage: 'dispatchProductOrders required',
    });
  }
  if (dispatchProductOrders.length > SMARTSTORE_DISPATCH_MAX_BATCH) {
    throw new SmartstoreApiError({
      stage: 'ORDER',
      code: 'DISPATCH_BATCH_TOO_LARGE',
      rawMessage: `max ${SMARTSTORE_DISPATCH_MAX_BATCH}`,
    });
  }

  if (!isIntegrationProxyConfigured()) {
    throw new Error('스마트스토어 API는 고정 IP 프록시 설정이 필요합니다.');
  }
  try {
    assertIntegrationProxyConfigReady();
  } catch (cause) {
    throw new SmartstoreApiError({
      stage: 'ORDER',
      code: 'CLIENT_CONFIGURATION',
      cause,
    });
  }

  const { accessToken } = await requestSmartstoreAccessToken(input.credentials);
  const url = `${SMARTSTORE_API_ORIGIN}${SMARTSTORE_DISPATCH_PATH}`;

  try {
    return await invokeIntegrationHttp({
      method: 'POST',
      url,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dispatchProductOrders }),
    });
  } catch (cause) {
    throw new SmartstoreApiError({ stage: 'ORDER', networkFailure: true, cause });
  }
}

export function toUserFacingSmartstoreErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '스마트스토어 연동 처리 중 오류가 발생했습니다.';
}
