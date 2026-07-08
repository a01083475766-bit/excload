import { createHmac, timingSafeEqual } from 'crypto';
import { normalizeShopifyShopDomain, SHOPIFY_OAUTH_SCOPES } from '@/app/lib/shopify/shop-domain';

const HMAC_EXCLUDED_KEYS = new Set(['hmac', 'signature']);

/**
 * Shopify OAuth/install query HMAC 검증용 message 생성.
 * hmac·signature 파라미터는 제외하고 키 이름 알파벳 순으로 연결합니다.
 */
export function buildShopifyOAuthQueryMessage(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((key) => !HMAC_EXCLUDED_KEYS.has(key))
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
}

/**
 * Shopify OAuth callback/install query의 hmac을 검증합니다.
 * clientSecret은 로그에 출력하지 않습니다.
 */
export function verifyShopifyOAuthHmac(params: Record<string, string>, clientSecret: string): boolean {
  const hmac = params.hmac?.trim();
  const secret = clientSecret.trim();
  if (!hmac || !secret) return false;

  const message = buildShopifyOAuthQueryMessage(params);
  const digest = createHmac('sha256', secret).update(message).digest('hex');

  const hmacBuf = Buffer.from(hmac, 'utf8');
  const digestBuf = Buffer.from(digest, 'utf8');
  if (hmacBuf.length !== digestBuf.length) return false;
  return timingSafeEqual(hmacBuf, digestBuf);
}

export function buildShopifyAuthorizeUrl(input: {
  shopDomain: string;
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: string;
}): string {
  const shop = normalizeShopifyShopDomain(input.shopDomain);
  const clientId = input.clientId.trim();
  const redirectUri = input.redirectUri.trim();
  const state = input.state.trim();

  if (!clientId) {
    throw new Error('Shopify OAuth client_id가 필요합니다.');
  }
  if (!redirectUri) {
    throw new Error('Shopify OAuth redirect_uri가 필요합니다.');
  }
  if (!state) {
    throw new Error('Shopify OAuth state가 필요합니다.');
  }

  const scopes = input.scopes?.trim() || SHOPIFY_OAUTH_SCOPES;
  if (scopes.split(',').some((scope) => scope.trim() === 'read_all_orders')) {
    throw new Error('read_all_orders는 1차 Shopify OAuth scope에 포함할 수 없습니다.');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
  });

  // Offline access token: grant_options[]=per-user 는 online(per-user) 토큰용 — 포함하지 않음.
  // expiring=1 은 authorize URL이 아니라 token-exchange.ts 의 access_token POST body에 전달.

  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}
