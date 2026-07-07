import { assertIntegrationProxyConfigReady, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { invokeIntegrationHttp } from '@/app/lib/integration-proxy/http-transport';
import {
  extractXmlBlocks,
  parseElevenApiError,
  parseXmlRecord,
} from '@/app/lib/eleven/xml-parser';

export const ELEVEN_API_ORIGIN = 'https://api.11st.co.kr';
export const ELEVEN_DEFAULT_VENDOR_ID = 'default';

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

export type ElevenOrderStatusEndpoint = 'complete' | 'standing';

const ORDER_STATUS_ENDPOINTS: ElevenOrderStatusEndpoint[] = ['complete', 'standing'];

export function formatElevenApiDateTime(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}`;
}

function buildElevenOrderPath(endpoint: ElevenOrderStatusEndpoint, start: Date, end: Date): string {
  return `/rest/ordservices/${endpoint}/${formatElevenApiDateTime(start)}/${formatElevenApiDateTime(end)}`;
}

export function parseElevenOrdersXml(xml: string): ElevenOrderRecord[] {
  const apiError = parseElevenApiError(xml);
  if (apiError) {
    throw new Error(apiError);
  }

  const orderBlocks = [
    ...extractXmlBlocks(xml, 'Order'),
    ...extractXmlBlocks(xml, 'order'),
  ];

  const uniqueBlocks = [...new Set(orderBlocks)];
  if (!uniqueBlocks.length) {
    return [];
  }

  return uniqueBlocks.map((block) => parseXmlRecord(block, ELEVEN_ORDER_XML_FIELDS) as ElevenOrderRecord);
}

function assertElevenHttpSuccess(httpStatus: number, bodyText: string): void {
  if (httpStatus >= 200 && httpStatus < 300) {
    return;
  }

  const apiError = parseElevenApiError(bodyText);
  if (apiError) {
    throw new Error(apiError);
  }

  if (httpStatus === 401 || httpStatus === 403) {
    throw new Error('11번가 OPEN API KEY 인증에 실패했습니다. 키와 IP 등록 상태를 확인해 주세요.');
  }

  throw new Error(`11번가 API 호출에 실패했습니다. (HTTP ${httpStatus})`);
}

export async function elevenApiRequest(input: {
  credentials: ElevenCredentials;
  method: string;
  pathWithQuery: string;
  body?: string;
  contentType?: string;
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

  assertElevenHttpSuccess(httpStatus, bodyText);

  const apiError = parseElevenApiError(bodyText);
  if (apiError) {
    throw new Error(apiError);
  }

  return bodyText;
}

export async function fetchElevenOrdersByEndpoint(input: {
  credentials: ElevenCredentials;
  endpoint: ElevenOrderStatusEndpoint;
  start: Date;
  end: Date;
}): Promise<ElevenOrderRecord[]> {
  const bodyText = await elevenApiRequest({
    credentials: input.credentials,
    method: 'GET',
    pathWithQuery: buildElevenOrderPath(input.endpoint, input.start, input.end),
  });

  return parseElevenOrdersXml(bodyText);
}

function dedupeElevenOrders(orders: ElevenOrderRecord[]): ElevenOrderRecord[] {
  const seen = new Set<string>();
  const result: ElevenOrderRecord[] = [];

  for (const order of orders) {
    const key = `${order.ordNo}|${order.ordPrdSeq}`;
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

  const collected: ElevenOrderRecord[] = [];

  for (const endpoint of ORDER_STATUS_ENDPOINTS) {
    const batch = await fetchElevenOrdersByEndpoint({
      credentials: input.credentials,
      endpoint,
      start,
      end: now,
    });
    collected.push(...batch);
  }

  return dedupeElevenOrders(collected);
}

export async function testElevenConnection(credentials: ElevenCredentials): Promise<{ ok: true }> {
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  await fetchElevenOrdersByEndpoint({
    credentials,
    endpoint: 'complete',
    start,
    end: now,
  });

  return { ok: true };
}

export function toUserFacingElevenErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '11번가 연동 처리 중 오류가 발생했습니다.';
}
