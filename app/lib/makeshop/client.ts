import { assertIntegrationProxyConfigReady, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { invokeIntegrationHttp } from '@/app/lib/integration-proxy/http-transport';
import {
  EXCLOAD_MAKESHOP_OUTBOUND_IP,
  MAKESHOP_CONNECT_ORIGIN,
  MAKESHOP_DEFAULT_FETCH_DAYS,
  MAKESHOP_MAX_ROWS_PER_QUERY,
  MAKESHOP_OAUTH_SPEC,
  MAKESHOP_OAUTH_TOKEN_URL,
  MAKESHOP_ORDER_DELIVERY_PATH,
  MAKESHOP_ORDER_V2_PATH,
  MAKESHOP_ORDER_V2_SPEC,
  MAKESHOP_TOKEN_EXPIRES_SECONDS,
} from '@/app/lib/makeshop/api-spec';
import {
  resolveMakeshopClientId,
  resolveMakeshopClientSecret,
} from '@/app/lib/makeshop/oauth-credentials';

export { EXCLOAD_MAKESHOP_OUTBOUND_IP, MAKESHOP_CONNECT_ORIGIN };

export type MakeshopCredentials = {
  shopId: string;
  clientId?: string;
  clientSecret?: string;
};

export type MakeshopOrderRecord = {
  orderNo: string;
  orderItemNo: string;
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

type MakeshopApiEnvelope = {
  success?: boolean;
  code?: string;
  message?: string;
  operation?: string;
  data?: unknown;
  error?: string;
  error_description?: string;
};

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

const tokenCache = new Map<string, CachedToken>();

function pickString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  }
  if (typeof value === 'object') {
    return [value as Record<string, unknown>];
  }
  return [];
}

function extractDataList(data: unknown): Record<string, unknown>[] {
  if (!data) return [];
  if (Array.isArray(data)) return asRecordArray(data);

  if (typeof data === 'object') {
    const record = data as Record<string, unknown>;
    for (const key of ['list', 'orders', 'order_list', 'contents', 'items', 'rows']) {
      const nested = asRecordArray(record[key]);
      if (nested.length) return nested;
    }
    return asRecordArray(record);
  }

  return [];
}

export function parseMakeshopApiResponse(bodyText: string): MakeshopApiEnvelope {
  try {
    return JSON.parse(bodyText) as MakeshopApiEnvelope;
  } catch {
    throw new Error('메이크샵 API 응답 JSON 파싱에 실패했습니다.');
  }
}

