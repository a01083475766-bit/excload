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

export async function smartstoreAuthorizedRequest<T>(input: {
  credentials: SmartstoreCredentials;
  method: string;
  pathWithQuery: string;
  body?: string;
  contentType?: string;
}): Promise<T> {
  const { accessToken } = await requestSmartstoreAccessToken(input.credentials);
  const url = `${SMARTSTORE_API_ORIGIN}${input.pathWithQuery}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (input.body != null) {
    headers['Content-Type'] = input.contentType ?? 'application/json';
  }

  let response: { httpStatus: number; bodyText: string };
  try {
    response = await invokeIntegrationHttp({
      method: input.method,
      url,
      headers,
      body: input.body ?? null,
    });
  } catch (cause) {
    throw new SmartstoreApiError({ stage: 'ORDER', networkFailure: true, cause });
  }

  const { httpStatus, bodyText } = response;

  if (httpStatus < 200 || httpStatus >= 300) {
    const parsed = parseSmartstoreError(bodyText);
    throw new SmartstoreApiError({
      stage: 'ORDER',
      httpStatus,
      code: parsed.code,
      rawMessage: parsed.message,
    });
  }

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

function collectionError(message: string, cause: unknown): Error {
  return new Error(message, { cause });
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
}): Promise<SmartstoreProductOrderDetail[]> {
  const request: SmartstoreApiRequestFn = <T,>(req: {
    method: string;
    pathWithQuery: string;
    body?: string;
    contentType?: string;
  }) => smartstoreAuthorizedRequest<T>({ credentials: input.credentials, ...req });

  return collectSmartstoreProductOrders({ request, days: input.days, range: input.range });
}

/**
 * 상품주문번호 목록으로 상세 조회 (최대 300건/배치).
 * 전송 직후 상태 확인(B)용 — 변경주문 목록 없이 단건·소량 조회.
 */
export async function fetchSmartstoreProductOrdersByIds(input: {
  credentials: SmartstoreCredentials;
  productOrderIds: ReadonlyArray<string>;
}): Promise<SmartstoreProductOrderDetail[]> {
  const ids = [
    ...new Set(
      input.productOrderIds
        .map((id) => String(id ?? '').trim())
        .filter(Boolean),
    ),
  ];
  if (!ids.length) return [];

  const details: SmartstoreProductOrderDetail[] = [];
  const batchCount = Math.ceil(ids.length / SMARTSTORE_DETAIL_BATCH_SIZE);

  for (let index = 0, batch = 1; index < ids.length; index += SMARTSTORE_DETAIL_BATCH_SIZE, batch += 1) {
    const batchIds = ids.slice(index, index + SMARTSTORE_DETAIL_BATCH_SIZE);
    try {
      const detailResponse = await smartstoreAuthorizedRequest<{ data?: SmartstoreProductOrderDetail[] }>({
        credentials: input.credentials,
        method: 'POST',
        pathWithQuery: '/external/v1/pay-order/seller/product-orders/query',
        body: JSON.stringify({ productOrderIds: batchIds, quantityClaimCompatibility: true }),
        contentType: 'application/json',
      });
      details.push(...(detailResponse.data ?? []));
    } catch (error) {
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
