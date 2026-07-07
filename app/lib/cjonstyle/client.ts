import { assertIntegrationProxyConfigReady, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { invokeIntegrationHttp } from '@/app/lib/integration-proxy/http-transport';
import {
  CJONSTYLE_API_ORIGIN,
  CJONSTYLE_DEFAULT_DELIVERY_METHOD_CODES,
  CJONSTYLE_ORDER_SEARCH_SPEC,
  type CjonstyleDeliveryMethodCode,
} from '@/app/lib/cjonstyle/api-spec';

export {
  CJONSTYLE_API_ORIGIN,
  CJONSTYLE_DEFAULT_DELIVERY_METHOD_CODES,
  CJONSTYLE_ORDER_SEARCH_SPEC,
};

export type CjonstyleCredentials = {
  vendorCode: string;
  authenticationKey: string;
  /** 미입력 시 20,30,35,40 */
  deliveryMethodCodes?: string[];
};

export type CjonstyleOrderRecord = {
  ordNo: string;
  ordItemSeq: string;
  deliveryMethodCode: string;
  statusName: string;
  itemNm: string;
  ordQty: string;
  ordDate: string;
  rcvrNm: string;
  rcvrPhone: string;
  rcvrZip: string;
  rcvrAddr1: string;
  rcvrAddr2: string;
  dlvMsg: string;
  payAmt: string;
  raw: Record<string, unknown>;
};

type CjonstyleApiEnvelope = {
  resultCode?: string;
  resultMessage?: string;
  resultDesc?: string;
  message?: string;
};

function formatCjonstyleApiDate(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function pickString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

export function resolveCjonstyleDeliveryMethodCodes(input?: string[]): string[] {
  const normalized = (input ?? [])
    .map((code) => code.trim())
    .filter(Boolean);

  if (normalized.length) {
    return [...new Set(normalized)];
  }

  return [...CJONSTYLE_DEFAULT_DELIVERY_METHOD_CODES];
}

function isCjonstyleSuccessResultCode(code?: string): boolean {
  const normalized = code?.trim().toUpperCase();
  if (!normalized) return true;
  return CJONSTYLE_ORDER_SEARCH_SPEC.successResultCodes.some(
    (candidate) => candidate.toUpperCase() === normalized,
  );
}

function unwrapListItems(list: unknown[], wrapperKeys: readonly string[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;

    const wrapped = wrapperKeys.map((key) => record[key]).find((value) => value && typeof value === 'object');
    if (wrapped && typeof wrapped === 'object') {
      rows.push(wrapped as Record<string, unknown>);
      continue;
    }

    rows.push(record);
  }

  return rows;
}

export function extractCjonstyleOrderList(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return [];

  const root = payload as Record<string, unknown>;

  for (const listKey of CJONSTYLE_ORDER_SEARCH_SPEC.responseListKeys) {
    const list = root[listKey];
    if (Array.isArray(list)) {
      return unwrapListItems(list, CJONSTYLE_ORDER_SEARCH_SPEC.responseItemKeys);
    }
    if (list && typeof list === 'object') {
      const nested = list as Record<string, unknown>;
      for (const itemKey of CJONSTYLE_ORDER_SEARCH_SPEC.responseItemKeys) {
        const nestedList = nested[itemKey];
        if (Array.isArray(nestedList)) {
          return unwrapListItems(nestedList, CJONSTYLE_ORDER_SEARCH_SPEC.responseItemKeys);
        }
      }
    }
  }

  if (Array.isArray(payload)) {
    return unwrapListItems(payload, CJONSTYLE_ORDER_SEARCH_SPEC.responseItemKeys);
  }

  return [];
}

function normalizeCjonstyleOrderRecord(
  raw: Record<string, unknown>,
  deliveryMethodCode: string,
): CjonstyleOrderRecord | null {
  const ordNo = pickString(raw, ['ordNo', 'orderNo', 'ordNum', 'orderNumber']);
  if (!ordNo) return null;

  const ordItemSeq = pickString(raw, ['ordItemSeq', 'orderItemSeq', 'itemSeq', 'ordSeq']) || '1';
  const rcvrPhone = pickString(raw, ['rcvrPhone', 'rcvrHp', 'receiverPhone', 'receiverHp', 'rcvrTel']);

  return {
    ordNo,
    ordItemSeq,
    deliveryMethodCode,
    statusName: pickString(raw, ['ordStatNm', 'orderStatusName', 'statusName', 'dlvStatNm']),
    itemNm: pickString(raw, ['itemNm', 'productName', 'goodsName', 'pdNm']),
    ordQty: pickString(raw, ['ordQty', 'orderQty', 'qty']) || '1',
    ordDate: pickString(raw, ['ordDate', 'orderDate', 'ordDt', 'payDate', 'ordCmplDt']),
    rcvrNm: pickString(raw, ['rcvrNm', 'receiverName', 'recipientName']),
    rcvrPhone,
    rcvrZip: pickString(raw, ['rcvrZip', 'zipCode', 'receiverZip', 'rcvrMailNo']),
    rcvrAddr1: pickString(raw, ['rcvrAddr1', 'receiverAddr1', 'addr1', 'rcvrBaseAddr']),
    rcvrAddr2: pickString(raw, ['rcvrAddr2', 'receiverAddr2', 'addr2', 'rcvrDtlAddr']),
    dlvMsg: pickString(raw, ['dlvMsg', 'deliveryMessage', 'ordMemo', 'deliveryMemo']),
    payAmt: pickString(raw, ['payAmt', 'orderAmt', 'saleAmt', 'payPrice']),
    raw,
  };
}

export function mapRawCjonstyleOrders(
  rows: Record<string, unknown>[],
  deliveryMethodCode: string,
): CjonstyleOrderRecord[] {
  return rows
    .map((row) => normalizeCjonstyleOrderRecord(row, deliveryMethodCode))
    .filter((row): row is CjonstyleOrderRecord => Boolean(row));
}

export function parseCjonstyleApiResponse(bodyText: string): CjonstyleApiEnvelope & Record<string, unknown> {
  try {
    return JSON.parse(bodyText) as CjonstyleApiEnvelope & Record<string, unknown>;
  } catch {
    throw new Error('CJ온스타일 API 응답 JSON 파싱에 실패했습니다.');
  }
}

function assertCjonstyleApiSuccess(envelope: CjonstyleApiEnvelope, httpStatus: number): void {
  const resultCode = envelope.resultCode?.trim();
  if (resultCode && !isCjonstyleSuccessResultCode(resultCode)) {
    const message =
      envelope.resultDesc?.trim() ||
      envelope.resultMessage?.trim() ||
      envelope.message?.trim() ||
      `CJ온스타일 API 오류 (resultCode=${resultCode})`;
    throw new Error(message);
  }

  if (httpStatus >= 200 && httpStatus < 300) {
    return;
  }

  if (httpStatus === 401 || httpStatus === 403) {
    throw new Error(
      'CJ온스타일 API 인증에 실패했습니다. vendorCode·authenticationKey·IP 등록 상태를 확인해 주세요.',
    );
  }

  throw new Error(`CJ온스타일 API 호출에 실패했습니다. (HTTP ${httpStatus})`);
}

function buildOrderSearchUrl(input: {
  deliveryMethodCode: string;
  start: Date;
  end: Date;
}): string {
  const url = new URL(`${CJONSTYLE_API_ORIGIN}${CJONSTYLE_ORDER_SEARCH_SPEC.path}`);
  const { queryKeys } = CJONSTYLE_ORDER_SEARCH_SPEC;
  url.searchParams.set(queryKeys.deliveryMethodCode, input.deliveryMethodCode);
  url.searchParams.set(queryKeys.startDate, formatCjonstyleApiDate(input.start));
  url.searchParams.set(queryKeys.endDate, formatCjonstyleApiDate(input.end));
  return url.toString();
}

function buildAuthHeaders(credentials: CjonstyleCredentials): Record<string, string> {
  const { headerKeys } = CJONSTYLE_ORDER_SEARCH_SPEC;
  return {
    [headerKeys.vendorCode]: credentials.vendorCode.trim(),
    [headerKeys.authenticationKey]: credentials.authenticationKey.trim(),
    Accept: 'application/json',
  };
}

export async function cjonstyleApiRequest(input: {
  credentials: CjonstyleCredentials;
  url: string;
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
}): Promise<CjonstyleApiEnvelope & Record<string, unknown>> {
  if (!isIntegrationProxyConfigured()) {
    throw new Error('CJ온스타일 API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.');
  }

  assertIntegrationProxyConfigReady();

  const method = input.method ?? CJONSTYLE_ORDER_SEARCH_SPEC.method;
  const { httpStatus, bodyText } = await invokeIntegrationHttp({
    method,
    url: input.url,
    headers: buildAuthHeaders(input.credentials),
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  const envelope = parseCjonstyleApiResponse(bodyText);
  assertCjonstyleApiSuccess(envelope, httpStatus);
  return envelope;
}

export async function fetchCjonstyleOrdersByDeliveryMethod(input: {
  credentials: CjonstyleCredentials;
  deliveryMethodCode: string;
  start: Date;
  end: Date;
}): Promise<CjonstyleOrderRecord[]> {
  const url = buildOrderSearchUrl({
    deliveryMethodCode: input.deliveryMethodCode,
    start: input.start,
    end: input.end,
  });

  const envelope = await cjonstyleApiRequest({
    credentials: input.credentials,
    url,
    method: CJONSTYLE_ORDER_SEARCH_SPEC.method,
  });

  return mapRawCjonstyleOrders(extractCjonstyleOrderList(envelope), input.deliveryMethodCode);
}

function dedupeCjonstyleOrders(orders: CjonstyleOrderRecord[]): CjonstyleOrderRecord[] {
  const seen = new Set<string>();
  const result: CjonstyleOrderRecord[] = [];

  for (const order of orders) {
    const key = `${order.ordNo}|${order.ordItemSeq}|${order.deliveryMethodCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(order);
  }

  return result;
}

export async function fetchCjonstyleOrders(input: {
  credentials: CjonstyleCredentials;
  days?: number;
}): Promise<CjonstyleOrderRecord[]> {
  const days = input.days ?? 7;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const deliveryMethodCodes = resolveCjonstyleDeliveryMethodCodes(input.credentials.deliveryMethodCodes);

  const collected: CjonstyleOrderRecord[] = [];

  for (const deliveryMethodCode of deliveryMethodCodes) {
    const batch = await fetchCjonstyleOrdersByDeliveryMethod({
      credentials: input.credentials,
      deliveryMethodCode,
      start,
      end,
    });
    collected.push(...batch);
  }

  return dedupeCjonstyleOrders(collected);
}

export async function testCjonstyleConnection(credentials: CjonstyleCredentials): Promise<{ ok: true }> {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const [firstCode] = resolveCjonstyleDeliveryMethodCodes(credentials.deliveryMethodCodes);

  await fetchCjonstyleOrdersByDeliveryMethod({
    credentials,
    deliveryMethodCode: firstCode ?? CJONSTYLE_DEFAULT_DELIVERY_METHOD_CODES[0],
    start,
    end,
  });

  return { ok: true };
}

export function toUserFacingCjonstyleErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'CJ온스타일 연동 처리 중 오류가 발생했습니다.';
}
