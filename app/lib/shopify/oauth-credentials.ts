import { EXCLOAD_INTEGRATION_INFO } from '@/app/lib/order-integration/malls';

/**
 * Shopify Partners 앱 credential — 실행 시점에만 검증 (build 시 env 없어도 실패하지 않음).
 */
export function resolveShopifyClientId(): string {
  const fromEnv = process.env.SHOPIFY_CLIENT_ID?.trim();
  if (!fromEnv) {
    throw new Error(
      'SHOPIFY_CLIENT_ID 환경 변수가 설정되지 않았습니다. Shopify Partners 앱 Client ID를 Vercel env에 등록하세요.',
    );
  }
  return fromEnv;
}

export function resolveShopifyClientSecret(): string {
  const fromEnv = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  if (!fromEnv) {
    throw new Error(
      'SHOPIFY_CLIENT_SECRET 환경 변수가 설정되지 않았습니다. Shopify Partners 앱 Client Secret을 Vercel env에 등록하세요.',
    );
  }
  return fromEnv;
}

export function isShopifyOAuthConfigured(): boolean {
  return Boolean(process.env.SHOPIFY_CLIENT_ID?.trim() && process.env.SHOPIFY_CLIENT_SECRET?.trim());
}

/** Allowed redirection URL — Partners Dashboard와 일치해야 함 */
export function resolveShopifyOAuthRedirectUri(): string {
  const fromEnv = process.env.SHOPIFY_OAUTH_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return `${EXCLOAD_INTEGRATION_INFO.url}/api/order/integration/shopify/callback`;
}
