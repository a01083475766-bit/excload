/** 로그인·OAuth 직후 이동 경로 (오픈 리다이렉트 방지) */
export function getPostLoginPath(searchParams: URLSearchParams | null): string {
  const raw = searchParams?.get('callbackUrl');
  if (raw?.startsWith('/') && !raw.startsWith('//')) {
    return raw;
  }
  return '/order-convert';
}

/** 통합 인증 UI가 떠 있는 경로인지 (여기서만 자동 이동) */
export function isAuthPathname(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === '/auth' || pathname.startsWith('/auth/');
}