export function formatMakeshopApiDate(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function buildBasicAuthHeader(clientId: string, clientSecret: string): string {
  const encoded = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');
  return `Basic ${encoded}`;
}

function tokenCacheKey(credentials: MakeshopCredentials): string {
  const clientId = resolveMakeshopClientId(credentials.clientId);
  return `${clientId}|${credentials.shopId.trim()}`;
}

export function mapMakeshopOAuthError(error: string, description?: string): string {
  const normalized = error.trim().toLowerCase();

  if (normalized === 'invalid_client') {
    return '메이크샵 Client ID/Client Secret 인증에 실패했습니다. APP 개발 정보와 env(MAKESHOP_CLIENT_ID/SECRET)를 확인해 주세요.';
  }

  if (normalized === 'invalid_request') {
    return description?.trim() || '메이크샵 OAuth 요청 형식이 올바르지 않습니다. shop_uid를 확인해 주세요.';
  }

  if (normalized === 'unsupported_grant_type') {
    return '메이크샵 OAuth grant_type이 지원되지 않습니다.';
  }

  if (normalized === 'too_many_request') {
    return '메이크샵 OAuth 토큰 요청 횟수 제한(1분 5회)을 초과했습니다. 잠시 후 다시 시도해 주세요.';
  }

  return description?.trim() || `메이크샵 OAuth 오류 (${error})`;
}

export function mapMakeshopApiError(input: {
  httpStatus: number;
  envelope?: MakeshopApiEnvelope;
  bodyText?: string;
}): string {
  const envelope = input.envelope;
  const code = envelope?.code?.trim().toUpperCase() ?? '';
  const message = envelope?.message?.trim() ?? '';
  const operation = envelope?.operation?.trim().toLowerCase() ?? '';
  const combined = `${message} ${envelope?.error_description ?? ''} ${envelope?.error ?? ''}`.toLowerCase();

  if (envelope?.error) {
    return mapMakeshopOAuthError(envelope.error, envelope.error_description);
  }

  if (
    combined.includes('ip') ||
    combined.includes('9009') ||
    combined.includes('허가된 ip') ||
    combined.includes('접근 허용')
  ) {
    return `메이크샵 APP 접근 허용 IP에 엑클로드 호출 IP ${EXCLOAD_MAKESHOP_OUTBOUND_IP} 등록이 필요합니다.`;
  }

  if (
    operation.includes('installed_app') ||
    combined.includes('not installed') ||
    combined.includes('install') ||
    combined.includes('앱') ||
    combined.includes('app')
  ) {
    if (combined.includes('install') || combined.includes('앱') || combined.includes('app')) {
      return '메이크샵 APP이 해당 쇼핑몰에 설치되지 않았거나 만료되었습니다. 샵스토어에서 APP 설치·scope 동의를 확인해 주세요.';
    }
  }

  if (
    combined.includes('shop') ||
    combined.includes('shop_uid') ||
    combined.includes('shopid') ||
    combined.includes('상점')
  ) {
    if (input.httpStatus === 404 || combined.includes('not found') || combined.includes('없')) {
      return 'shop_uid(상점 ID)가 올바르지 않거나 존재하지 않습니다.';
    }
  }

  if (code && code !== MAKESHOP_ORDER_V2_SPEC.successCode) {
    if (message) return message;
    return `메이크샵 API 오류 (code=${code})`;
  }

  if (input.httpStatus === 401 || input.httpStatus === 403) {
    return '메이크샵 API 인증에 실패했습니다. APP 설치·scope·Client Secret을 확인해 주세요.';
  }

  if (message) return message;

  return `메이크샵 API 호출에 실패했습니다. (HTTP ${input.httpStatus})`;
}

export function validateMakeshopApiEnvelope(envelope: MakeshopApiEnvelope, httpStatus: number): void {
  if (envelope.error) {
    throw new Error(mapMakeshopOAuthError(envelope.error, envelope.error_description));
  }

  if (envelope.success === false) {
    throw new Error(mapMakeshopApiError({ httpStatus, envelope }));
  }

  const code = envelope.code?.trim().toUpperCase();
  if (code && code !== MAKESHOP_ORDER_V2_SPEC.successCode) {
    throw new Error(mapMakeshopApiError({ httpStatus, envelope }));
  }

  if (httpStatus >= 200 && httpStatus < 300) {
    return;
  }

  throw new Error(mapMakeshopApiError({ httpStatus, envelope }));
}

export async function fetchMakeshopAccessToken(credentials: MakeshopCredentials): Promise<string> {
  const cacheKey = tokenCacheKey(credentials);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAtMs > Date.now() + 10_000) {
    return cached.accessToken;
  }

  const clientId = resolveMakeshopClientId(credentials.clientId);
  const clientSecret = resolveMakeshopClientSecret(credentials.clientSecret);
  const shopId = credentials.shopId.trim();

  if (!shopId) {
    throw new Error('shop_uid(상점 ID)는 필수입니다.');
  }

  const body = new URLSearchParams({
    grant_type: MAKESHOP_OAUTH_SPEC.grantType,
    shop_uid: shopId,
  }).toString();

  const { httpStatus, bodyText } = await invokeIntegrationHttp({
    method: MAKESHOP_OAUTH_SPEC.method,
    url: MAKESHOP_OAUTH_TOKEN_URL,
    headers: {
      Authorization: buildBasicAuthHeader(clientId, clientSecret),
      'Content-Type': MAKESHOP_OAUTH_SPEC.contentType,
      Accept: 'application/json',
    },
    body,
  });

  const envelope = parseMakeshopApiResponse(bodyText);

  if (httpStatus >= 400 || envelope.error) {
    throw new Error(mapMakeshopApiError({ httpStatus, envelope, bodyText }));
  }

  validateMakeshopApiEnvelope(envelope, httpStatus);

  const data = envelope.data;
  const accessToken =
    typeof data === 'object' && data && !Array.isArray(data)
      ? pickString(data as Record<string, unknown>, ['access_token', 'accessToken'])
      : '';

  if (!accessToken) {
    throw new Error('메이크샵 OAuth 응답에 access_token이 없습니다.');
  }

  const expiresIn =
    typeof data === 'object' && data && !Array.isArray(data)
      ? Number(pickString(data as Record<string, unknown>, ['expires_in', 'expiresIn'])) ||
        MAKESHOP_TOKEN_EXPIRES_SECONDS
      : MAKESHOP_TOKEN_EXPIRES_SECONDS;

  tokenCache.set(cacheKey, {
    accessToken,
    expiresAtMs: Date.now() + expiresIn * 1000,
  });

  return accessToken;
}

