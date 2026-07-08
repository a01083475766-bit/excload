import { normalizeShopifyShopDomain } from '@/app/lib/shopify/shop-domain';
import type { ShopifyTokenResponse } from '@/app/lib/shopify/types';

export type ShopifyExchangedTokens = {
  accessToken: string;
  refreshToken: string | null;
  scope: string;
  tokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  expiresIn: number | null;
  refreshTokenExpiresIn: number | null;
};

export function computeExpiryFromSeconds(
  expiresInSeconds: number | undefined | null,
  nowMs: number = Date.now(),
): Date | null {
  if (expiresInSeconds == null || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    return null;
  }
  return new Date(nowMs + Math.floor(expiresInSeconds) * 1000);
}

export function parseShopifyTokenExchangeResponse(
  bodyText: string,
  nowMs: number = Date.now(),
): ShopifyExchangedTokens {
  let parsed: ShopifyTokenResponse;
  try {
    parsed = JSON.parse(bodyText) as ShopifyTokenResponse;
  } catch {
    throw new Error('Shopify 토큰 응답을 해석하지 못했습니다.');
  }

  const accessToken = parsed.access_token?.trim();
  if (!accessToken) {
    throw new Error('Shopify 토큰 응답에 access_token이 없습니다.');
  }

  const scope = parsed.scope?.trim();
  if (!scope) {
    throw new Error('Shopify 토큰 응답에 scope가 없습니다.');
  }

  return {
    accessToken,
    refreshToken: parsed.refresh_token?.trim() || null,
    scope,
    expiresIn: typeof parsed.expires_in === 'number' ? parsed.expires_in : null,
    refreshTokenExpiresIn:
      typeof parsed.refresh_token_expires_in === 'number' ? parsed.refresh_token_expires_in : null,
    tokenExpiresAt: computeExpiryFromSeconds(parsed.expires_in, nowMs),
    refreshTokenExpiresAt: computeExpiryFromSeconds(parsed.refresh_token_expires_in, nowMs),
  };
}

/**
 * Authorization code → offline access token (expiring=1).
 * client_secret은 로그에 출력하지 않습니다.
 */
export async function exchangeShopifyAuthorizationCode(input: {
  shopDomain: string;
  clientId: string;
  clientSecret: string;
  code: string;
  fetchImpl?: typeof fetch;
  nowMs?: number;
}): Promise<ShopifyExchangedTokens> {
  const shop = normalizeShopifyShopDomain(input.shopDomain);
  const code = input.code.trim();
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();

  if (!code) throw new Error('Shopify OAuth authorization code가 필요합니다.');
  if (!clientId || !clientSecret) {
    throw new Error('Shopify OAuth client credentials가 필요합니다.');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    // Expiring offline token — authorize URL이 아니라 token exchange에 전달 (설계 §3.7)
    expiring: '1',
  }).toString();

  const fetchFn = input.fetchImpl ?? fetch;
  const response = await fetchFn(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });

  const bodyText = await response.text();
  if (!response.ok) {
    // body에 secret이 포함될 수 있으므로 본문은 로깅하지 않음
    throw new Error(`Shopify 토큰 교환에 실패했습니다. (HTTP ${response.status})`);
  }

  return parseShopifyTokenExchangeResponse(bodyText, input.nowMs);
}

/** 1차 저장용 — read_all_orders가 granted에 포함돼 있어도 저장 scope에서는 제거 */
export function sanitizeShopifyGrantedScope(scope: string): string {
  const parts = scope
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s !== 'read_all_orders');
  if (parts.length === 0) {
    throw new Error('Shopify granted scope가 비어 있습니다.');
  }
  return parts.join(',');
}
