import { assertIntegrationProxyConfigReady, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { invokeIntegrationHttp } from '@/app/lib/integration-proxy/http-transport';
import {
  extractElevenApiError,
  extractFirstXmlTagValue,
  extractXmlBlocks,
  parseXmlRecord,
} from '@/app/lib/eleven/xml-parser';

export const ELEVEN_API_ORIGIN = 'https://api.11st.co.kr';
export const ELEVEN_DEFAULT_VENDOR_ID = 'default';
/** 11번가 기간별 주문 목록 API 1회 요청 최대 기간(일). */
export const ELEVEN_MAX_RANGE_DAYS = 7;

export type ElevenCredentials = {
  openapikey: string;
};

export const ELEVEN_ORDER_XML_FIELDS = [
  'ordNo',
  'ordPrdSeq',
  'ordStat',
  'ordStatNm',
  'ordPrdNm',
  'slctPrdOptNm',
  'ordOptWonStl',
  'ordQty',
  'rcvrNm',
  'rcvrTlphn',
  'rcvrPrtblNo',
  'rcvrMailNo',
  'rcvrBaseAddr',
  'rcvrDtlsAddr',
  'ordDlvReqCont',
  'dlvMsg',
  'ordNm',
  'ordTlphnNo',
  'ordPrtblTel',
  'ordDt',
  'ordStlEndDt',
  'ordPayAmt',
  'memID',
] as const;

export type ElevenOrderRecord = Record<(typeof ELEVEN_ORDER_XML_FIELDS)[number], string>;

/** 결제완료 목록 + 배송준비중 목록 (공식 가이드 path). */
export type ElevenOrderStatusEndpoint = 'complete' | 'packaging';

export const ORDER_STATUS_ENDPOINTS: readonly ElevenOrderStatusEndpoint[] = [
  'complete',
  'packaging',
] as const;

export class ElevenRequestError extends Error {
  readonly endpoint: ElevenOrderStatusEndpoint;
  readonly apiCode?: string;

  constructor(input: {
    endpoint: ElevenOrderStatusEndpoint;
    message: string;
    apiCode?: string;
  }) {
    super(formatElevenEndpointErrorMessage(input.endpoint, input.message));
    this.name = 'ElevenRequestError';
    this.endpoint = input.endpoint;
    this.apiCode = input.apiCode;
  }
}

export function formatElevenEndpointErrorMessage(
  endpoint: ElevenOrderStatusEndpoint,
  message: string,
): string {
  const trimmed = message.trim();
  if (/\(endpoint:(complete|packaging)\)\s*$/.test(trimmed)) return trimmed;
  return `${trimmed} (endpoint:${endpoint})`;
}

export function extractElevenErrorEndpoint(message: string): ElevenOrderStatusEndpoint | null {
  const match = /\(endpoint:(complete|packaging)\)\s*$/.exec(message.trim());
  return (match?.[1] as ElevenOrderStatusEndpoint | undefined) ?? null;
}

export function formatElevenApiDateTime(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}`;
}

export function buildElevenOrderPath(
  endpoint: ElevenOrderStatusEndpoint,
  start: Date,
  end: Date,
): string {
  return `/rest/ordservices/${endpoint}/${formatElevenApiDateTime(start)}/${formatElevenApiDateTime(end)}`;
}

/**
 * 기간을 최대 7일 구간으로 분할한다.
 * 인접 구간의 시작=이전 끝(동일 시각)이어도 주문 키로 중복 제거한다.
 */
export function buildElevenDateWindows(
  start: Date,
  end: Date,
): Array<{ start: Date; end: Date }> {
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (!(startMs < endMs)) {
    return [{ start: new Date(startMs), end: new Date(endMs) }];
  }

  const maxMs = ELEVEN_MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;
  const windows: Array<{ start: Date; end: Date }> = [];
  let cursor = startMs;

  while (cursor < endMs) {
    const windowEnd = Math.min(cursor + maxMs, endMs);
    windows.push({ start: new Date(cursor), end: new Date(windowEnd) });
    cursor = windowEnd;
  }

  return windows;
}

function applyProductNameFallback(record: ElevenOrderRecord, block: string): ElevenOrderRecord {
  const prdNm = extractFirstXmlTagValue(block, 'prdNm');
  if (prdNm) {
    return { ...record, ordPrdNm: prdNm };
  }
  return record;
}

export function parseElevenOrdersXml(xml: string): ElevenOrderRecord[] {
  const apiError = extractElevenApiError(xml);
  if (apiError) {
    throw new Error(apiError.displayMessage);
  }

  const orderBlocks = [
    ...extractXmlBlocks(xml, 'Order'),
    ...extractXmlBlocks(xml, 'order'),
  ];

  const uniqueBlocks = [...new Set(orderBlocks)];
  if (!uniqueBlocks.length) {
    return [];
  }

  return uniqueBlocks.map((block) => {
    const record = parseXmlRecord(block, ELEVEN_ORDER_XML_FIELDS) as ElevenOrderRecord;
    return applyProductNameFallback(record, block);
  });
}

function assertElevenHttpSuccess(
  httpStatus: number,
  bodyText: string,
  endpoint: ElevenOrderStatusEndpoint,
): void {
  const apiError = extractElevenApiError(bodyText);
  if (apiError) {
    throw new ElevenRequestError({
      endpoint,
      message: apiError.displayMessage,
      apiCode: apiError.code,
    });
  }

  if (httpStatus >= 200 && httpStatus < 300) {
    return;
  }

  if (httpStatus === 401 || httpStatus === 403) {
    throw new ElevenRequestError({
      endpoint,
      message: `11번가 OPEN API KEY 인증에 실패했습니다. 키와 IP 등록 상태를 확인해 주세요. (HTTP ${httpStatus})`,
      apiCode: String(httpStatus),
    });
  }

  throw new ElevenRequestError({
    endpoint,
    message: `11번가 API 호출에 실패했습니다. (HTTP ${httpStatus})`,
    apiCode: String(httpStatus),
  });
}

export async function elevenApiRequest(input: {
  credentials: ElevenCredentials;
  method: string;
  pathWithQuery: string;
  body?: string;
  contentType?: string;
  endpoint: ElevenOrderStatusEndpoint;
}): Promise<string> {
  if (!isIntegrationProxyConfigured()) {
    throw new Error('11번가 API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.');
  }

  assertIntegrationProxyConfigReady();

  const url = `${ELEVEN_API_ORIGIN}${input.pathWithQuery}`;
  const headers: Record<string, string> = {
    openapikey: input.credentials.openapikey.trim(),
    Accept: 'application/xml, text/xml, */*',
  };

  if (input.body != null) {
    headers['Content-Type'] = input.contentType ?? 'text/xml; charset=utf-8';
  }

  const { httpStatus, bodyText } = await invokeIntegrationHttp({
    method: input.method,
    url,
    headers,
    body: input.body ?? null,
  });

  assertElevenHttpSuccess(httpStatus, bodyText, input.endpoint);
  return bodyText;
}

export async function fetchElevenOrdersByEndpoint(input: {
  credentials: ElevenCredentials;
  endpoint: ElevenOrderStatusEndpoint;
  start: Date;
  end: Date;
}): Promise<ElevenOrderRecord[]> {
  try {
    const bodyText = await elevenApiRequest({
      credentials: input.credentials,
      method: 'GET',
      pathWithQuery: buildElevenOrderPath(input.endpoint, input.start, input.end),
      endpoint: input.endpoint,
    });

    return parseElevenOrdersXml(bodyText);
  } catch (error) {
    if (error instanceof ElevenRequestError) throw error;
    const message = error instanceof Error ? error.message : String(error ?? '');
    throw new ElevenRequestError({
      endpoint: input.endpoint,
      message,
    });
  }
}

/**
 * 구간 경계 중복 제거용 키.
 * ordPrdSeq가 있으면 공식 상품주문 단위를 쓰고, 없으면 동일 주문의 다른 상품을
 * 한 줄로 합치지 않도록 상품·옵션·수량·결제일시 지문을 사용한다.
 */
export function buildElevenOrderDedupeKey(
  order: Pick<
    ElevenOrderRecord,
    'ordNo' | 'ordPrdSeq' | 'ordPrdNm' | 'slctPrdOptNm' | 'ordQty' | 'ordStlEndDt' | 'ordOptWonStl'
  >,
  fallbackIndex: number,
): string {
  if (!order.ordNo) return `__empty__:${fallbackIndex}`;
  if (order.ordPrdSeq) return `${order.ordNo}|${order.ordPrdSeq}`;
  return [
    order.ordNo,
    order.ordPrdNm,
    order.slctPrdOptNm,
    order.ordQty,
    order.ordStlEndDt,
    order.ordOptWonStl,
  ].join('|');
}

export function dedupeElevenOrders(orders: ElevenOrderRecord[]): ElevenOrderRecord[] {
  const seen = new Set<string>();
  const result: ElevenOrderRecord[] = [];

  for (let i = 0; i < orders.length; i += 1) {
    const order = orders[i]!;
    const key = buildElevenOrderDedupeKey(order, i);
    if (!order.ordNo || seen.has(key)) continue;
    seen.add(key);
    result.push(order);
  }

  return result;
}

export async function fetchElevenOrders(input: {
  credentials: ElevenCredentials;
  days?: number;
}): Promise<ElevenOrderRecord[]> {
  const days = input.days ?? 7;
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);

  const windows = buildElevenDateWindows(start, now);
  const collected: ElevenOrderRecord[] = [];

  // 순차 호출: 실패 시 endpoint를 보존한다 (병렬이면 어느 쪽이 실패했는지 섞일 수 있음).
  for (const endpoint of ORDER_STATUS_ENDPOINTS) {
    for (const window of windows) {
      const batch = await fetchElevenOrdersByEndpoint({
        credentials: input.credentials,
        endpoint,
        start: window.start,
        end: window.end,
      });
      collected.push(...batch);
    }
  }

  return dedupeElevenOrders(collected);
}

/**
 * 연결 테스트는 주문조회와 동일하게 고정 IP 프록시 + complete/packaging 읽기 조회를 사용한다.
 */
export async function testElevenConnection(credentials: ElevenCredentials): Promise<{ ok: true }> {
  await fetchElevenOrders({ credentials, days: 1 });
  return { ok: true };
}

export function toUserFacingElevenErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '11번가 연동 처리 중 오류가 발생했습니다.';
}

/** 사용자 메시지 앞의 `[코드]`를 분리한다. endpoint 접미사는 유지한다. */
export function splitElevenErrorCode(message: string): { code?: string; message: string } {
  const match = /^\[([^\]]+)\]\s*(.*)$/.exec(message.trim());
  if (!match) return { message };
  // endpoint 라벨이 앞에 온 경우는 API 코드가 아님
  if (match[1] === 'complete' || match[1] === 'packaging') {
    return { message };
  }
  return { code: match[1], message: match[2] || message };
}