function buildMakeshopApiUrl(pathTemplate: string, shopId: string, query?: Record<string, string>): string {
  const path = pathTemplate.replace(':shopId', encodeURIComponent(shopId.trim()));
  const url = new URL(`${MAKESHOP_CONNECT_ORIGIN}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value.trim()) url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export async function makeshopApiRequest(input: {
  credentials: MakeshopCredentials;
  pathTemplate: string;
  query?: Record<string, string>;
}): Promise<MakeshopApiEnvelope> {
  if (!isIntegrationProxyConfigured()) {
    throw new Error('메이크샵 API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.');
  }

  assertIntegrationProxyConfigReady();

  const accessToken = await fetchMakeshopAccessToken(input.credentials);
  const url = buildMakeshopApiUrl(input.pathTemplate, input.credentials.shopId, input.query);

  const { httpStatus, bodyText } = await invokeIntegrationHttp({
    method: MAKESHOP_ORDER_V2_SPEC.method,
    url,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  const envelope = parseMakeshopApiResponse(bodyText);

  if (httpStatus >= 400 || envelope.error || envelope.success === false) {
    throw new Error(mapMakeshopApiError({ httpStatus, envelope, bodyText }));
  }

  validateMakeshopApiEnvelope(envelope, httpStatus);
  return envelope;
}

function normalizeOrderProductRow(input: {
  order: Record<string, unknown>;
  product: Record<string, unknown>;
  delivery?: Record<string, unknown>;
}): MakeshopOrderRecord | null {
  const orderNo =
    pickString(input.order, ['order_no', 'orderNo', 'ordernum', 'order_num', 'order_id']) ||
    pickString(input.product, ['order_no', 'orderNo', 'ordernum', 'order_num']);

  if (!orderNo) return null;

  const orderItemNo =
    pickString(input.product, ['basket_no', 'basketNo', 'item_no', 'itemNo', 'order_item_no', 'sno']) ||
    '1';

  const delivery = input.delivery ?? {};

  const receiverName =
    pickString(delivery, ['receiver_name', 'receiverName', 'receiver', 'name']) ||
    pickString(input.order, ['receiver_name', 'receiverName', 'receiver']);

  const receiverPhone =
    pickString(delivery, ['receiver_mobile', 'receiver_phone', 'receiverPhone', 'mobile', 'phone']) ||
    pickString(input.order, ['receiver_mobile', 'receiver_phone', 'receiverPhone']);

  const receiverAddr1 =
    pickString(delivery, ['receiver_address', 'receiverAddress', 'address', 'addr1']) ||
    pickString(input.order, ['receiver_address', 'receiverAddress']);

  const receiverAddr2 =
    pickString(delivery, ['receiver_address_detail', 'receiverAddressSub', 'address_detail', 'addr2']) ||
    pickString(input.order, ['receiver_address_detail', 'receiverAddressSub']);

  const payAmt =
    pickString(input.product, ['product_price', 'sellprice', 'price', 'pay_price', 'payPrice']) ||
    pickString(input.order, ['pay_price', 'payPrice', 'total_price', 'totalPrice']);

  return {
    orderNo,
    orderItemNo,
    orderStatus:
      pickString(input.product, ['basket_status', 'basketStatus', 'order_status', 'orderStatus', 'status']) ||
      pickString(input.order, ['order_status', 'orderStatus', 'status']),
    orderDate:
      pickString(input.order, ['order_date', 'orderDate', 'order_ymdt', 'orderYmdt', 'reg_date', 'created_at']) ||
      pickString(input.product, ['order_date', 'orderDate']),
    paymentDt:
      pickString(input.order, ['pay_date', 'payDate', 'payment_date', 'paymentDate', 'pay_ymdt']) ||
      pickString(input.product, ['pay_date', 'payDate']),
    receiverName,
    receiverPhone,
    receiverZip:
      pickString(delivery, ['receiver_zip', 'receiverZip', 'zipcode', 'post']) ||
      pickString(input.order, ['receiver_zip', 'receiverZip']),
    receiverAddr1,
    receiverAddr2,
    deliveryMemo:
      pickString(delivery, ['delivery_memo', 'deliveryMemo', 'order_memo', 'memo']) ||
      pickString(input.order, ['delivery_memo', 'deliveryMemo', 'order_memo']),
    productName:
      pickString(input.product, ['product_name', 'productName', 'goods_name', 'goodsName', 'name']) ||
      pickString(input.order, ['product_name', 'productName']),
    orderQty:
      pickString(input.product, ['quantity', 'qty', 'order_cnt', 'orderCnt', 'product_qty']) || '1',
    payAmt,
    raw: {
      order: input.order,
      product: input.product,
      delivery,
    },
  };
}

function extractProductRows(order: Record<string, unknown>): Record<string, unknown>[] {
  for (const key of ['products', 'order_products', 'orderProducts', 'basket', 'items', 'goods']) {
    const rows = asRecordArray(order[key]);
    if (rows.length) return rows;
  }
  return [order];
}

export function flattenMakeshopOrderRows(
  orders: Record<string, unknown>[],
  deliveryByOrderNo?: Map<string, Record<string, unknown>>,
): MakeshopOrderRecord[] {
  const rows: MakeshopOrderRecord[] = [];

  for (const order of orders) {
    const orderNo = pickString(order, ['order_no', 'orderNo', 'ordernum', 'order_num', 'order_id']);
    const delivery = orderNo && deliveryByOrderNo?.get(orderNo) ? deliveryByOrderNo.get(orderNo) : undefined;

    for (const product of extractProductRows(order)) {
      const normalized = normalizeOrderProductRow({ order, product, delivery });
      if (normalized) rows.push(normalized);
    }
  }

  return dedupeMakeshopOrders(rows);
}

function dedupeMakeshopOrders(orders: MakeshopOrderRecord[]): MakeshopOrderRecord[] {
  const seen = new Set<string>();
  const result: MakeshopOrderRecord[] = [];

  for (const order of orders) {
    const key = `${order.orderNo}|${order.orderItemNo}|${order.orderStatus}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(order);
  }

  return result;
}

