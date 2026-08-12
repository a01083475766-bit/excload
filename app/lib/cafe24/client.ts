import { assertIntegrationProxyConfigReady, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { invokeIntegrationHttp } from '@/app/lib/integration-proxy/http-transport';
import { assertValidCafe24MallId, buildCafe24ApiOrigin } from '@/app/lib/cafe24/mall-id';
import { CAFE24_OAUTH_REDIRECT_URI, CAFE24_OAUTH_SCOPES } from '@/app/lib/cafe24/constants';
import { listMissingCafe24Scopes } from '@/app/lib/cafe24/scopes';

export { CAFE24_OAUTH_REDIRECT_URI, CAFE24_OAUTH_SCOPES } from '@/app/lib/cafe24/constants';
export { CAFE24_REQUIRED_SCOPES, CAFE24_TRACKING_NO_MAX_LENGTH } from '@/app/lib/cafe24/constants';
export {
  hasAllCafe24RequiredScopes,
  listMissingCafe24Scopes,
  normalizeCafe24ScopeList,
} from '@/app/lib/cafe24/scopes';

export type Cafe24ClientCredentials = {
  mallId: string;
  clientId: string;
  clientSecret: string;
};

export type Cafe24TokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scopes?: string[];
};

export type Cafe24OrderReceiver = {
  name?: string;
  cellphone?: string;
  phone?: string;
  zipcode?: string;
  address1?: string;
  address2?: string;
  shipping_message?: string;
};

export type Cafe24OrderItem = {
  order_item_code?: string;
  product_name?: string;
  product_code?: string;
  option_value?: string;
  quantity?: number | string;
  /** 품목 단위 상태(있으면 주문 단위 order_status보다 우선). */
  order_status?: string;
};

export type Cafe24OrderBuyer = {
  name?: string;
  cellphone?: string;
  phone?: string;
  email?: string;
};

export type Cafe24Order = {
  shop_no?: number | string;
  order_id?: string;
  order_date?: string;
  payment_date?: string;
  order_status?: string;
  payment_amount?: string | number;
  paid?: string;
  shipping_message?: string;
  receivers?: Cafe24OrderReceiver[];
  items?: Cafe24OrderItem[];
  buyer?: Cafe24OrderBuyer;
};

function encodeBasicAuth(clientId: string, clientSecret: string): string {
  return Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');
}

function parseCafe24ErrorMessage(bodyText: string): string | null {
  try {
    const parsed = JSON.parse(bodyText) as { error?: string; error_description?: string; message?: string };
    if (parsed.error_description) return parsed.error_description;
    if (parsed.message) return parsed.message;
    if (parsed.error) return `카페24 API 오류 (${parsed.error})`;
  } catch {
    // ignore
  }
  return null;
}

function assertCafe24HttpSuccess(httpStatus: number, bodyText: string): void {
  if (httpStatus >= 200 && httpStatus < 300) return;

  const apiError = parseCafe24ErrorMessage(bodyText);
  if (apiError) throw new Error(apiError);

  if (httpStatus === 401 || httpStatus === 403) {
    throw new Error('카페24 OAuth 인증에 실패했습니다. 연동을 다시 진행해 주세요.');
  }

  throw new Error(`카페24 API 호출에 실패했습니다. (HTTP ${httpStatus})`);
}

/** 호출부에서 HTTP 상태별 분기할 때 사용. 토큰·본문 원문은 그대로 반환하되 로깅은 호출부 책임. */
export async function cafe24HttpRequestRaw(input: {
  mallId: string;
  method: string;
  pathWithQuery: string;
  headers?: Record<string, string>;
  body?: string;
  contentType?: string;
}): Promise<{ httpStatus: number; bodyText: string }> {
  if (!isIntegrationProxyConfigured()) {
    throw new Error('카페24 API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.');
  }

  assertIntegrationProxyConfigReady();
  assertValidCafe24MallId(input.mallId);

  const url = `${buildCafe24ApiOrigin(input.mallId)}${input.pathWithQuery}`;
  const headers: Record<string, string> = { ...(input.headers ?? {}) };

  if (input.body != null) {
    headers['Content-Type'] = input.contentType ?? 'application/x-www-form-urlencoded';
  }

  return invokeIntegrationHttp({
    method: input.method,
    url,
    headers,
    body: input.body ?? null,
  });
}

