import { assertIntegrationProxyConfigReady, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { invokeIntegrationHttp } from '@/app/lib/integration-proxy/http-transport';
import {
  SHOPBY_DEFAULT_ORDER_REQUEST_TYPES,
  SHOPBY_DEFAULT_PAGE_SIZE,
  SHOPBY_ORDER_SEARCH_SPEC,
  SHOPBY_ORDERS_API_VERSION,
  SHOPBY_SERVER_API_ORIGIN,
  type ShopbyOrderRequestType,
} from '@/app/lib/shopby/api-spec';

export {
  SHOPBY_DEFAULT_ORDER_REQUEST_TYPES,
  SHOPBY_ORDER_SEARCH_SPEC,
  SHOPBY_ORDERS_API_VERSION,
  SHOPBY_SERVER_API_ORIGIN,
};

export type ShopbyCredentials = {
  systemKey: string;
  mallKey: string;
  /** 미입력 시 SHOPBY_DEFAULT_ORDER_REQUEST_TYPES */
  orderRequestTypes?: string[];
};

export type ShopbyOrderRecord = {
  orderNo: string;
  orderOptionNo: string;
  orderStatusType: string;
  productName: string;
  orderCnt: string;
  orderYmdt: string;
  payYmdt: string;
  receiverName: string;
  receiverPhone: string;
  receiverZip: string;
  receiverAddr1: string;
  receiverAddr2: string;
  deliveryMemo: string;
  payAmt: string;
  raw: Record<string, unknown>;
};

type ShopbyOrdersPage = {
  totalCount: number;
  contents: Record<string, unknown>[];
};

function formatShopbyApiDate(date: Date): string {
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

export function resolveShopbyOrderRequestTypes(input?: string[]): string[] {
  const normalized = (input ?? [])
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);

  if (normalized.length) {
    return [...new Set(normalized)];
  }

  return [...SHOPBY_DEFAULT_ORDER_REQUEST_TYPES];
}

function buildAuthHeaders(credentials: ShopbyCredentials): Record<string, string> {
  const { headerKeys } = SHOPBY_ORDER_SEARCH_SPEC;
  return {
    [headerKeys.version]: SHOPBY_ORDERS_API_VERSION,
    [headerKeys.systemKey]: credentials.systemKey.trim(),
    [headerKeys.mallKey]: credentials.mallKey.trim(),
    Accept: 'application/json',
  };
}

export function parseShopbyApiResponse(bodyText: string): Record<string, unknown> {
  try {
    return JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    throw new Error('샵바이 API 응답 JSON 파싱에 실패했습니다.');
  }
}

function assertShopbyHttpSuccess(httpStatus: number, bodyText: string): void {
  if (httpStatus >= 200 && httpStatus < 300) {
    return;
  }

  const message = parseShopbyErrorMessage(bodyText);
  if (message) throw new Error(message);

  if (httpStatus === 401 || httpStatus === 403) {
    throw new Error(
      '샵바이 API 인증에 실패했습니다. systemKey·mallKey·워크스페이스 앱 등록 상태를 확인해 주세요.',
    );
  }

  throw new Error(`샵바이 API 호출에 실패했습니다. (HTTP ${httpStatus})`);
}

function parseShopbyErrorMessage(bodyText: string): string | null {
  try {
    const parsed = JSON.parse(bodyText) as {
      message?: string;
      error?: string;
      code?: string;
    };
    if (parsed.message) return parsed.message;
    if (parsed.error) return parsed.error;
    if (parsed.code) return `샵바이 API 오류 (${parsed.code})`;
  } catch {
    // ignore
  }
  return null;
}

export async function shopbyApiRequest(input: {
  credentials: ShopbyCredentials;
  url: string;
}): Promise<Record<string, unknown>> {
  if (!isIntegrationProxyConfigured()) {
    throw new Error('샵바이 API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.');
  }

  assertIntegrationProxyConfigReady();

  const { httpStatus, bodyText } = await invokeIntegrationHttp({
    method: SHOPBY_ORDER_SEARCH_SPEC.method,
    url: input.url,
    headers: buildAuthHeaders(input.credentials),
  });

  assertShopbyHttpSuccess(httpStatus, bodyText);
  return parseShopbyApiResponse(bodyText);
}

function buildOrdersSearchUrl(input: {
  start: Date;
  end: Date;
  orderRequestTypes: string[];
  pageNumber: number;
  pageSize: number;
}): string {
  const url = new URL(`${SHOPBY_SERVER_API_ORIGIN}${SHOPBY_ORDER_SEARCH_SPEC.path}`);
  const { queryKeys } = SHOPBY_ORDER_SEARCH_SPEC;

  url.searchParams.set(queryKeys.startYmd, formatShopbyApiDate(input.start));
  url.searchParams.set(queryKeys.endYmd, formatShopbyApiDate(input.end));
  url.searchParams.set(queryKeys.orderRequestTypes, input.orderRequestTypes.join(','));
  url.searchParams.set(queryKeys.searchDateType, 'ORDER_START');
  url.searchParams.set(queryKeys.pageNumber, String(input.pageNumber));
  url.searchParams.set(queryKeys.pageSize, String(input.pageSize));

  return url.toString();
}

function parseOrdersPage(payload: Record<string, unknown>): ShopbyOrdersPage {
  const contentsKey = SHOPBY_ORDER_SEARCH_SPEC.responseContentsKey;
  const totalCountKey = SHOPBY_ORDER_SEARCH_SPEC.responseTotalCountKey;

  if (Array.isArray(payload)) {
    return {
      totalCount: payload.length,
      contents: payload.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')),
    };
  }

  const contents = payload[contentsKey];
  const totalCountRaw = payload[totalCountKey];

  return {
    totalCount: typeof totalCountRaw === 'number' ? totalCountRaw : Array.isArray(contents) ? contents.length : 0,
    contents: Array.isArray(contents)
      ? contents.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      : [],
  };
}

function normalizeOrderProductRow(input: {
  order: Record<string, unknown>;
  delivery: Record<string, unknown>;
  product: Record<string, unknown>;
}): ShopbyOrderRecord | null {
  const orderNo = pickString(input.order, ['orderNo']);
  if (!orderNo) return null;

  const orderOptionNo =
    pickString(input.product, ['orderOptionNo', 'optionNo', 'mallOptionNo']) || '1';

  const receiverPhone =
    pickString(input.delivery, ['receiverContact1', 'receiverMobileNumber', 'receiverPhoneNumber']) ||
    pickString(input.order, ['ordererContact1', 'ordererMobileNumber']);

  const addrMain =
    pickString(input.delivery, ['receiverAddress', 'receiverJibunAddress', 'deliveryInfo']) ||
    pickString(input.order, ['receiverAddress']);

  const payAmt =
    pickString(input.product, ['adjustedAmt', 'salePrice', 'payAmt']) ||
    pickString(input.order, ['firstPayAmt', 'lastPayAmt', 'payAmt']);

  return {
    orderNo,
    orderOptionNo,
    orderStatusType: pickString(input.product, ['orderStatusType', 'orderRequestType', 'claimStatusType']),
    productName: pickString(input.product, ['productName', 'productNameEn']),
    orderCnt: pickString(input.product, ['orderCnt', 'orderCount']) || '1',
    orderYmdt: pickString(input.order, ['orderYmdt', 'orderDate']),
    payYmdt: pickString(input.order, ['firstPayYmdt', 'payYmdt', 'paymentYmdt']),
    receiverName: pickString(input.delivery, ['receiverName']) || pickString(input.order, ['ordererName']),
    receiverPhone,
    receiverZip: pickString(input.delivery, ['receiverZipCd', 'receiverZip']),
    receiverAddr1: addrMain,
    receiverAddr2: pickString(input.delivery, ['receiverDetailAddress', 'receiverAddressDetail']),
    deliveryMemo: pickString(input.delivery, ['deliveryMemo', 'orderMemo']) || pickString(input.order, ['orderMemo']),
    payAmt,
    raw: {
      order: input.order,
      delivery: input.delivery,
      product: input.product,
    },
  };
}

function flattenShopbyOrder(order: Record<string, unknown>): ShopbyOrderRecord[] {
  const rows: ShopbyOrderRecord[] = [];
  const deliveryGroups = order.deliveryGroups;

  if (Array.isArray(deliveryGroups) && deliveryGroups.length) {
    for (const groupEntry of deliveryGroups) {
      if (!groupEntry || typeof groupEntry !== 'object') continue;
      const delivery = groupEntry as Record<string, unknown>;
      const orderProducts = delivery.orderProducts;

      if (Array.isArray(orderProducts) && orderProducts.length) {
        for (const productEntry of orderProducts) {
          if (!productEntry || typeof productEntry !== 'object') continue;
          const normalized = normalizeOrderProductRow({
            order,
            delivery,
            product: productEntry as Record<string, unknown>,
          });
          if (normalized) rows.push(normalized);
        }
        continue;
      }

      const normalized = normalizeOrderProductRow({ order, delivery, product: {} });
      if (normalized) rows.push(normalized);
    }
  }

  if (rows.length) return rows;

  const normalized = normalizeOrderProductRow({ order, delivery: {}, product: {} });
  return normalized ? [normalized] : [];
}

export function mapRawShopbyOrders(contents: Record<string, unknown>[]): ShopbyOrderRecord[] {
  const rows: ShopbyOrderRecord[] = [];

  for (const order of contents) {
    rows.push(...flattenShopbyOrder(order));
  }

  return dedupeShopbyOrders(rows);
}

function dedupeShopbyOrders(orders: ShopbyOrderRecord[]): ShopbyOrderRecord[] {
  const seen = new Set<string>();
  const result: ShopbyOrderRecord[] = [];

  for (const order of orders) {
    const key = `${order.orderNo}|${order.orderOptionNo}|${order.orderStatusType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(order);
  }

  return result;
}

export async function fetchShopbyOrdersPage(input: {
  credentials: ShopbyCredentials;
  start: Date;
  end: Date;
  pageNumber: number;
  pageSize?: number;
  orderRequestTypes?: ShopbyOrderRequestType[] | string[];
}): Promise<ShopbyOrdersPage> {
  const url = buildOrdersSearchUrl({
    start: input.start,
    end: input.end,
    orderRequestTypes: resolveShopbyOrderRequestTypes(input.orderRequestTypes ?? input.credentials.orderRequestTypes),
    pageNumber: input.pageNumber,
    pageSize: input.pageSize ?? SHOPBY_DEFAULT_PAGE_SIZE,
  });

  const payload = await shopbyApiRequest({ credentials: input.credentials, url });
  const page = parseOrdersPage(payload);

  return {
    totalCount: page.totalCount,
    contents: page.contents,
  };
}

export async function fetchShopbyOrders(input: {
  credentials: ShopbyCredentials;
  days?: number;
}): Promise<ShopbyOrderRecord[]> {
  const days = input.days ?? 7;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const pageSize = SHOPBY_DEFAULT_PAGE_SIZE;
  const orderRequestTypes = resolveShopbyOrderRequestTypes(input.credentials.orderRequestTypes);

  const collected: ShopbyOrderRecord[] = [];
  let pageNumber = 1;

  for (;;) {
    const page = await fetchShopbyOrdersPage({
      credentials: input.credentials,
      start,
      end,
      pageNumber,
      pageSize,
      orderRequestTypes,
    });

    collected.push(...mapRawShopbyOrders(page.contents));

    if (page.contents.length < pageSize) {
      break;
    }

    pageNumber += 1;
    if (pageNumber > 100) {
      break;
    }
  }

  return dedupeShopbyOrders(collected);
}

export async function testShopbyConnection(credentials: ShopbyCredentials): Promise<{ ok: true }> {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  await fetchShopbyOrdersPage({
    credentials,
    start,
    end,
    pageNumber: 1,
    pageSize: 1,
  });

  return { ok: true };
}

export function toUserFacingShopbyErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '샵바이 연동 처리 중 오류가 발생했습니다.';
}