function buildDeliveryMap(deliveries: Record<string, unknown>[]): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();

  for (const delivery of deliveries) {
    const orderNo = pickString(delivery, ['order_no', 'orderNo', 'ordernum', 'order_num', 'order_id']);
    if (orderNo) map.set(orderNo, delivery);
  }

  return map;
}

export async function fetchMakeshopOrdersForDateRange(input: {
  credentials: MakeshopCredentials;
  start: Date;
  end: Date;
  limit?: number;
}): Promise<MakeshopOrderRecord[]> {
  const startDate = formatMakeshopApiDate(input.start);
  const endDate = formatMakeshopApiDate(input.end);
  const limit = String(input.limit ?? MAKESHOP_MAX_ROWS_PER_QUERY);

  const query = {
    [MAKESHOP_ORDER_V2_SPEC.dateParamStart]: startDate,
    [MAKESHOP_ORDER_V2_SPEC.dateParamEnd]: endDate,
    limit,
  };

  const orderEnvelope = await makeshopApiRequest({
    credentials: input.credentials,
    pathTemplate: MAKESHOP_ORDER_V2_PATH,
    query,
  });

  const orders = extractDataList(orderEnvelope.data);

  let deliveryMap = new Map<string, Record<string, unknown>>();
  try {
    const deliveryEnvelope = await makeshopApiRequest({
      credentials: input.credentials,
      pathTemplate: MAKESHOP_ORDER_DELIVERY_PATH,
      query,
    });
    deliveryMap = buildDeliveryMap(extractDataList(deliveryEnvelope.data));
  } catch {
    // 배송지 API 실패 시 주문 본문만 사용
  }

  return flattenMakeshopOrderRows(orders, deliveryMap);
}

function splitDateRangeByDay(start: Date, end: Date): Array<{ start: Date; end: Date }> {
  const ranges: Array<{ start: Date; end: Date }> = [];
  const cursor = new Date(start.getTime());

  while (cursor.getTime() <= end.getTime()) {
    const dayStart = new Date(cursor.getTime());
    const dayEnd = new Date(cursor.getTime());
    ranges.push({ start: dayStart, end: dayEnd });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return ranges;
}

export async function fetchMakeshopOrders(input: {
  credentials: MakeshopCredentials;
  days?: number;
}): Promise<MakeshopOrderRecord[]> {
  const days = input.days ?? MAKESHOP_DEFAULT_FETCH_DAYS;
  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

  const collected: MakeshopOrderRecord[] = [];

  for (const range of splitDateRangeByDay(start, end)) {
    const batch = await fetchMakeshopOrdersForDateRange({
      credentials: input.credentials,
      start: range.start,
      end: range.end,
    });
    collected.push(...batch);
  }

  return dedupeMakeshopOrders(collected);
}

export async function testMakeshopConnection(credentials: MakeshopCredentials): Promise<{ ok: true }> {
  const end = new Date();
  const start = new Date(end.getTime() - 2 * 24 * 60 * 60 * 1000);

  await fetchMakeshopAccessToken(credentials);
  await fetchMakeshopOrdersForDateRange({
    credentials,
    start,
    end,
    limit: 1,
  });

  return { ok: true };
}

export function toUserFacingMakeshopErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '메이크샵 연동 처리 중 오류가 발생했습니다.';
}

/** 테스트용 — 토큰 캐시 초기화 */
export function clearMakeshopTokenCacheForTests(): void {
  tokenCache.clear();
}
