/**
 * 랜딩·체험 페이지에서 API에 x-excload-trial 헤더를 붙일지 판별합니다.
 * /api/ai-gateway · /api/order-pipeline 비로그인 체험 허용과 연동됩니다.
 */

const TRIAL_PATH_PREFIXES = ['/excload', '/trial'] as const;

export function isTrialPageContext(): boolean {
  if (typeof window === 'undefined') return false;
  const pathname = window.location.pathname;
  if (pathname === '/') return true;
  return TRIAL_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** 비로그인 무료체험 API 호출 시 서버에 전달 */
export function getTrialApiHeaders(): Record<string, string> {
  if (!isTrialPageContext()) return {};
  return { 'x-excload-trial': '1' };
}

export function withTrialApiHeaders(
  headers?: HeadersInit,
): HeadersInit {
  const trial = getTrialApiHeaders();
  if (!headers) return trial;
  if (headers instanceof Headers) {
    const merged = new Headers(headers);
    Object.entries(trial).forEach(([k, v]) => merged.set(k, v));
    return merged;
  }
  if (Array.isArray(headers)) {
    return [...headers, ...Object.entries(trial)];
  }
  return { ...headers, ...trial };
}