export async function cafe24HttpRequest(input: {
  mallId: string;
  method: string;
  pathWithQuery: string;
  headers?: Record<string, string>;
  body?: string;
  contentType?: string;
}): Promise<string> {
  const { httpStatus, bodyText } = await cafe24HttpRequestRaw(input);
  assertCafe24HttpSuccess(httpStatus, bodyText);
  return bodyText;
}

export function buildCafe24AuthorizeUrl(input: {
  mallId: string;
  clientId: string;
  state: string;
  scopes?: string;
}): string {
  const mallId = assertValidCafe24MallId(input.mallId);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: input.clientId.trim(),
    state: input.state,
    redirect_uri: CAFE24_OAUTH_REDIRECT_URI,
    scope: input.scopes ?? CAFE24_OAUTH_SCOPES,
  });

  return `${buildCafe24ApiOrigin(mallId)}/api/v2/oauth/authorize?${params.toString()}`;
}

/**
 * 토큰 응답을 파싱하고, 저장된 mallId·clientId·필수 scope와 일치할 때만 반환한다.
 * 불일치·권한 부족 시 토큰을 저장하지 않도록 호출부에서 throw로 실패 처리한다.
 */
export function parseAndValidateCafe24TokenResponse(
  bodyText: string,
  expected: { mallId: string; clientId: string },
): Cafe24TokenSet {
  let parsed: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: string;
    scopes?: string[];
    mall_id?: string;
    client_id?: string;
  };

  try {
    parsed = JSON.parse(bodyText) as typeof parsed;
  } catch {
    throw new Error('카페24 토큰 응답을 해석하지 못했습니다.');
  }

  if (!parsed.access_token || !parsed.refresh_token || !parsed.expires_at) {
    throw new Error('카페24 토큰 응답에 필수 필드가 없습니다.');
  }

  const expectedMallId = assertValidCafe24MallId(expected.mallId);
  const responseMallId = String(parsed.mall_id ?? '').trim().toLowerCase();
  if (!responseMallId || responseMallId !== expectedMallId) {
    throw new Error('카페24 토큰의 mall_id가 저장된 쇼핑몰 ID와 일치하지 않습니다.');
  }

  const expectedClientId = expected.clientId.trim();
  const responseClientId = String(parsed.client_id ?? '').trim();
  if (!responseClientId || responseClientId !== expectedClientId) {
    throw new Error('카페24 토큰의 client_id가 저장된 Client ID와 일치하지 않습니다.');
  }

  const missingScopes = listMissingCafe24Scopes(parsed.scopes);
  if (missingScopes.length > 0) {
    throw new Error(
      `필수 권한이 부족하여 연동할 수 없습니다: ${missingScopes.join(', ')}. Developers 앱 Scope를 확인한 뒤 다시 연동해 주세요.`,
    );
  }

  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token,
    expiresAt: parsed.expires_at,
    scopes: parsed.scopes,
  };
}

export async function exchangeCafe24AuthorizationCode(input: {
  credentials: Cafe24ClientCredentials;
  code: string;
}): Promise<Cafe24TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code.trim(),
    redirect_uri: CAFE24_OAUTH_REDIRECT_URI,
  }).toString();

  const bodyText = await cafe24HttpRequest({
    mallId: input.credentials.mallId,
    method: 'POST',
    pathWithQuery: '/api/v2/oauth/token',
    headers: {
      Authorization: `Basic ${encodeBasicAuth(input.credentials.clientId, input.credentials.clientSecret)}`,
    },
    body,
  });

  return parseAndValidateCafe24TokenResponse(bodyText, {
    mallId: input.credentials.mallId,
    clientId: input.credentials.clientId,
  });
}

export async function refreshCafe24AccessToken(input: {
  credentials: Cafe24ClientCredentials;
  refreshToken: string;
}): Promise<Cafe24TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken.trim(),
  }).toString();

  const bodyText = await cafe24HttpRequest({
    mallId: input.credentials.mallId,
    method: 'POST',
    pathWithQuery: '/api/v2/oauth/token',
    headers: {
      Authorization: `Basic ${encodeBasicAuth(input.credentials.clientId, input.credentials.clientSecret)}`,
    },
    body,
  });

  return parseAndValidateCafe24TokenResponse(bodyText, {
    mallId: input.credentials.mallId,
    clientId: input.credentials.clientId,
  });
}

