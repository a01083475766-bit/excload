import { assertIntegrationProxyConfigReady, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { invokeIntegrationHttp } from '@/app/lib/integration-proxy/http-transport';
import {
  extractElevenApiError,
  extractFirstXmlTagValue,
  extractXmlBlocks,
  parseXmlRecord,
} from '@/app/lib/eleven/xml-parser';
import { sanitizePublicIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';

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
  /** 발주확인·송장전송 필수 (가이드 reqpackaging/reqdelivery) */
  'dlvNo',
  'addPrdYn',
  'addPrdNo',
  /** 송장 반영 확인용(목록 응답에 있을 때) */
  'invcNo',
  'dlvEtprsCd',
  'dlvMthdCd',
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
    super(formatElevenEndpointErrorMessage(input.endpoint, redactElevenSecrets(input.message)));
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

/** path 세그먼트 — 슬래시 혼입 방지. null 리터럴은 가이드대로 유지. */
export function encodeElevenPathSegment(value: string): string {
  const trimmed = value.trim();
  if (trimmed === 'null') return 'null';
  return encodeURIComponent(trimmed);
}

/**
 * 발주확인 처리 (가이드).
 * GET /rest/ordservices/reqpackaging/[ordNo]/[ordPrdSeq]/[addPrdYn]/[addPrdNo]/[dlvNo]
 */
export function buildElevenReqPackagingPath(input: {
  ordNo: string;
  ordPrdSeq: string;
  addPrdYn: 'Y' | 'N';
  addPrdNo: string;
  dlvNo: string;
}): string {
  return [
    '/rest/ordservices/reqpackaging',
    encodeElevenPathSegment(input.ordNo),
    encodeElevenPathSegment(input.ordPrdSeq),
    encodeElevenPathSegment(input.addPrdYn),
    encodeElevenPathSegment(input.addPrdNo),
    encodeElevenPathSegment(input.dlvNo),
  ].join('/');
}

/**
 * 발송처리·송장등록 (가이드 — 부분발송 포함 형식).
 * GET /rest/ordservices/reqdelivery/[sendDt]/[dlvMthdCd]/[dlvEtprsCd]/[invcNo]/[dlvNo]/[partDlvYn]/[ordNo]/[ordPrdSeq]
 * sendDt: YYYYMMDDhhmm (KST)
 * dlvMthdCd: 01=택배
 */
export function buildElevenReqDeliveryPath(input: {
  sendDt: string;
  dlvMthdCd: string;
  dlvEtprsCd: string;
  invcNo: string;
  dlvNo: string;
  partDlvYn: 'Y' | 'N';
  ordNo: string;
  ordPrdSeq: string;
}): string {
  return [
    '/rest/ordservices/reqdelivery',
    encodeElevenPathSegment(input.sendDt),
    encodeElevenPathSegment(input.dlvMthdCd),
    encodeElevenPathSegment(input.dlvEtprsCd),
    encodeElevenPathSegment(input.invcNo),
    encodeElevenPathSegment(input.dlvNo),
    encodeElevenPathSegment(input.partDlvYn),
    encodeElevenPathSegment(input.ordNo),
    encodeElevenPathSegment(input.ordPrdSeq),
  ].join('/');
}

export function isElevenXmlSuccessCode(code: string | null | undefined): boolean {
  const c = String(code ?? '').trim();
  return c === '0' || c === '00';
}

/**
 * openapikey·URL query·헤더 표기 원문이 오류·로그에 남지 않게 한다.
 * 알려진 비밀값과 openapikey= 패턴을 모두 마스킹한다.
 */
export function redactElevenSecrets(
  text: string,
  secrets: Array<string | null | undefined> = [],
): string {
  let out = String(text ?? '');
  for (const secret of secrets) {
    const value = secret?.trim();
    if (!value || value.length < 2) continue;
    out = out.split(value).join('[보호됨]');
  }
  out = out
    .replace(/(["']?openapikey["']?\s*[:=]\s*["']?)([^"'&\s,;]+)(["']?)/gi, '$1[보호됨]$3')
    .replace(/([?&]openapikey=)([^&\s"#]*)/gi, '$1[보호됨]');
  return out;
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
      message: redactElevenSecrets(message, [input.credentials.openapikey]),
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

export type ElevenMutationResult = {
  ok: boolean;
  code: string;
  message: string;
  displayMessage: string;
  bodyText: string;
};

/**
 * reqpackaging / reqdelivery 응답 판정.
 * HTTP 상태는 통신 성공 여부만, API 성공은 공식 result_code 0|00만 인정.
 * 누락·빈 값·알 수 없는 코드·비XML은 성공 처리하지 않는다.
 */
export function evaluateElevenMutationHttpResponse(input: {
  httpStatus: number;
  bodyText: string;
  secrets?: Array<string | null | undefined>;
}): ElevenMutationResult {
  const secrets = input.secrets ?? [];
  const bodyText = String(input.bodyText ?? '');

  const toFailure = (code: string, message: string): ElevenMutationResult => {
    const safeMessage = redactElevenSecrets(message, secrets).trim();
    const display = safeMessage
      ? code && !safeMessage.startsWith('[')
        ? `[${code}] ${safeMessage}`
        : safeMessage
      : `11번가 API 오류 (코드: ${code || 'UNKNOWN'})`;
    return {
      ok: false,
      code,
      message: safeMessage,
      displayMessage: redactElevenSecrets(display, secrets),
      bodyText: redactElevenSecrets(bodyText, secrets),
    };
  };

  if (input.httpStatus < 200 || input.httpStatus >= 300) {
    return toFailure(
      String(input.httpStatus),
      `11번가 API 호출에 실패했습니다. (HTTP ${input.httpStatus})`,
    );
  }

  const trimmed = bodyText.trim();
  if (!trimmed.startsWith('<')) {
    return toFailure('INVALID_XML', '11번가 응답 XML을 해석하지 못했습니다.');
  }

  const apiError = extractElevenApiError(bodyText);
  if (apiError) {
    const text = apiError.message || apiError.displayMessage;
    return toFailure(apiError.code, text);
  }

  const resultCode = (
    extractFirstXmlTagValue(bodyText, 'result_code') ||
    extractFirstXmlTagValue(bodyText, 'resultCode')
  ).trim();

  if (isElevenXmlSuccessCode(resultCode)) {
    return {
      ok: true,
      code: resultCode,
      message: '',
      displayMessage: 'ok',
      bodyText: redactElevenSecrets(bodyText, secrets),
    };
  }

  const resultText = (
    extractFirstXmlTagValue(bodyText, 'result_text') ||
    extractFirstXmlTagValue(bodyText, 'resultMessage') ||
    extractFirstXmlTagValue(bodyText, 'resultText') ||
    ''
  ).trim();

  if (!resultCode) {
    return toFailure(
      'MISSING_RESULT_CODE',
      resultText || '11번가 API 성공 코드(result_code)가 없어 실패로 처리했습니다.',
    );
  }

  return toFailure(
    resultCode,
    resultText || `11번가 API 오류 (코드: ${resultCode})`,
  );
}

async function elevenMutationRequest(input: {
  credentials: ElevenCredentials;
  pathWithQuery: string;
  endpointLabel: ElevenOrderStatusEndpoint | 'reqpackaging' | 'reqdelivery';
}): Promise<ElevenMutationResult> {
  if (!isIntegrationProxyConfigured()) {
    throw new Error('11번가 API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.');
  }
  assertIntegrationProxyConfigReady();

  const apiKey = input.credentials.openapikey.trim();
  const secrets = [apiKey];
  const url = `${ELEVEN_API_ORIGIN}${input.pathWithQuery}`;

  let httpStatus: number;
  let bodyText: string;
  try {
    const res = await invokeIntegrationHttp({
      method: 'GET',
      url,
      headers: {
        openapikey: apiKey,
        Accept: 'application/xml, text/xml, */*',
      },
      body: null,
    });
    httpStatus = res.httpStatus;
    bodyText = res.bodyText;
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error ?? '');
    const safe = redactElevenSecrets(raw, secrets);
    return {
      ok: false,
      code: 'NETWORK',
      message: safe || '11번가 API 네트워크 연결에 실패했습니다.',
      displayMessage:
        redactElevenSecrets(safe || '11번가 API 네트워크 연결에 실패했습니다.', secrets),
      bodyText: '',
    };
  }

  return evaluateElevenMutationHttpResponse({
    httpStatus,
    bodyText,
    secrets,
  });
}

export async function elevenReqPackaging(input: {
  credentials: ElevenCredentials;
  ordNo: string;
  ordPrdSeq: string;
  addPrdYn: 'Y' | 'N';
  addPrdNo: string;
  dlvNo: string;
}): Promise<ElevenMutationResult> {
  const path = buildElevenReqPackagingPath(input);
  return elevenMutationRequest({
    credentials: input.credentials,
    pathWithQuery: path,
    endpointLabel: 'reqpackaging',
  });
}

export async function elevenReqDelivery(input: {
  credentials: ElevenCredentials;
  sendDt: string;
  dlvMthdCd: string;
  dlvEtprsCd: string;
  invcNo: string;
  dlvNo: string;
  partDlvYn: 'Y' | 'N';
  ordNo: string;
  ordPrdSeq: string;
}): Promise<ElevenMutationResult> {
  const path = buildElevenReqDeliveryPath(input);
  return elevenMutationRequest({
    credentials: input.credentials,
    pathWithQuery: path,
    endpointLabel: 'reqdelivery',
  });
}

export function toUserFacingElevenErrorMessage(
  error: unknown,
  secrets: Array<string | null | undefined> = [],
): string {
  const raw =
    error instanceof Error
      ? error.message
      : '11번가 연동 처리 중 오류가 발생했습니다.';
  return sanitizePublicIntegrationErrorMessage(redactElevenSecrets(raw, secrets));
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
