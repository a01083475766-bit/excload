/** 고정 IP 프록시를 통해 호출 허용되는 upstream 호스트 */
export const INTEGRATION_PROXY_ALLOWED_HOSTS = [
  'api-gateway.coupang.com',
  'api.commerce.naver.com',
] as const;

export type IntegrationProxyAllowedHost = (typeof INTEGRATION_PROXY_ALLOWED_HOSTS)[number];

export function isIntegrationProxyHostAllowed(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return INTEGRATION_PROXY_ALLOWED_HOSTS.some((host) => host === normalized);
}

export function assertIntegrationProxyUrlAllowed(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('프록시 호출 URL 형식이 올바르지 않습니다.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('프록시 호출은 HTTPS URL만 허용됩니다.');
  }

  if (!isIntegrationProxyHostAllowed(parsed.hostname)) {
    throw new Error('허용되지 않은 API 도메인입니다.');
  }

  return parsed;
}
