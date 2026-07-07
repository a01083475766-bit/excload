import { assertIntegrationProxyConfigReady, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { invokeIntegrationHttp } from '@/app/lib/integration-proxy/http-transport';
import {
  EXCLOAD_GODOMALL_OUTBOUND_IP,
  GODOMALL_DEFAULT_ORDER_STATUSES,
  GODOMALL_DEFAULT_PAGE_SIZE,
  GODOMALL_IP_WHITELIST_ERROR_CODE,
  GODOMALL_ORDER_SEARCH_SPEC,
  GODOMALL_ORDER_SEARCH_URL,
  type GodomallOrderStatusCode,
} from '@/app/lib/godomall/api-spec';
import { resolveGodomallPartnerKey } from '@/app/lib/godomall/partner-key';
import { asRecordArray, buildGodomallRequestXml, parseGodomallResponseXml } from '@/app/lib/godomall/xml';

export {
  GODOMALL_DEFAULT_ORDER_STATUSES,
  GODOMALL_ORDER_SEARCH_URL,
  EXCLOAD_GODOMALL_OUTBOUND_IP,
};

export type GodomallCredentials = {
  partnerKey?: string;
  userKey: string;
  mallSno?: string;
  orderStatuses?: string[];
};

export type GodomallOrderRecord = {
  orderNo: string;
  orderGoodsSno: string;
  orderStatus: string;
  orderDate: string;
  paymentDt: string;
  receiverName: string;
  receiverPhone: string;
  receiverZip: string;
  receiverAddr1: string;
  receiverAddr2: string;
  deliveryMemo: string;
  productName: string;
  orderQty: string;
  payAmt: string;
  raw: Record<string, unknown>;
};

type GodomallOrderSearchPage = {
  code: string;
  msg: string;
  hasMore: boolean;
  orders: Record<string, unknown>[];
};

function formatGodomallApiDate(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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

export function resolveGodomallOrderStatuses(input?: string[]): string[] {
  const normalized = (input ?? [])
    .map((code) => code.trim().toLowerCase())
    .filter(Boolean);

  if (normalized.length) {
    return [...new Set(normalized)];
  }

  return [...GODOMALL_DEFAULT_ORDER_STATUSES];
}

export function validateGodomallApiEnvelope(envelope: Record<string, unknown>, httpStatus: number): void {
  const code = pickString(envelope, [GODOMALL_ORDER_SEARCH_SPEC.responseCodeKey, 'code']);

  if (code === GODOMALL_IP_WHITELIST_ERROR_CODE) {
    throw new Error(
      `NHN에 엑클로드 호출 IP ${EXCLOAD_GODOMALL_OUTBOUND_IP} 등록이 필요합니다. (고도몰 Open API 코드 996)`,
    );
  }

  if (code && code !== GODOMALL_ORDER_SEARCH_SPEC.successCode) {
    const msg = pickString(envelope, [GODOMALL_ORDER_SEARCH_SPEC.responseMessageKey, 'msg']);
    throw new Error(msg || `고도몰 API 오류 (code=${code})`);
  }

  if (httpStatus >= 200 && httpStatus < 300) {
    return;
  }

  if (httpStatus === 401 || httpStatus === 403) {
    throw new Error('고도몰 API 인증에 실패했습니다. partner_key·user key를 확인해 주세요.');
  }

  throw new Error(`고도몰 API 호출에 실패했습니다. (HTTP ${httpStatus})`);
}

function buildOrderSearchXml(input: {
  credentials: GodomallCredentials;
  fields: Record<string, string | number | undefined>;
}): string {
  const partnerKey = resolveGodomallPartnerKey(input.credentials.partnerKey);

  return buildGodomallRequestXml({
    partner_key: partnerKey,
    key: input.credentials.userKey,
    ...input.fields,
  });
}

export async function godomallOrderSearchRequest(input: {
  credentials: GodomallCredentials;
  fields: Record<string, string | number | undefined>;
}): Promise<GodomallOrderSearchPage> {
  if (!isIntegrationProxyConfigured()) {
    throw new Error('고도몰 API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.');
  }

  assertIntegrationProxyConfigReady();

  const body = buildOrderSearchXml(input);

  const { httpStatus, bodyText } = await invokeIntegrationHttp({
    method: GODOMALL_ORDER_SEARCH_SPEC.method,
    url: GODOMALL_ORDER_SEARCH_URL,
    headers: {
      'Content-Type': GODOMALL_ORDER_SEARCH_SPEC.contentType,
      Accept: 'application/xml, text/xml, */*',
    },
    body,
  });

  const envelope = parseGodomallResponseXml(bodyText);
  validateGodomallApiEnvelope(envelope, httpStatus);

  const code = pickString(envelope, [GODOMALL_ORDER_SEARCH_SPEC.responseCodeKey, 'code']);
  const msg = pickString(envelope, [GODOMALL_ORDER_SEARCH_SPEC.responseMessageKey, 'msg']);
  const lastOrderRaw = pickString(envelope, [GODOMALL_ORDER_SEARCH_SPEC.responseLastOrderKey, 'lastOrder']);
  const hasMore = lastOrderRaw.toLowerCase() === 'true';

  return {
    code,
    msg,
    hasMore,
    orders: asRecordArray(envelope.order_data),
  };
}

function normalizeOrderProductRow(input: {
  order: Record<string, unknown>;
  orderInfo: Record<string, unknown>;
  goods: Record<string, unknown>;
}): GodomallOrderRecord | null {
  const orderNo = pickString(input.order, ['orderNo']);
  if (!orderNo) return null;

  const orderGoodsSno = pickString(input.goods, ['sno', 'orderCd']) || '1';
  const receiverPhone =
    pickString(input.orderInfo, ['receiverCellPhone', 'receiverPhone']) ||
    pickString(input.orderInfo, ['orderCellPhone', 'orderPhone']);

  const payAmt =
    pickString(input.goods, ['goodsPrice']) ||
    pickString(input.order, ['totalGoodsPrice', 'settlePrice']);

  return {
    orderNo,
    orderGoodsSno,
    orderStatus:
      pickString(input.goods, ['orderStatus']) || pickString(input.order, ['orderStatus']),
    orderDate: pickString(input.order, ['orderDate']),
    paymentDt: pickString(input.goods, ['paymentDt']) || pickString(input.order, ['paymentDt']),
    receiverName: pickString(input.orderInfo, ['receiverName', 'orderName']),
    receiverPhone,
    receiverZip: pickString(input.orderInfo, ['receiverZipcode', 'receiverZonecode']),
    receiverAddr1: pickString(input.orderInfo, ['receiverAddress']),
    receiverAddr2: pickString(input.orderInfo, ['receiverAddressSub']),
    deliveryMemo: pickString(input.orderInfo, ['orderMemo', 'deliveryMemo']),
    productName: pickString(input.goods, ['goodsNm', 'orderGoodsNm']),
    orderQty: pickString(input.goods, ['goodsCnt']) || '1',
    payAmt,
    raw: {
      order: input.order,
      orderInfo: input.orderInfo,
      goods: input.goods,
    },
  };
}

export function flattenGodomallOrderRows(orders: Record<string, unknown>[]): GodomallOrderRecord[] {
  const rows: GodomallOrderRecord[] = [];

  for (const order of orders) {
    const orderInfoList = asRecordArray(order.orderInfoData);
    const orderInfo = orderInfoList[0] ?? {};
    const goodsList = asRecordArray(order.orderGoodsData);

    if (goodsList.length) {
      for (const goods of goodsList) {
        const normalized = normalizeOrderProductRow({ order, orderInfo, goods });
        if (normalized) rows.push(normalized);
      }
      continue;
    }

    const normalized = normalizeOrderProductRow({ order, orderInfo, goods: {} });
    if (normalized) rows.push(normalized);
  }

  return dedupeGodomallOrders(rows);
}

function dedupeGodomallOrders(orders: GodomallOrderRecord[]): GodomallOrderRecord[] {
  const seen = new Set<string>();
  const result: GodomallOrderRecord[] = [];

  for (const order of orders) {
    const key = `${order.orderNo}|${order.orderGoodsSno}|${order.orderStatus}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(order);
  }

  return result;
}

export async function fetchGodomallOrdersPage(input: {
  credentials: GodomallCredentials;
  start: Date;
  end: Date;
  orderStatus?: GodomallOrderStatusCode | string;
  size?: number;
  lastOrder?: string;
}): Promise<GodomallOrderSearchPage & { records: GodomallOrderRecord[] }> {
  const fields: Record<string, string | number | undefined> = {
    dateType: GODOMALL_ORDER_SEARCH_SPEC.dateType,
    startDate: formatGodomallApiDate(input.start),
    endDate: formatGodomallApiDate(input.end),
    size: input.size ?? GODOMALL_DEFAULT_PAGE_SIZE,
  };

  if (input.orderStatus) {
    fields.orderStatus = input.orderStatus;
  }

  if (input.credentials.mallSno) {
    fields.mallSno = input.credentials.mallSno;
  }

  if (input.lastOrder) {
    fields.lastOrder = input.lastOrder;
  }

  const page = await godomallOrderSearchRequest({
    credentials: input.credentials,
    fields,
  });

  return {
    ...page,
    records: flattenGodomallOrderRows(page.orders),
  };
}

function getLastOrderCursor(orders: Record<string, unknown>[]): string | undefined {
  const orderNos = orders
    .map((order) => pickString(order, ['orderNo']))
    .filter(Boolean)
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  return orderNos[0];
}

async function fetchGodomallOrdersForStatus(input: {
  credentials: GodomallCredentials;
  start: Date;
  end: Date;
  orderStatus: string;
}): Promise<GodomallOrderRecord[]> {
  const collected: GodomallOrderRecord[] = [];
  let lastOrder: string | undefined;
  let hasMore = true;
  let guard = 0;

  while (hasMore && guard < 100) {
    guard += 1;

    const page = await fetchGodomallOrdersPage({
      credentials: input.credentials,
      start: input.start,
      end: input.end,
      orderStatus: input.orderStatus,
      size: GODOMALL_DEFAULT_PAGE_SIZE,
      lastOrder,
    });

    collected.push(...page.records);

    if (!page.hasMore || !page.orders.length) {
      break;
    }

    const cursor = getLastOrderCursor(page.orders);
    if (!cursor || cursor === lastOrder) {
      break;
    }

    lastOrder = cursor;
    hasMore = page.hasMore;
  }

  return collected;
}

export async function fetchGodomallOrders(input: {
  credentials: GodomallCredentials;
  days?: number;
}): Promise<GodomallOrderRecord[]> {
  const days = input.days ?? 7;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const statuses = resolveGodomallOrderStatuses(input.credentials.orderStatuses);

  const collected: GodomallOrderRecord[] = [];

  for (const orderStatus of statuses) {
    const batch = await fetchGodomallOrdersForStatus({
      credentials: input.credentials,
      start,
      end,
      orderStatus,
    });
    collected.push(...batch);
  }

  return dedupeGodomallOrders(collected);
}

export async function testGodomallConnection(credentials: GodomallCredentials): Promise<{ ok: true }> {
  const end = new Date();
  const start = new Date(end.getTime() - 3 * 24 * 60 * 60 * 1000);

  await fetchGodomallOrdersPage({
    credentials,
    start,
    end,
    orderStatus: GODOMALL_DEFAULT_ORDER_STATUSES[0],
    size: 1,
  });

  return { ok: true };
}

export function toUserFacingGodomallErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '고도몰 연동 처리 중 오류가 발생했습니다.';
}