export function isCafe24AccessTokenExpired(expiresAt: string | Date | null | undefined, bufferMs = 5 * 60 * 1000): boolean {
  if (!expiresAt) return true;
  const expiry = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  if (Number.isNaN(expiry)) return true;
  return expiry - bufferMs <= Date.now();
}

export async function cafe24AuthorizedRequest<T>(input: {
  credentials: Cafe24ClientCredentials;
  accessToken: string;
  method: string;
  pathWithQuery: string;
}): Promise<T> {
  const bodyText = await cafe24HttpRequest({
    mallId: input.credentials.mallId,
    method: input.method,
    pathWithQuery: input.pathWithQuery,
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  try {
    return JSON.parse(bodyText) as T;
  } catch {
    throw new Error('카페24 API 응답을 해석하지 못했습니다.');
  }
}

export async function fetchCafe24TokenScopes(input: {
  credentials: Cafe24ClientCredentials;
  accessToken: string;
}): Promise<string[]> {
  const response = await cafe24AuthorizedRequest<{ scopes?: string[] }>({
    credentials: input.credentials,
    accessToken: input.accessToken,
    method: 'GET',
    pathWithQuery: '/api/v2/oauth/token/scopes',
  });

  return response.scopes ?? [];
}

export async function testCafe24Connection(input: {
  credentials: Cafe24ClientCredentials;
  accessToken: string;
}): Promise<{ ok: true; scopes: string[] }> {
  const scopes = await fetchCafe24TokenScopes(input);
  const missing = listMissingCafe24Scopes(scopes);
  if (missing.length > 0) {
    throw new Error(
      `카페24 권한이 부족합니다 (${missing.join(', ')}). 권한 추가를 위해 다시 연동해 주세요.`,
    );
  }
  return { ok: true, scopes };
}

function formatCafe24Date(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export async function fetchCafe24Orders(input: {
  credentials: Cafe24ClientCredentials;
  accessToken: string;
  days?: number;
}): Promise<Cafe24Order[]> {
  const days = input.days ?? 7;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  const query = new URLSearchParams({
    start_date: formatCafe24Date(start),
    end_date: formatCafe24Date(end),
    date_type: 'pay_date',
    payment_status: 'P',
    embed: 'receivers,items,buyer',
    limit: '100',
    offset: '0',
  });

  const collected: Cafe24Order[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    query.set('offset', String(offset));
    const response = await cafe24AuthorizedRequest<{ orders?: Cafe24Order[] }>({
      credentials: input.credentials,
      accessToken: input.accessToken,
      method: 'GET',
      pathWithQuery: `/api/v2/admin/orders?${query.toString()}`,
    });

    const batch = response.orders ?? [];
    collected.push(...batch);

    if (batch.length < limit) break;
    offset += limit;
    if (offset >= 1000) break;
  }

  return collected;
}

export type Cafe24Carrier = {
  shop_no?: number;
  carrier_id?: number | string;
  shipping_company_code?: string;
  shipping_company_name?: string;
  /** 일부 응답에서 별칭으로 올 수 있음 */
  company_name?: string;
};

export type Cafe24Shipment = {
  shop_no?: number;
  shipping_code?: string;
  order_id?: string;
  tracking_no?: string;
  shipping_company_code?: string;
  status?: string;
  order_item_code?: string | string[];
  items?: Array<{ order_item_code?: string }>;
};

export async function fetchCafe24Carriers(input: {
  credentials: Cafe24ClientCredentials;
  accessToken: string;
  shopNo?: number;
}): Promise<Cafe24Carrier[]> {
  const shopNo = input.shopNo && input.shopNo > 0 ? input.shopNo : 1;
  const query = new URLSearchParams({ shop_no: String(shopNo) });
  const response = await cafe24AuthorizedRequest<{ carriers?: Cafe24Carrier[] }>({
    credentials: input.credentials,
    accessToken: input.accessToken,
    method: 'GET',
    pathWithQuery: `/api/v2/admin/carriers?${query.toString()}`,
  });
  return response.carriers ?? [];
}

export async function fetchCafe24OrderShipments(input: {
  credentials: Cafe24ClientCredentials;
  accessToken: string;
  orderId: string;
  shopNo?: number;
}): Promise<Cafe24Shipment[]> {
  const orderId = encodeURIComponent(input.orderId.trim());
  const shopNo = input.shopNo && input.shopNo > 0 ? input.shopNo : 1;
  const query = new URLSearchParams({ shop_no: String(shopNo) });
  const response = await cafe24AuthorizedRequest<{ shipments?: Cafe24Shipment[] }>({
    credentials: input.credentials,
    accessToken: input.accessToken,
    method: 'GET',
    pathWithQuery: `/api/v2/admin/orders/${orderId}/shipments?${query.toString()}`,
  });
  return response.shipments ?? [];
}

export type Cafe24CreateShipmentRequest = {
  shop_no: number;
  request: {
    tracking_no: string;
    shipping_company_code: string;
    order_item_code: string[];
    status: 'shipping' | 'standby';
  };
};

export async function postCafe24OrderShipment(input: {
  credentials: Cafe24ClientCredentials;
  accessToken: string;
  orderId: string;
  body: Cafe24CreateShipmentRequest;
}): Promise<{ httpStatus: number; bodyText: string }> {
  const orderId = encodeURIComponent(input.orderId.trim());
  return cafe24HttpRequestRaw({
    mallId: input.credentials.mallId,
    method: 'POST',
    pathWithQuery: `/api/v2/admin/orders/${orderId}/shipments`,
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify(input.body),
    contentType: 'application/json',
  });
}

/** PUT /orders — 발주확인 대응: process_status=prepare (N10 → N20). prepareproduct 사용 금지. */
export type Cafe24PrepareOrderRequestItem = {
  order_id: string;
  process_status: 'prepare';
  /** 공식 스키마: 문자열 배열 */
  order_item_code: string[];
};

export async function putCafe24OrdersPrepare(input: {
  credentials: Cafe24ClientCredentials;
  accessToken: string;
  shopNo: number;
  requests: Cafe24PrepareOrderRequestItem[];
}): Promise<{ httpStatus: number; bodyText: string }> {
  if (!input.requests.length) {
    throw new Error('카페24 발주확인 요청 항목이 없습니다.');
  }
  if (input.requests.length > 100) {
    throw new Error('카페24 발주확인은 1회 최대 100건입니다.');
  }
  for (const req of input.requests) {
    if (req.process_status !== 'prepare') {
      throw new Error('카페24 발주확인은 process_status=prepare 만 허용합니다.');
    }
    if (!Array.isArray(req.order_item_code) || req.order_item_code.length === 0) {
      throw new Error('카페24 발주확인은 order_item_code 배열이 필요합니다.');
    }
  }
  const shopNo = input.shopNo;
  if (shopNo == null || !Number.isInteger(shopNo) || shopNo < 1) {
    throw new Error('카페24 shop_no가 올바르지 않습니다.');
  }
  return cafe24HttpRequestRaw({
    mallId: input.credentials.mallId,
    method: 'PUT',
    pathWithQuery: '/api/v2/admin/orders',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      shop_no: shopNo,
      requests: input.requests.map((req) => ({
        order_id: req.order_id,
        process_status: 'prepare' as const,
        order_item_code: [...req.order_item_code],
      })),
    }),
    contentType: 'application/json',
  });
}

export function toUserFacingCafe24ErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '카페24 연동 처리 중 오류가 발생했습니다.';
}

export function serializeCafe24TokenSet(tokens: Cafe24TokenSet): string {
  return JSON.stringify({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    scopes: tokens.scopes ?? [],
  });
}

export function parseCafe24TokenSet(raw: string): Cafe24TokenSet {
  const parsed = JSON.parse(raw) as Cafe24TokenSet;
  if (!parsed.accessToken || !parsed.refreshToken || !parsed.expiresAt) {
    throw new Error('저장된 카페24 토큰 정보가 올바르지 않습니다.');
  }
  return parsed;
}
