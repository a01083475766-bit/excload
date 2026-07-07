import type { CoupangTransportMode } from '@/app/lib/coupang/transport/types';

const PROXY_INVOKE_PATH = '/internal/coupang/invoke';

export function getCoupangProxyBaseUrl(): string | null {
  const raw = process.env.COUPANG_PROXY_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

export function getCoupangProxySharedSecret(): string | null {
  return process.env.COUPANG_PROXY_SHARED_SECRET?.trim() || null;
}

export function getCoupangProxyKeyId(): string {
  return process.env.COUPANG_PROXY_KEY_ID?.trim() || 'default';
}

export function getCoupangProxyInvokePath(): string {
  return PROXY_INVOKE_PATH;
}

export function resolveCoupangTransportMode(): CoupangTransportMode {
  const baseUrl = getCoupangProxyBaseUrl();
  const secret = getCoupangProxySharedSecret();
  if (baseUrl && secret) return 'proxy';
  return 'direct';
}

export function isCoupangProxyConfigured(): boolean {
  return resolveCoupangTransportMode() === 'proxy';
}

export function getCoupangTransportInfo() {
  const mode = resolveCoupangTransportMode();
  const proxyBaseUrl = getCoupangProxyBaseUrl();

  return {
    mode,
    proxyBaseUrl,
    /** 고정 IP 없이 Vercel에서 직접 호출 — 관리자 테스트·개발용 */
    directAllowed: mode === 'direct',
    proxyConfigured: Boolean(proxyBaseUrl && getCoupangProxySharedSecret()),
  };
}

export function assertCoupangProxyConfigReady(): void {
  const baseUrl = getCoupangProxyBaseUrl();
  const secret = getCoupangProxySharedSecret();

  if (!baseUrl) {
    throw new Error('COUPANG_PROXY_BASE_URL 환경변수가 설정되지 않았습니다.');
  }
  if (!secret) {
    throw new Error('COUPANG_PROXY_SHARED_SECRET 환경변수가 설정되지 않았습니다.');
  }
}
