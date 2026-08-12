import { assertIntegrationProxyConfigReady, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { invokeIntegrationHttp } from '@/app/lib/integration-proxy/http-transport';

/** 롯데ON OpenAPI 호스트 — SSOT: openapi.lotteon.com */
export const LOTTEON_API_ORIGIN = 'https://openapi.lotteon.com';

/**
 * OpenAPI 토큰 Identity 조회 (롯데ON API 센터 apiNo=207)
 * GET — 요청 파라미터 없음. 연결 테스트용.
 */
export const LOTTEON_IDENTITY_PATH = '/v1/openapi/common/v1/identity';

/**
 * 판매자 배송주문조회 (출고/회수지시) — 공식 경로 SellerDeliveryOrdersSearch
 * POST + Bearer + JSON body (srchStrtDt/srchEndDt = yyyymmddhhmmss, 조회기간 최대 1일)
 */
export const LOTTEON_SELLER_DELIVERY_ORDER_SEARCH_PATH =
  '/v1/openapi/delivery/v1/SellerDeliveryOrdersSearch';

/** 출고/회수지시 연동완료 통보 (apiNo=210) — 엑클로드 발주확인에 해당 */
export const LOTTEON_IF_COMPLETE_INFORM_PATH = '/v1/openapi/delivery/v1/SellerIfCompleteInform';

/** 배송상태 통보 (apiNo=137) — 상품준비(12)·발송완료(13) */
export const LOTTEON_DELIVERY_PROGRESS_INFORM_PATH =
  '/v1/openapi/delivery/v1/SellerDeliveryProgressStateInform';

/** 롯데ON 배송상태 조회 (apiNo=140) — 연동완료 이후 실시간 상태 */
export const LOTTEON_DELIVERY_PROGRESS_SEARCH_PATH =
  '/v1/openapi/delivery/v1/SellerDeliveryProgressStateSearch';

/** 공식: 조회기간은 1일을 초과할 수 없음 (returnCode 2003) */
export const LOTTEON_MAX_RANGE_DAYS = 1;

/** 209 조회: 11 출고지시(신규 수집), 23 회수지시(클레임) */
export const LOTTEON_ORDER_PROGRESS_STEP_CODES = ['11', '23'] as const;

/** 140 조회: 연동완료 이후 상품준비·발송완료·배송완료·수취완료 */
export const LOTTEON_PROGRESS_STATE_STEP_CODES = ['12', '13', '14', '15'] as const;

export type LotteonOrderProgressStepCode = (typeof LOTTEON_ORDER_PROGRESS_STEP_CODES)[number];

export type LotteonCredentials = {
  apiKey: string;
  /** 주문 조회 API body용. Identity 연결 테스트에는 불필요. */
  trNo: string;
  /** 선택 Shop ID — lrtr_no 등 하위 거래처 식별에 사용 */
  shopId?: string;
};

export type LotteonOrderRecord = {
  odNo: string;
  odSeq: string;
  procSeq: string;
  orglProcSeq: string;
  clmNo: string;
  odPrgsStepCd: string;
  odPrgsStepNm: string;
  dvRtrvDvsCd: string;
  odTypCd: string;
  odTypDtlCd: string;
  spdNo: string;
  sitmNo: string;
  pdNm: string;
  odQty: string;
  slQty: string;
  odCmptDttm: string;
  odAcptDttm: string;
  rcvrNm: string;
  rcvrPhone: string;
  rcvrZipNo: string;
  rcvrBaseAddr: string;
  rcvrDtlAddr: string;
  dlvMsg: string;
  odAmt: string;
  invcNo: string;
  dvCoCd: string;
  raw: Record<string, unknown>;
};

export type LotteonIdentityData = {
  trGrpCd?: string;
  trDvsCd?: string;
  trNo?: string;
  trNm?: string;
};

type LotteonApiEnvelope = {
  returnCode?: string;
  message?: string;
  data?: unknown;
  deliveryOrderList?: unknown;
  deliveryProgressStateList?: unknown;
  slrDvpOrderList?: unknown;
  orderList?: unknown;
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toKstUtcParts(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
    second: kst.getUTCSeconds(),
  };
}

/** 공식 검색일시: yyyymmddhhmmss (길이 14). start=당일 00:00:00, end=당일 23:59:59 */
export function formatLotteonApiDateTime(date: Date, bound: 'start' | 'end' | 'exact' = 'exact'): string {
  const parts = toKstUtcParts(date);
  const datePart = `${parts.year}${pad2(parts.month)}${pad2(parts.day)}`;
  if (bound === 'start') return `${datePart}000000`;
  if (bound === 'end') return `${datePart}235959`;
  return `${datePart}${pad2(parts.hour)}${pad2(parts.minute)}${pad2(parts.second)}`;
}

function kstCalendarDayUtcMs(date: Date): number {
  const parts = toKstUtcParts(date);
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

/** KST 달력일 단위로 1일 창을 나눈다. 각 창은 00:00:00~23:59:59. */
export function buildLotteonDateWindows(start: Date, end: Date): Array<{ start: Date; end: Date }> {
  const startDay = kstCalendarDayUtcMs(start);
  const endDay = kstCalendarDayUtcMs(end);
  const first = Math.min(startDay, endDay);
  const last = Math.max(startDay, endDay);
  const windows: Array<{ start: Date; end: Date }> = [];

  for (let cursor = first; cursor <= last; cursor += 24 * 60 * 60 * 1000) {
    const day = new Date(cursor);
    windows.push({ start: day, end: day });
  }

  return windows.length > 0 ? windows : [{ start, end }];
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

/** 공식 FAQ: Authorization Bearer + 공통 Accept 계열 헤더 */
export function buildLotteonRequestHeaders(apiKey: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey.trim()}`,
    Accept: 'application/json',
    'Accept-Language': 'ko',
    'X-Timezone': 'GMT+09:00',
    ...(extra ?? {}),
  };
}

function looksLikeHtml(bodyText: string, contentType?: string | null): boolean {
  const type = (contentType ?? '').toLowerCase();
  if (type.includes('text/html') || type.includes('application/xhtml')) return true;
  const trimmed = bodyText.trim();
  return /^<!doctype html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed);
}

function looksLikeProxyRejection(bodyText: string): boolean {
  const text = bodyText.toLowerCase();
  return (
    text.includes('domain not allowed') ||
    text.includes('port not allowed') ||
    text.includes('invalid url') ||
    text.includes('고정 ip 프록시에서') ||
    text.includes('프록시에서 롯데on')
  );
}

export function normalizeLotteonOrderRecord(raw: Record<string, unknown>): LotteonOrderRecord | null {
  const odNo = pickString(raw, ['odNo', 'od_no', 'orderNo']);
  if (!odNo) return null;

  const odSeq = pickString(raw, ['odSeq', 'od_seq', 'orderSeq', 'dvpOrderSeq']) || '1';
  const rcvrPhone = pickString(raw, [
    'dvpMphnNo',
    'dvpTelNo',
    'rcvrMbNo',
    'rcvrTelNo',
    'rcvrPhone',
    'rcvrPrtblNo',
    'rcvrTlphn',
  ]);

  return {
    odNo,
    odSeq,
    procSeq: pickString(raw, ['procSeq', 'proc_seq']) || '1',
    orglProcSeq: pickString(raw, ['orglProcSeq', 'orgl_proc_seq']),
    clmNo: pickString(raw, ['clmNo', 'clm_no']),
    odPrgsStepCd: pickString(raw, ['odPrgsStepCd', 'od_prgs_step_cd', 'procStatCd']),
    odPrgsStepNm: pickString(raw, ['odPrgsStepNm', 'od_prgs_step_nm', 'procStatNm', 'odPrgsStepName']),
    dvRtrvDvsCd: pickString(raw, ['dvRtrvDvsCd', 'dv_rtrv_dvs_cd']) || 'DV',
    odTypCd: pickString(raw, ['odTypCd', 'od_typ_cd']) || '10',
    odTypDtlCd: pickString(raw, ['odTypDtlCd', 'od_typ_dtl_cd']),
    spdNo: pickString(raw, ['spdNo', 'spd_no']),
    sitmNo: pickString(raw, ['sitmNo', 'sitm_no', 'eitmNo']),
    pdNm: pickString(raw, ['spdNm', 'pdNm', 'pd_nm', 'productName', 'goodsNm']),
    odQty: pickString(raw, ['odQty', 'od_qty', 'orderQty', 'qty', 'slQty']) || '1',
    slQty: pickString(raw, ['slQty', 'odQty', 'od_qty', 'qty']) || '1',
    odCmptDttm: pickString(raw, ['odCmptDttm', 'od_cmpt_dttm', 'owhoDttm', 'payDttm', 'orderDttm']),
    odAcptDttm: pickString(raw, ['odAcptDttm', 'od_acpt_dttm', 'acptDttm']),
    rcvrNm: pickString(raw, ['dvpCustNm', 'rcvrNm', 'rcvr_nm', 'receiverName']),
    rcvrPhone,
    rcvrZipNo: pickString(raw, ['dvpZipNo', 'rcvrZipNo', 'rcvr_zip_no', 'rcvrMailNo']),
    rcvrBaseAddr: pickString(raw, ['dvpStnmZipAddr', 'rcvrZipAddr', 'rcvrBaseAddr', 'rcvr_base_addr', 'rcvrAddr']),
    rcvrDtlAddr: pickString(raw, ['dvpStnmDtlAddr', 'rcvrDtlAddr', 'rcvr_dtl_addr', 'rcvrDtlsAddr']),
    dlvMsg: pickString(raw, ['dvMsg', 'odMsg', 'dlvMsg', 'dlv_msg', 'deliveryMessage']),
    odAmt: pickString(raw, ['actualAmt', 'slAmt', 'odAmt', 'od_amt', 'payAmt', 'saleAmt']),
    invcNo: pickString(raw, ['invcNo', 'invc_no']),
    dvCoCd: pickString(raw, ['dvCoCd', 'dv_co_cd']),
    raw,
  };
}

export function extractLotteonOrderList(payload: unknown): LotteonOrderRecord[] {
  if (!payload || typeof payload !== 'object') return [];

  const root = payload as LotteonApiEnvelope & Record<string, unknown>;
  const data = root.data;

  const listCandidates: unknown[] = [
    root.deliveryOrderList,
    root.deliveryProgressStateList,
    root.slrDvpOrderList,
    root.orderList,
    typeof data === 'object' && data ? (data as Record<string, unknown>).deliveryOrderList : null,
    typeof data === 'object' && data ? (data as Record<string, unknown>).deliveryProgressStateList : null,
    typeof data === 'object' && data ? (data as Record<string, unknown>).slrDvpOrderList : null,
    typeof data === 'object' && data ? (data as Record<string, unknown>).orderList : null,
    Array.isArray(data) ? data : null,
  ];

  const list = listCandidates.find((candidate) => Array.isArray(candidate)) as
    | Record<string, unknown>[]
    | undefined;

  if (!list?.length) return [];

  return list
    .map((entry) => normalizeLotteonOrderRecord(entry))
    .filter((entry): entry is LotteonOrderRecord => Boolean(entry));
}

export function parseLotteonApiResponse(bodyText: string): LotteonApiEnvelope {
  try {
    return JSON.parse(bodyText) as LotteonApiEnvelope;
  } catch {
    throw new Error('롯데ON API 응답이 JSON 형식이 아닙니다.');
  }
}

function nestedRslt(envelope: LotteonApiEnvelope): { code: string; message: string } {
  const data = envelope.data;
  if (!data || typeof data !== 'object') return { code: '', message: '' };
  const record = data as Record<string, unknown>;
  return {
    code: String(record.rsltCd ?? '').trim(),
    message: String(record.rsltMsg ?? '').trim(),
  };
}

function assertLotteonApiSuccess(envelope: LotteonApiEnvelope, httpStatus: number): void {
  const returnCode = envelope.returnCode?.trim();
  if (returnCode && returnCode !== '0000' && returnCode !== '0' && returnCode !== 'SUCCESS') {
    const message = envelope.message?.trim() || `롯데ON API 오류 (returnCode=${returnCode})`;
    throw new Error(message);
  }

  const rslt = nestedRslt(envelope);
  if (rslt.code && rslt.code !== '0000' && rslt.code !== '0' && rslt.code !== 'SUCCESS') {
    throw new Error(rslt.message || `롯데ON API 오류 (rsltCd=${rslt.code})`);
  }

  if (httpStatus >= 200 && httpStatus < 300) {
    return;
  }

  throw new Error(`롯데ON API 호출에 실패했습니다. (HTTP ${httpStatus})`);
}

/**
 * HTTP status / content-type / 본문 존재 여부를 JSON 파싱 전에 검사한다.
 * 인증키·개인정보가 포함된 본문은 로그하지 않는다.
 */
export function interpretLotteonHttpResponse(input: {
  httpStatus: number;
  bodyText: string;
  contentType?: string | null;
}): LotteonApiEnvelope {
  const httpStatus = input.httpStatus;
  const bodyText = input.bodyText ?? '';
  const trimmed = bodyText.trim();
  const contentType = input.contentType ?? null;

  if (httpStatus === 401) {
    throw new Error('롯데ON API 인증키 오류입니다. OpenAPI 인증키를 확인해 주세요.');
  }

  if (httpStatus === 403) {
    throw new Error(
      '롯데ON API 접근이 거부되었습니다. 엑클로드 고정 IP(54.180.45.46) 등록이 일치하는지 확인해 주세요.',
    );
  }

  if (looksLikeProxyRejection(trimmed)) {
    throw new Error(
      '고정 IP 프록시에서 롯데ON 도메인(openapi.lotteon.com) 호출이 거부되었습니다. 관리자에게 문의해 주세요.',
    );
  }

  if (!trimmed) {
    throw new Error(`롯데ON API 응답이 비어 있습니다. (HTTP ${httpStatus})`);
  }

  if (looksLikeHtml(trimmed, contentType)) {
    throw new Error(
      `롯데ON API가 HTML을 반환했습니다. API 경로·프록시·IP 등록을 확인해 주세요. (HTTP ${httpStatus})`,
    );
  }

  let envelope: LotteonApiEnvelope;
  try {
    envelope = parseLotteonApiResponse(trimmed);
  } catch {
    throw new Error(`롯데ON API 응답이 JSON 형식이 아닙니다. (HTTP ${httpStatus})`);
  }

  assertLotteonApiSuccess(envelope, httpStatus);
  return envelope;
}

export function buildLotteonSearchBody(input: {
  credentials: LotteonCredentials;
  start: Date;
  end: Date;
  odPrgsStepCd: LotteonOrderProgressStepCode;
}): Record<string, string> {
  const body: Record<string, string> = {
    srchStrtDt: formatLotteonApiDateTime(input.start, 'start'),
    srchEndDt: formatLotteonApiDateTime(input.end, 'end'),
    odPrgsStepCd: input.odPrgsStepCd,
  };

  const shopId = input.credentials.shopId?.trim();
  if (shopId) {
    body.lrtrNo = shopId;
  }

  return body;
}

export async function lotteonApiRequest(input: {
  credentials: Pick<LotteonCredentials, 'apiKey'>;
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown> | Record<string, string>;
}): Promise<LotteonApiEnvelope> {
  if (!isIntegrationProxyConfigured()) {
    throw new Error('롯데ON API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.');
  }

  assertIntegrationProxyConfigReady();

  const url = `${LOTTEON_API_ORIGIN}${input.path}`;
  const headers = buildLotteonRequestHeaders(
    input.credentials.apiKey,
    input.method === 'POST'
      ? { 'Content-Type': 'application/json;charset=UTF-8' }
      : undefined,
  );

  const { httpStatus, bodyText, contentType } = await invokeIntegrationHttp({
    method: input.method,
    url,
    headers,
    body: input.body ? JSON.stringify(input.body) : null,
  });

  return interpretLotteonHttpResponse({ httpStatus, bodyText, contentType });
}

export async function fetchLotteonOrdersByStep(input: {
  credentials: LotteonCredentials;
  odPrgsStepCd: LotteonOrderProgressStepCode;
  start: Date;
  end: Date;
}): Promise<LotteonOrderRecord[]> {
  const envelope = await lotteonApiRequest({
    credentials: input.credentials,
    method: 'POST',
    path: LOTTEON_SELLER_DELIVERY_ORDER_SEARCH_PATH,
    body: buildLotteonSearchBody(input),
  });

  return extractLotteonOrderList(envelope);
}

export async function fetchLotteonProgressStatesByStep(input: {
  credentials: LotteonCredentials;
  odPrgsStepCd: string;
  start: Date;
  end: Date;
}): Promise<LotteonOrderRecord[]> {
  const envelope = await lotteonApiRequest({
    credentials: input.credentials,
    method: 'POST',
    path: LOTTEON_DELIVERY_PROGRESS_SEARCH_PATH,
    body: {
      srchStrtDt: formatLotteonApiDateTime(input.start, 'start'),
      srchEndDt: formatLotteonApiDateTime(input.end, 'end'),
      odPrgsStepCd: input.odPrgsStepCd,
    },
  });
  return extractLotteonOrderList(envelope);
}

export async function fetchLotteonProgressStatesByOdNo(input: {
  credentials: Pick<LotteonCredentials, 'apiKey'>;
  odNo: string;
}): Promise<LotteonOrderRecord[]> {
  const envelope = await lotteonApiRequest({
    credentials: input.credentials,
    method: 'POST',
    path: LOTTEON_DELIVERY_PROGRESS_SEARCH_PATH,
    body: { odNo: input.odNo.trim() },
  });
  return extractLotteonOrderList(envelope);
}

export type LotteonIfCompleteItem = {
  dvRtrvDvsCd: string;
  odNo: string;
  odSeq: string;
  procSeq: string;
  orglProcSeq?: string;
  clmNo?: string;
  ifCplYN: 'Y' | 'N';
  ifFlRsnCnts?: string;
};

export async function postLotteonIfCompleteInform(input: {
  credentials: Pick<LotteonCredentials, 'apiKey'>;
  items: LotteonIfCompleteItem[];
}): Promise<LotteonApiEnvelope> {
  return lotteonApiRequest({
    credentials: input.credentials,
    method: 'POST',
    path: LOTTEON_IF_COMPLETE_INFORM_PATH,
    body: { ifCompleteList: input.items },
  });
}

export type LotteonDeliveryProgressInformItem = {
  dvRtrvDvsCd: string;
  odNo: string;
  odSeq: string;
  procSeq: string;
  orglProcSeq?: string;
  clmNo?: string;
  odPrgsStepCd: string;
  dvTrcStatDttm: string;
  invcNbr?: string;
  dvCoCd?: string;
  invcNo?: string;
  spdNo: string;
  sitmNo: string;
  slQty: string;
  spdNm?: string;
};

export async function postLotteonDeliveryProgressInform(input: {
  credentials: Pick<LotteonCredentials, 'apiKey'>;
  items: LotteonDeliveryProgressInformItem[];
}): Promise<LotteonApiEnvelope> {
  return lotteonApiRequest({
    credentials: input.credentials,
    method: 'POST',
    path: LOTTEON_DELIVERY_PROGRESS_INFORM_PATH,
    body: { deliveryProgressStateList: input.items },
  });
}

/**
 * 209·140 동일 라인 판별 키.
 * 공식: odNo + odSeq + procSeq + 상품·단품(spdNo/sitmNo). clmNo는 클레임 라인 구분용.
 */
export function buildLotteonFetchLineKey(
  order: Pick<LotteonOrderRecord, 'odNo' | 'odSeq' | 'procSeq' | 'spdNo' | 'sitmNo' | 'clmNo'>,
): string {
  return [
    order.odNo.trim(),
    order.odSeq.trim(),
    (order.procSeq || '1').trim() || '1',
    (order.spdNo || '').trim(),
    (order.sitmNo || '').trim(),
    (order.clmNo || '').trim(),
  ].join('|');
}

/** 배송 진행단계 우선순위. 209가 11을 유지해도 140의 12+가 이기도록 한다. */
export function lotteonProgressStepRank(step: string | null | undefined): number {
  switch ((step ?? '').trim()) {
    case '11':
      return 10;
    case '12':
      return 20;
    case '13':
      return 30;
    case '14':
      return 40;
    case '15':
      return 50;
    case '21':
    case '22':
    case '23':
    case '24':
    case '25':
    case '26':
    case '27':
      return 60;
    default:
      return 0;
  }
}

function preferNonEmpty(primary: string, fallback: string): string {
  return primary.trim() ? primary : fallback;
}

/**
 * 동일 라인의 209·140 결과를 병합한다.
 * 진행단계가 더 앞선 쪽을 우선하고, 빈 필드는 상대 쪽에서 보강한다.
 */
export function mergeLotteonOrderRecords(
  existing: LotteonOrderRecord,
  incoming: LotteonOrderRecord,
): LotteonOrderRecord {
  const preferIncoming =
    lotteonProgressStepRank(incoming.odPrgsStepCd) >= lotteonProgressStepRank(existing.odPrgsStepCd);
  const preferred = preferIncoming ? incoming : existing;
  const other = preferIncoming ? existing : incoming;
  return {
    ...other,
    ...preferred,
    odPrgsStepCd: preferred.odPrgsStepCd || other.odPrgsStepCd,
    odPrgsStepNm: preferred.odPrgsStepNm || other.odPrgsStepNm,
    spdNo: preferNonEmpty(preferred.spdNo, other.spdNo),
    sitmNo: preferNonEmpty(preferred.sitmNo, other.sitmNo),
    pdNm: preferNonEmpty(preferred.pdNm, other.pdNm),
    slQty: preferNonEmpty(preferred.slQty, other.slQty),
    odQty: preferNonEmpty(preferred.odQty, other.odQty),
    invcNo: preferNonEmpty(preferred.invcNo, other.invcNo),
    dvCoCd: preferNonEmpty(preferred.dvCoCd, other.dvCoCd),
    rcvrNm: preferNonEmpty(preferred.rcvrNm, other.rcvrNm),
    rcvrPhone: preferNonEmpty(preferred.rcvrPhone, other.rcvrPhone),
    rcvrZipNo: preferNonEmpty(preferred.rcvrZipNo, other.rcvrZipNo),
    rcvrBaseAddr: preferNonEmpty(preferred.rcvrBaseAddr, other.rcvrBaseAddr),
    rcvrDtlAddr: preferNonEmpty(preferred.rcvrDtlAddr, other.rcvrDtlAddr),
    dlvMsg: preferNonEmpty(preferred.dlvMsg, other.dlvMsg),
    odAmt: preferNonEmpty(preferred.odAmt, other.odAmt),
    odCmptDttm: preferNonEmpty(preferred.odCmptDttm, other.odCmptDttm),
    odAcptDttm: preferNonEmpty(preferred.odAcptDttm, other.odAcptDttm),
    raw: preferred.raw ?? other.raw,
  };
}

/**
 * 209(출고/회수지시) + 140(배송상태) 목록을 라인 단위로 합친다.
 * 동일 라인이 양쪽에 있으면 진행단계가 앞선 쪽(보통 140)을 채택해 11로 되돌리지 않는다.
 */
export function mergeLotteonFetchedOrderLists(
  instructionOrders: LotteonOrderRecord[],
  progressOrders: LotteonOrderRecord[],
): LotteonOrderRecord[] {
  const byKey = new Map<string, LotteonOrderRecord>();
  for (const order of [...instructionOrders, ...progressOrders]) {
    const key = buildLotteonFetchLineKey(order);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeLotteonOrderRecords(existing, order) : order);
  }
  return [...byKey.values()];
}

export async function fetchLotteonOrders(input: {
  credentials: LotteonCredentials;
  days?: number;
}): Promise<LotteonOrderRecord[]> {
  const days = input.days ?? 7;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const windows = buildLotteonDateWindows(start, end);

  const instructionOrders: LotteonOrderRecord[] = [];
  const progressOrders: LotteonOrderRecord[] = [];

  // 209: 출고지시·회수지시. 연동완료 후에도 11로 남을 수 있음 → 단독 매핑 금지.
  for (const step of LOTTEON_ORDER_PROGRESS_STEP_CODES) {
    for (const window of windows) {
      const batch = await fetchLotteonOrdersByStep({
        credentials: input.credentials,
        odPrgsStepCd: step,
        start: window.start,
        end: window.end,
      });
      instructionOrders.push(...batch);
    }
  }

  // 140: 현재 배송상태(12/13/14/15). 동일 라인은 이 상태를 우선.
  // 공식 조회기간 최대 1일 → KST 달력일 창 분할. 페이지네이션 파라미터는 공식 미확정이라 미구현.
  for (const step of LOTTEON_PROGRESS_STATE_STEP_CODES) {
    for (const window of windows) {
      const batch = await fetchLotteonProgressStatesByStep({
        credentials: input.credentials,
        odPrgsStepCd: step,
        start: window.start,
        end: window.end,
      });
      progressOrders.push(...batch);
    }
  }

  return mergeLotteonFetchedOrderLists(instructionOrders, progressOrders);
}

export function extractLotteonIdentityData(envelope: LotteonApiEnvelope): LotteonIdentityData | null {
  const data = envelope.data;
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  return {
    trGrpCd: pickString(record, ['trGrpCd']) || undefined,
    trDvsCd: pickString(record, ['trDvsCd']) || undefined,
    trNo: pickString(record, ['trNo', 'tr_no']) || undefined,
    trNm: pickString(record, ['trNm', 'tr_nm']) || undefined,
  };
}

/** 연결 테스트: Identity API만 사용 (판매자 ID·tr_no 요청 불필요) */
export async function testLotteonConnection(
  credentials: Pick<LotteonCredentials, 'apiKey'>,
): Promise<{ ok: true; identity: LotteonIdentityData | null }> {
  const envelope = await lotteonApiRequest({
    credentials,
    method: 'GET',
    path: LOTTEON_IDENTITY_PATH,
  });

  return { ok: true, identity: extractLotteonIdentityData(envelope) };
}

export function toUserFacingLotteonErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '롯데ON 연동 처리 중 오류가 발생했습니다.';
}
