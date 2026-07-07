import { hashSync } from 'bcryptjs';
import { assertIntegrationProxyConfigReady, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { invokeIntegrationHttp } from '@/app/lib/integration-proxy/http-transport';

export const SMARTSTORE_API_ORIGIN = 'https://api.commerce.naver.com';
export const SMARTSTORE_TOKEN_PATH = '/external/v1/oauth2/token';
export const SMARTSTORE_TOKEN_URL = `${SMARTSTORE_API_ORIGIN}${SMARTSTORE_TOKEN_PATH}`;

export type SmartstoreAuthType = 'SELF' | 'SELLER';

export type SmartstoreCredentials = {
  clientId: string;
  clientSecret: string;
  authType: SmartstoreAuthType;
};

export function generateSmartstoreClientSecretSign(input: {
  clientId: string;
  clientSecret: string;
  timestamp: number;
}): string {
  const password = `${input.clientId}_${input.timestamp}`;
  const hashed = hashSync(password, input.clientSecret);
  return Buffer.from(hashed, 'utf8').toString('base64');
}

export function buildSmartstoreTokenRequestBody(credentials: SmartstoreCredentials): {
  body: string;
  timestamp: number;
} {
  const timestamp = Date.now();
  const clientSecretSign = generateSmartstoreClientSecretSign({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    timestamp,
  });

  const params = new URLSearchParams({
    client_id: credentials.clientId,
    timestamp: String(timestamp),
    client_secret_sign: clientSecretSign,
    grant_type: 'client_credentials',
    type: credentials.authType,
  });

  return {
    body: params.toString(),
    timestamp,
  };
}

export async function requestSmartstoreAccessToken(
  credentials: SmartstoreCredentials,
): Promise<{ accessToken: string; expiresIn?: number }> {
  if (!isIntegrationProxyConfigured()) {
    throw new Error('스마트스토어 API는 고정 IP 프록시 설정이 필요합니다.');
  }

  assertIntegrationProxyConfigReady();

  const { body } = buildSmartstoreTokenRequestBody(credentials);

  const { httpStatus, bodyText } = await invokeIntegrationHttp({
    method: 'POST',
    url: SMARTSTORE_TOKEN_URL,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (httpStatus < 200 || httpStatus >= 300) {
    throw new Error(parseSmartstoreErrorMessage(bodyText) ?? '스마트스토어 인증 토큰 발급에 실패했습니다.');
  }

  let parsed: { access_token?: string; expires_in?: number };
  try {
    parsed = JSON.parse(bodyText) as { access_token?: string; expires_in?: number };
  } catch {
    throw new Error('스마트스토어 인증 응답을 해석하지 못했습니다.');
  }

  if (!parsed.access_token) {
    throw new Error('스마트스토어 access_token이 응답에 없습니다.');
  }

  return {
    accessToken: parsed.access_token,
    expiresIn: parsed.expires_in,
  };
}

function parseSmartstoreErrorMessage(bodyText: string): string | null {
  try {
    const parsed = JSON.parse(bodyText) as { message?: string; code?: string };
    if (parsed.message) return parsed.message;
    if (parsed.code) return `스마트스토어 API 오류 (${parsed.code})`;
  } catch {
    // ignore
  }
  return null;
}

export async function smartstoreAuthorizedRequest<T>(input: {
  credentials: SmartstoreCredentials;
  method: string;
  pathWithQuery: string;
  body?: string;
  contentType?: string;
}): Promise<T> {
  const { accessToken } = await requestSmartstoreAccessToken(input.credentials);
  const url = `${SMARTSTORE_API_ORIGIN}${input.pathWithQuery}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (input.body != null) {
    headers['Content-Type'] = input.contentType ?? 'application/json';
  }

  const { httpStatus, bodyText } = await invokeIntegrationHttp({
    method: input.method,
    url,
    headers,
    body: input.body ?? null,
  });

  if (httpStatus < 200 || httpStatus >= 300) {
    throw new Error(parseSmartstoreErrorMessage(bodyText) ?? '스마트스토어 API 호출에 실패했습니다.');
  }

  try {
    return JSON.parse(bodyText) as T;
  } catch {
    throw new Error('스마트스토어 API 응답을 해석하지 못했습니다.');
  }
}

export async function testSmartstoreConnection(credentials: SmartstoreCredentials): Promise<{ ok: true }> {
  await requestSmartstoreAccessToken(credentials);
  return { ok: true };
}

function formatKstIsoWithMillis(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  const ss = String(kst.getUTCSeconds()).padStart(2, '0');
  const ms = String(kst.getUTCMilliseconds()).padStart(3, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}.${ms}+09:00`;
}

export type SmartstoreLastChangedStatus = {
  productOrderId?: string;
  orderId?: string;
  lastChangedType?: string;
  productOrderStatus?: string;
  lastChangedDate?: string;
  paymentDate?: string;
};

export type SmartstoreProductOrderDetail = {
  order?: {
    orderId?: string;
    orderDate?: string;
    paymentDate?: string;
    ordererName?: string;
    ordererTel?: string;
  };
  productOrder?: {
    productOrderId?: string;
    productName?: string;
    productOption?: string;
    quantity?: number;
    productOrderStatus?: string;
    shippingMemo?: string;
    shippingAddress?: {
      name?: string;
      tel1?: string;
      tel2?: string;
      zipCode?: string;
      baseAddress?: string;
      detailedAddress?: string;
    };
  };
};

export async function fetchSmartstoreProductOrders(input: {
  credentials: SmartstoreCredentials;
  days?: number;
}): Promise<SmartstoreProductOrderDetail[]> {
  const days = input.days ?? 7;
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() - 5 * 1000);

  const query = new URLSearchParams({
    lastChangedFrom: formatKstIsoWithMillis(from),
    lastChangedTo: formatKstIsoWithMillis(to),
  });

  const changedResponse = await smartstoreAuthorizedRequest<{
    data?: { lastChangeStatuses?: SmartstoreLastChangedStatus[] };
  }>({
    credentials: input.credentials,
    method: 'GET',
    pathWithQuery: `/external/v1/pay-order/seller/product-orders/last-changed-statuses?${query.toString()}`,
  });

  const productOrderIds = [
    ...new Set(
      (changedResponse.data?.lastChangeStatuses ?? [])
        .map((item) => item.productOrderId?.trim())
        .filter(Boolean) as string[],
    ),
  ];

  if (!productOrderIds.length) {
    return [];
  }

  const details: SmartstoreProductOrderDetail[] = [];
  const batchSize = 300;

  for (let index = 0; index < productOrderIds.length; index += batchSize) {
    const batch = productOrderIds.slice(index, index + batchSize);
    const detailResponse = await smartstoreAuthorizedRequest<{
      data?: SmartstoreProductOrderDetail[];
    }>({
      credentials: input.credentials,
      method: 'POST',
      pathWithQuery: '/external/v1/pay-order/seller/product-orders/query',
      body: JSON.stringify({ productOrderIds: batch }),
      contentType: 'application/json',
    });

    details.push(...(detailResponse.data ?? []));
  }

  return details;
}

export function toUserFacingSmartstoreErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '스마트스토어 연동 처리 중 오류가 발생했습니다.';
}
