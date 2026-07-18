import { assertIntegrationProxyConfigReady, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { invokeIntegrationHttp } from '@/app/lib/integration-proxy/http-transport';
import { assertValidCafe24MallId, buildCafe24ApiOrigin } from '@/app/lib/cafe24/mall-id';
import { CAFE24_OAUTH_REDIRECT_URI, CAFE24_OAUTH_SCOPES } from '@/app/lib/cafe24/constants';

export { CAFE24_OAUTH_REDIRECT_URI, CAFE24_OAUTH_SCOPES } from '@/app/lib/cafe24/constants';

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

export async function cafe24HttpRequest(input: {
  mallId: string;
  method: string;
  pathWithQuery: string;
  headers?: Record<string, string>;
  body?: string;
  contentType?: string;
}): Promise<string> {
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

  const { httpStatus, bodyText } = await invokeIntegrationHttp({
    method: input.method,
    url,
    headers,
    body: input.body ?? null,
  });

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

function parseTokenResponse(bodyText: string): Cafe24TokenSet {
  let parsed: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: string;
    scopes?: string[];
  };

  try {
    parsed = JSON.parse(bodyText) as typeof parsed;
  } catch {
    throw new Error('카페24 토큰 응답을 해석하지 못했습니다.');
  }

  if (!parsed.access_token || !parsed.refresh_token || !parsed.expires_at) {
    throw new Error('카페24 토큰 응답에 필수 필드가 없습니다.');
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

  return parseTokenResponse(bodyText);
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

  return parseTokenResponse(bodyText);
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
  if (!scopes.includes('mall.read_order')) {
    throw new Error('mall.read_order 권한이 없습니다. 카페24 App scope 설정을 확인해 주세요.');
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
