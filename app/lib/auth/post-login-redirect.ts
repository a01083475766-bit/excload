import { isProtectedOrderIntegrationPath } from '@/app/lib/order-integration/access-policy';

export function getSafeCallbackPath(raw: string | null | undefined): string | null {
  if (raw?.startsWith('/') && !raw.startsWith('//')) {
    return raw;
  }
  return null;
}

/** 로그인·OAuth 직후 이동 경로 (오픈 리다이렉트 방지) */
export function getPostLoginPath(searchParams: URLSearchParams | null): string {
  return getSafeCallbackPath(searchParams?.get('callbackUrl')) ?? '/order-convert';
}

/** middleware getToken 검증이 필요한 경로 — 클라이언트 replace 대신 full navigation 권장 */
export function requiresMiddlewareSession(path: string): boolean {
  return (
    path.startsWith('/akman') ||
    path.startsWith('/admin') ||
    path.startsWith('/history') ||
    path.startsWith('/beta-feedback') ||
    isProtectedOrderIntegrationPath(path)
  );
}

/** 미인증 시 통합 로그인(/auth) 경로 — /auth/login 2-hop 제거 */
export function buildAuthLoginRedirectPath(callbackPath: string): string {
  const params = new URLSearchParams({ mode: 'login' });
  const safeCallbackPath = getSafeCallbackPath(callbackPath);
  if (safeCallbackPath) {
    params.set('callbackUrl', safeCallbackPath);
  }
  return `/auth?${params.toString()}`;
}

/** 미인증 시 통합 로그인(/auth) URL — /auth/login 2-hop 제거 */
export function buildAuthLoginRedirectUrl(origin: string, callbackPath: string): string {
  const url = new URL(buildAuthLoginRedirectPath(callbackPath), origin);
  return url.toString();
}

/** 로그인 직후 이동 — middleware 보호 경로는 document navigation으로 쿠키·호스트 일치 */
export function navigatePostLogin(
  path: string,
  router: { replace: (href: string) => void },
): void {
  if (typeof window !== 'undefined' && requiresMiddlewareSession(path)) {
    window.location.assign(path);
    return;
  }
  router.replace(path);
}

/** 통합 인증 UI가 떠 있는 경로인지 (여기서만 자동 이동) */
export function isAuthPathname(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === '/auth' || pathname.startsWith('/auth/');
}
