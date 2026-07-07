/** 카페24 mallId — 서브도메인 `{mallId}.cafe24api.com` */
export const CAFE24_MALL_ID_REGEX = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/i;

export const CAFE24_API_HOST_SUFFIX = 'cafe24api.com';

export function normalizeCafe24MallId(mallId: string): string {
  return mallId.trim().toLowerCase();
}

export function assertValidCafe24MallId(mallId: string): string {
  const normalized = normalizeCafe24MallId(mallId);
  if (!normalized || !CAFE24_MALL_ID_REGEX.test(normalized)) {
    throw new Error('카페24 mallId 형식이 올바르지 않습니다. (영문·숫자·_- 만 허용)');
  }
  return normalized;
}

export function buildCafe24ApiOrigin(mallId: string): string {
  const normalized = assertValidCafe24MallId(mallId);
  return `https://${normalized}.${CAFE24_API_HOST_SUFFIX}`;
}

export function parseCafe24MallIdFromHostname(hostname: string): string | null {
  const normalized = hostname.trim().toLowerCase();
  const suffix = `.${CAFE24_API_HOST_SUFFIX}`;
  if (!normalized.endsWith(suffix)) return null;

  const mallId = normalized.slice(0, -suffix.length);
  if (!mallId || mallId.includes('.')) return null;
  if (!CAFE24_MALL_ID_REGEX.test(mallId)) return null;

  return mallId;
}
