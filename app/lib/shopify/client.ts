import { normalizeShopifyShopDomain } from '@/app/lib/shopify/shop-domain';

export const SHOPIFY_DEFAULT_API_VERSION = '2026-01';

export type ShopifyGraphQLError = {
  message: string;
  extensions?: {
    code?: string;
  };
};

export type ShopifyGraphQLResponse<T> = {
  data?: T;
  errors?: ShopifyGraphQLError[];
};

export class ShopifyApiError extends Error {
  readonly userMessage: string;
  readonly httpStatus?: number;
  readonly graphqlErrors?: ShopifyGraphQLError[];

  constructor(input: {
    message: string;
    userMessage: string;
    httpStatus?: number;
    graphqlErrors?: ShopifyGraphQLError[];
  }) {
    super(input.message);
    this.name = 'ShopifyApiError';
    this.userMessage = input.userMessage;
    this.httpStatus = input.httpStatus;
    this.graphqlErrors = input.graphqlErrors;
  }
}

export function resolveShopifyApiVersion(): string {
  const fromEnv = process.env.SHOPIFY_API_VERSION?.trim();
  return fromEnv || SHOPIFY_DEFAULT_API_VERSION;
}

export function buildShopifyGraphqlUrl(shopDomain: string, apiVersion?: string): string {
  const shop = normalizeShopifyShopDomain(shopDomain);
  const version = (apiVersion ?? resolveShopifyApiVersion()).trim();
  return `https://${shop}/admin/api/${version}/graphql.json`;
}

function parseGraphqlErrors(bodyText: string): ShopifyGraphQLError[] | null {
  try {
    const parsed = JSON.parse(bodyText) as ShopifyGraphQLResponse<unknown>;
    if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
      return parsed.errors;
    }
  } catch {
    // ignore
  }
  return null;
}

function isThrottled(graphqlErrors: ShopifyGraphQLError[] | null | undefined): boolean {
  return Boolean(
    graphqlErrors?.some(
      (error) =>
        error.extensions?.code === 'THROTTLED' ||
        /throttl/i.test(error.message),
    ),
  );
}

function buildHttpError(httpStatus: number, bodyText: string): ShopifyApiError {
  const graphqlErrors = parseGraphqlErrors(bodyText);

  if (httpStatus === 401 || httpStatus === 403) {
    return new ShopifyApiError({
      message: `Shopify API auth failed (HTTP ${httpStatus})`,
      userMessage: 'Shopify OAuth 인증에 실패했습니다. 연동을 다시 진행해 주세요.',
      httpStatus,
      graphqlErrors: graphqlErrors ?? undefined,
    });
  }

  if (httpStatus === 429 || isThrottled(graphqlErrors)) {
    return new ShopifyApiError({
      message: `Shopify API throttled (HTTP ${httpStatus})`,
      userMessage: 'Shopify API 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
      httpStatus,
      graphqlErrors: graphqlErrors ?? undefined,
    });
  }

  const firstMessage = graphqlErrors?.[0]?.message;
  return new ShopifyApiError({
    message: firstMessage ?? `Shopify API call failed (HTTP ${httpStatus})`,
    userMessage: firstMessage ?? `Shopify API 호출에 실패했습니다. (HTTP ${httpStatus})`,
    httpStatus,
    graphqlErrors: graphqlErrors ?? undefined,
  });
}

/** access token·client secret은 로그에 출력하지 않습니다. */
export function toUserFacingShopifyErrorMessage(error: unknown): string {
  if (error instanceof ShopifyApiError) {
    return error.userMessage;
  }

  if (error instanceof Error) {
    const message = error.message;
    if (/shpat_|access.?token|client.?secret|refresh.?token/i.test(message)) {
      return 'Shopify API 호출에 실패했습니다.';
    }
    return message;
  }

  return 'Shopify API 호출에 실패했습니다.';
}

export async function shopifyGraphqlRequest<T>(input: {
  shopDomain: string;
  accessToken: string;
  query: string;
  variables?: Record<string, unknown>;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
}): Promise<T> {
  const shop = normalizeShopifyShopDomain(input.shopDomain);
  const accessToken = input.accessToken.trim();
  if (!accessToken) {
    throw new ShopifyApiError({
      message: 'Shopify access token missing',
      userMessage: 'Shopify access token이 없습니다. OAuth 연동을 먼저 완료해 주세요.',
    });
  }

  const fetchFn = input.fetchImpl ?? fetch;
  const response = await fetchFn(buildShopifyGraphqlUrl(shop, input.apiVersion), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({
      query: input.query,
      variables: input.variables ?? {},
    }),
  });

  const bodyText = await response.text();

  if (!response.ok) {
    throw buildHttpError(response.status, bodyText);
  }

  let parsed: ShopifyGraphQLResponse<T>;
  try {
    parsed = JSON.parse(bodyText) as ShopifyGraphQLResponse<T>;
  } catch {
    throw new ShopifyApiError({
      message: 'Shopify GraphQL response parse failed',
      userMessage: 'Shopify API 응답을 해석하지 못했습니다.',
      httpStatus: response.status,
    });
  }

  if (parsed.errors?.length) {
    if (isThrottled(parsed.errors)) {
      throw new ShopifyApiError({
        message: parsed.errors.map((error) => error.message).join('; '),
        userMessage: 'Shopify API 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
        httpStatus: response.status,
        graphqlErrors: parsed.errors,
      });
    }

    const firstMessage = parsed.errors[0]?.message ?? 'GraphQL error';
    const isAccessDenied = parsed.errors.some(
      (error) =>
        /access denied|not authorized|required access/i.test(error.message) ||
        error.extensions?.code === 'ACCESS_DENIED',
    );

    throw new ShopifyApiError({
      message: parsed.errors.map((error) => error.message).join('; '),
      userMessage: isAccessDenied
        ? 'Shopify OAuth 인증에 실패했습니다. 연동을 다시 진행해 주세요.'
        : firstMessage,
      httpStatus: response.status,
      graphqlErrors: parsed.errors,
    });
  }

  if (!parsed.data) {
    throw new ShopifyApiError({
      message: 'Shopify GraphQL response missing data',
      userMessage: 'Shopify API 응답에 데이터가 없습니다.',
      httpStatus: response.status,
    });
  }

  return parsed.data;
}
