import { NextResponse } from 'next/server';
import { EXCLOAD_INTEGRATION_INFO } from '@/app/lib/order-integration/malls';

/**
 * Shopify OAuth connect/callback 활성화 게이트.
 * 명시적으로 `true`일 때만 활성. 미설정·false·그 외 → 비활성 (기본 false).
 *
 * Production DB migration / Partners env / UI 활성화 전에는 false 유지.
 */
export function isShopifyIntegrationEnabled(): boolean {
  return process.env.SHOPIFY_INTEGRATION_ENABLED?.trim() === 'true';
}

/** connect route — disabled 시 404 (env 누락 500과 구분) */
export function shopifyIntegrationDisabledJsonResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Shopify 주문연동이 비활성화되어 있습니다.' },
    { status: 404 },
  );
}

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
