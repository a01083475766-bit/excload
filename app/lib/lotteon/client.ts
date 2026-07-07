import { assertIntegrationProxyConfigReady, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { invokeIntegrationHttp } from '@/app/lib/integration-proxy/http-transport';

/** 롯데ON OpenAPI 호스트 — SSOT: openapi.lotteon.com */
export const LOTTEON_API_ORIGIN = 'https://openapi.lotteon.com';

/**
 * 판매자 배송주문조회 (롯데ON API 센터 apiNo=100)
 * POST + Query Key + JSON body (tr_no, srchStrtDt, srchEndDt, odPrgsStepCd)
 */
export const LOTTEON_SELLER_DELIVERY_ORDER_SEARCH_PATH =
  '/v1/openapi/delivery/v1/SellerDeliveryOrderSearch';

/** 출고지시(신규주문) · 상품준비 — 1차 수집 대상 */
export const LOTTEON_ORDER_PROGRESS_STEP_CODES = ['11', '12'] as const;

export type LotteonOrderProgressStepCode = (typeof LOTTEON_ORDER_PROGRESS_STEP_CODES)[number];

export type LotteonCredentials = {
  apiKey: string;
  trNo: string;
  /** 선택 Shop ID — lrtr_no 등 하위 거래처 식별에 사용 */
  shopId?: string;
};

export type LotteonOrderRecord = {
  odNo: string;
  odSeq: string;
  odPrgsStepCd: string;
  odPrgsStepNm: string;
  pdNm: string;
  odQty: string;
  odCmptDttm: string;
  odAcptDttm: string;
  rcvrNm: string;
  rcvrPhone: string;
  rcvrZipNo: string;
  rcvrBaseAddr: string;
  rcvrDtlAddr: string;
  dlvMsg: string;
  odAmt: string;
  raw: Record<string, unknown>;
};

type LotteonApiEnvelope = {
  returnCode?: string;
  message?: string;
  data?: unknown;
  deliveryOrderList?: unknown;
  slrDvpOrderList?: unknown;
  orderList?: unknown;
};

function formatLotteonApiDate(date: Date): string {
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

function normalizeLotteonOrderRecord(raw: Record<string, unknown>): LotteonOrderRecord | null {
  const odNo = pickString(raw, ['odNo', 'od_no', 'orderNo']);
  if (!odNo) return null;

  const odSeq = pickString(raw, ['odSeq', 'od_seq', 'orderSeq', 'dvpOrderSeq']) || '1';
  const rcvrPhone = pickString(raw, ['rcvrMbNo', 'rcvrTelNo', 'rcvrPhone', 'rcvrPrtblNo', 'rcvrTlphn']);

  return {
    odNo,
    odSeq,
    odPrgsStepCd: pickString(raw, ['odPrgsStepCd', 'od_prgs_step_cd', 'procStatCd']),
    odPrgsStepNm: pickString(raw, ['odPrgsStepNm', 'od_prgs_step_nm', 'procStatNm', 'odPrgsStepName']),
    pdNm: pickString(raw, ['pdNm', 'pd_nm', 'productName', 'goodsNm']),
    odQty: pickString(raw, ['odQty', 'od_qty', 'orderQty', 'qty']) || '1',
    odCmptDttm: pickString(raw, ['odCmptDttm', 'od_cmpt_dttm', 'payDttm', 'orderDttm']),
    odAcptDttm: pickString(raw, ['odAcptDttm', 'od_acpt_dttm', 'acptDttm']),
    rcvrNm: pickString(raw, ['rcvrNm', 'rcvr_nm', 'receiverName']),
    rcvrPhone,
    rcvrZipNo: pickString(raw, ['rcvrZipNo', 'rcvr_zip_no', 'rcvrMailNo']),
    rcvrBaseAddr: pickString(raw, ['rcvrZipAddr', 'rcvrBaseAddr', 'rcvr_base_addr', 'rcvrAddr']),
    rcvrDtlAddr: pickString(raw, ['rcvrDtlAddr', 'rcvr_dtl_addr', 'rcvrDtlsAddr']),
    dlvMsg: pickString(raw, ['odMsg', 'dlvMsg', 'dlv_msg', 'deliveryMessage']),
    odAmt: pickString(raw, ['odAmt', 'od_amt', 'payAmt', 'saleAmt']),
    raw,
  };
}

export function extractLotteonOrderList(payload: unknown): LotteonOrderRecord[] {
  if (!payload || typeof payload !== 'object') return [];

  const root = payload as LotteonApiEnvelope & Record<string, unknown>;
  const data = root.data;

  const listCandidates: unknown[] = [
    root.deliveryOrderList,
    root.slrDvpOrderList,
    root.orderList,
    typeof data === 'object' && data ? (data as Record<string, unknown>).deliveryOrderList : null,
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
    throw new Error('롯데ON API 응답 JSON 파싱에 실패했습니다.');
  }
}

function assertLotteonApiSuccess(envelope: LotteonApiEnvelope, httpStatus: number): void {
  const returnCode = envelope.returnCode?.trim();
  if (returnCode && returnCode !== '0000' && returnCode !== '0' && returnCode !== 'SUCCESS') {
    const message = envelope.message?.trim() || `롯데ON API 오류 (returnCode=${returnCode})`;
    throw new Error(message);
  }

  if (httpStatus >= 200 && httpStatus < 300) {
    return;
  }

  if (httpStatus === 401 || httpStatus === 403) {
    throw new Error('롯데ON API KEY 인증에 실패했습니다. Key·IP 등록·tr_no를 확인해 주세요.');
  }

  throw new Error(`롯데ON API 호출에 실패했습니다. (HTTP ${httpStatus})`);
}

function buildLotteonUrl(path: string, apiKey: string): string {
  const url = new URL(`${LOTTEON_API_ORIGIN}${path}`);
  url.searchParams.set('Key', apiKey.trim());
  return url.toString();
}

function buildSearchBody(input: {
  credentials: LotteonCredentials;
  start: Date;
  end: Date;
  odPrgsStepCd: LotteonOrderProgressStepCode;
}): Record<string, string> {
  const body: Record<string, string> = {
    tr_no: input.credentials.trNo.trim(),
    srchStrtDt: formatLotteonApiDate(input.start),
    srchEndDt: formatLotteonApiDate(input.end),
    odPrgsStepCd: input.odPrgsStepCd,
  };

  const shopId = input.credentials.shopId?.trim();
  if (shopId) {
    body.lrtr_no = shopId;
  }

  return body;
}

export async function lotteonApiRequest(input: {
  credentials: LotteonCredentials;
  path: string;
  body: Record<string, string>;
}): Promise<LotteonApiEnvelope> {
  if (!isIntegrationProxyConfigured()) {
    throw new Error('롯데ON API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.');
  }

  assertIntegrationProxyConfigReady();

  const url = buildLotteonUrl(input.path, input.credentials.apiKey);
  const { httpStatus, bodyText } = await invokeIntegrationHttp({
    method: 'POST',
    url,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json;charset=UTF-8',
    },
    body: JSON.stringify(input.body),
  });

  const envelope = parseLotteonApiResponse(bodyText);
  assertLotteonApiSuccess(envelope, httpStatus);
  return envelope;
}

export async function fetchLotteonOrdersByStep(input: {
  credentials: LotteonCredentials;
  odPrgsStepCd: LotteonOrderProgressStepCode;
  start: Date;
  end: Date;
}): Promise<LotteonOrderRecord[]> {
  const envelope = await lotteonApiRequest({
    credentials: input.credentials,
    path: LOTTEON_SELLER_DELIVERY_ORDER_SEARCH_PATH,
    body: buildSearchBody(input),
  });

  return extractLotteonOrderList(envelope);
}

function dedupeLotteonOrders(orders: LotteonOrderRecord[]): LotteonOrderRecord[] {
  const seen = new Set<string>();
  const result: LotteonOrderRecord[] = [];

  for (const order of orders) {
    const key = `${order.odNo}|${order.odSeq}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(order);
  }

  return result;
}

export async function fetchLotteonOrders(input: {
  credentials: LotteonCredentials;
  days?: number;
}): Promise<LotteonOrderRecord[]> {
  const days = input.days ?? 7;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  const collected: LotteonOrderRecord[] = [];

  for (const step of LOTTEON_ORDER_PROGRESS_STEP_CODES) {
    const batch = await fetchLotteonOrdersByStep({
      credentials: input.credentials,
      odPrgsStepCd: step,
      start,
      end,
    });
    collected.push(...batch);
  }

  return dedupeLotteonOrders(collected);
}

export async function testLotteonConnection(credentials: LotteonCredentials): Promise<{ ok: true }> {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  await fetchLotteonOrdersByStep({
    credentials,
    odPrgsStepCd: '11',
    start,
    end,
  });

  return { ok: true };
}

export function toUserFacingLotteonErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '롯데ON 연동 처리 중 오류가 발생했습니다.';
}
