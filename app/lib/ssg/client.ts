import { assertIntegrationProxyConfigReady, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { invokeIntegrationHttp } from '@/app/lib/integration-proxy/http-transport';

/** SSG Open API 운영 호스트 — SSOT: eapi.ssgadm.com */
export const SSG_API_ORIGIN = 'https://eapi.ssgadm.com';

export const SSG_API_VERSION = '1';

/** 배송지시목록조회 */
export const SSG_LIST_SHPP_DIRECTION_PATH = `/api/pd/${SSG_API_VERSION}/listShppDirection.ssg`;

/** 출고대상목록조회 */
export const SSG_LIST_WAREHOUSE_OUT_PATH = `/api/pd/${SSG_API_VERSION}/listWarehouseOut.ssg`;

export type SsgOrderSource = 'shpp_direction' | 'warehouse_out';

export type SsgCredentials = {
  apiKey: string;
};

export type SsgOrderRecord = {
  ordNo: string;
  ordItemSeq: string;
  shppNo: string;
  shppSeq: string;
  statusName: string;
  itemNm: string;
  ordQty: string;
  ordCmplDts: string;
  rcptpeNm: string;
  rcptpePhone: string;
  shpplocZipcd: string;
  shpplocBascAddr: string;
  shpplocDtlAddr: string;
  ordMemoCntt: string;
  sellprc: string;
  source: SsgOrderSource;
  raw: Record<string, unknown>;
};

type SsgApiEnvelope = {
  resultCode?: string;
  resultMessage?: string;
  resultDesc?: string;
  shppDirections?: unknown;
  warehouseOuts?: unknown;
};

function formatSsgApiDate(date: Date): string {
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

function isSsgSuccessResultCode(code?: string): boolean {
  const normalized = code?.trim().toUpperCase();
  return normalized === '00' || normalized === '0' || normalized === 'SUCCESS';
}

function unwrapListItems(list: unknown[], wrapperKeys: string[]): Record<string, unknown>[] {
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

function extractNamedList(payload: unknown, listKey: string, wrapperKeys: string[]): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return [];

  const root = payload as SsgApiEnvelope & Record<string, unknown>;
  const list = root[listKey];

  if (!Array.isArray(list)) return [];
  return unwrapListItems(list, wrapperKeys);
}

export function extractSsgShppDirectionList(payload: unknown): Record<string, unknown>[] {
  return extractNamedList(payload, 'shppDirections', ['shppDirection']);
}

export function extractSsgWarehouseOutList(payload: unknown): Record<string, unknown>[] {
  return extractNamedList(payload, 'warehouseOuts', ['warehouseOut']);
}

function normalizeSsgOrderRecord(
  raw: Record<string, unknown>,
  source: SsgOrderSource,
): SsgOrderRecord | null {
  const ordNo = pickString(raw, ['ordNo', 'orordNo']);
  if (!ordNo) return null;

  const ordItemSeq = pickString(raw, ['ordItemSeq', 'orordItemSeq']) || '1';
  const shppNo = pickString(raw, ['shppNo']);
  const shppSeq = pickString(raw, ['shppSeq']) || '1';
  const rcptpePhone = pickString(raw, ['rcptpeHpno', 'rcptpeTelno', 'rcptpePhone']);

  const statusName =
    pickString(raw, ['shppStatNm', 'lastShppProgStatDtlNm', 'shppProgStatDtlCd']) ||
    (source === 'shpp_direction' ? '배송지시' : '출고대상');

  return {
    ordNo,
    ordItemSeq,
    shppNo,
    shppSeq,
    statusName,
    itemNm: pickString(raw, ['itemNm', 'uitemNm']),
    ordQty: pickString(raw, ['ordQty', 'dircItemQty']) || '1',
    ordCmplDts: pickString(raw, ['ordCmplDts', 'ordRcpDts', 'ordCmplDt']),
    rcptpeNm: pickString(raw, ['rcptpeNm']),
    rcptpePhone,
    shpplocZipcd: pickString(raw, ['shpplocZipcd', 'shpplocOldZipcd']),
    shpplocBascAddr: pickString(raw, ['shpplocBascAddr', 'shpplocAddr', 'ordpeRoadAddr', 'shpplocAddr']),
    shpplocDtlAddr: pickString(raw, ['shpplocDtlAddr']),
    ordMemoCntt: pickString(raw, ['ordMemoCntt', 'memoCntt']),
    sellprc: pickString(raw, ['sellprc', 'rlordAmt', 'splprc']),
    source,
    raw,
  };
}

export function mapRawSsgOrders(
  rows: Record<string, unknown>[],
  source: SsgOrderSource,
): SsgOrderRecord[] {
  return rows
    .map((row) => normalizeSsgOrderRecord(row, source))
    .filter((row): row is SsgOrderRecord => Boolean(row));
}

export function parseSsgApiResponse(bodyText: string): SsgApiEnvelope {
  try {
    return JSON.parse(bodyText) as SsgApiEnvelope;
  } catch {
    throw new Error('SSG API 응답 JSON 파싱에 실패했습니다.');
  }
}

function assertSsgApiSuccess(envelope: SsgApiEnvelope, httpStatus: number): void {
  const resultCode = envelope.resultCode?.trim();
  if (resultCode && !isSsgSuccessResultCode(resultCode)) {
    const message =
      envelope.resultDesc?.trim() ||
      envelope.resultMessage?.trim() ||
      `SSG API 오류 (resultCode=${resultCode})`;
    throw new Error(message);
  }

  if (httpStatus >= 200 && httpStatus < 300) {
    return;
  }

  if (httpStatus === 401 || httpStatus === 403) {
    throw new Error('SSG API 인증키 인증에 실패했습니다. 인증키·IP 등록 상태를 확인해 주세요.');
  }

  throw new Error(`SSG API 호출에 실패했습니다. (HTTP ${httpStatus})`);
}

function buildPeriodBody(
  rootKey: 'requestShppDirection' | 'requestWarehouseOut',
  perdType: string,
  start: Date,
  end: Date,
): Record<string, unknown> {
  return {
    [rootKey]: {
      perdType,
      perdStrDts: formatSsgApiDate(start),
      perdEndDts: formatSsgApiDate(end),
    },
  };
}

export async function ssgApiRequest(input: {
  credentials: SsgCredentials;
  path: string;
  body: Record<string, unknown>;
}): Promise<SsgApiEnvelope> {
  if (!isIntegrationProxyConfigured()) {
    throw new Error('SSG API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.');
  }

  assertIntegrationProxyConfigReady();

  const url = `${SSG_API_ORIGIN}${input.path}`;
  const { httpStatus, bodyText } = await invokeIntegrationHttp({
    method: 'POST',
    url,
    headers: {
      Authorization: input.credentials.apiKey.trim(),
      Accept: 'application/json',
      'Content-Type': 'application/json;charset=UTF-8',
    },
    body: JSON.stringify(input.body),
  });

  const envelope = parseSsgApiResponse(bodyText);
  assertSsgApiSuccess(envelope, httpStatus);
  return envelope;
}

export async function fetchSsgShppDirections(input: {
  credentials: SsgCredentials;
  start: Date;
  end: Date;
}): Promise<SsgOrderRecord[]> {
  const envelope = await ssgApiRequest({
    credentials: input.credentials,
    path: SSG_LIST_SHPP_DIRECTION_PATH,
    body: buildPeriodBody('requestShppDirection', '01', input.start, input.end),
  });

  return mapRawSsgOrders(extractSsgShppDirectionList(envelope), 'shpp_direction');
}

export async function fetchSsgWarehouseOuts(input: {
  credentials: SsgCredentials;
  start: Date;
  end: Date;
}): Promise<SsgOrderRecord[]> {
  const envelope = await ssgApiRequest({
    credentials: input.credentials,
    path: SSG_LIST_WAREHOUSE_OUT_PATH,
    body: buildPeriodBody('requestWarehouseOut', '02', input.start, input.end),
  });

  return mapRawSsgOrders(extractSsgWarehouseOutList(envelope), 'warehouse_out');
}

function dedupeSsgOrders(orders: SsgOrderRecord[]): SsgOrderRecord[] {
  const seen = new Set<string>();
  const result: SsgOrderRecord[] = [];

  for (const order of orders) {
    const key = `${order.ordNo}|${order.ordItemSeq}|${order.shppNo}|${order.shppSeq}|${order.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(order);
  }

  return result;
}

export async function fetchSsgOrders(input: {
  credentials: SsgCredentials;
  days?: number;
}): Promise<SsgOrderRecord[]> {
  const days = input.days ?? 7;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  const shppDirections = await fetchSsgShppDirections({
    credentials: input.credentials,
    start,
    end,
  });
  const warehouseOuts = await fetchSsgWarehouseOuts({
    credentials: input.credentials,
    start,
    end,
  });

  return dedupeSsgOrders([...shppDirections, ...warehouseOuts]);
}

export async function testSsgConnection(credentials: SsgCredentials): Promise<{ ok: true }> {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  await fetchSsgShppDirections({ credentials, start, end });
  return { ok: true };
}

export function toUserFacingSsgErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'SSG 연동 처리 중 오류가 발생했습니다.';
}
