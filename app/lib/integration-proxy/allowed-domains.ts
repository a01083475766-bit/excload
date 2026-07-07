import {
  getHostAllowedProtocols,
  getIntegrationProxyAllowedHostnames,
  getIntegrationProxySuffixRules,
  getIntegrationProxyWhitelist,
} from '@/app/lib/order-integration/mall-integration-specs';
import { parseCafe24MallIdFromHostname } from '@/app/lib/cafe24/mall-id';

export {
  getIntegrationProxyAllowedHostnames,
  getIntegrationProxyWhitelist,
  getIntegrationProxySuffixRules,
  getHostAllowedProtocols,
};

/** @deprecated — getIntegrationProxyAllowedHostnames() 사용 */
export const INTEGRATION_PROXY_ALLOWED_HOSTS = getIntegrationProxyAllowedHostnames();

function matchesSuffixRule(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  for (const rule of getIntegrationProxySuffixRules()) {
    if (normalized === rule.suffix || normalized.endsWith(`.${rule.suffix}`)) {
      if (rule.suffix === 'cafe24api.com' && !parseCafe24MallIdFromHostname(normalized)) {
        return false;
      }
      return true;
    }
  }
  return false;
}

export function isIntegrationProxyHostAllowed(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (INTEGRATION_PROXY_ALLOWED_HOSTS.includes(normalized)) {
    return true;
  }
  return matchesSuffixRule(normalized);
}

export function assertIntegrationProxyUrlAllowed(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('프록시 호출 URL 형식이 올바르지 않습니다.');
  }

  const protocol = parsed.protocol.replace(':', '') as 'http' | 'https';
  if (!isIntegrationProxyHostAllowed(parsed.hostname)) {
    throw new Error('허용되지 않은 API 도메인입니다.');
  }

  const allowedProtocols = getHostAllowedProtocols(parsed.hostname);
  if (!allowedProtocols.includes(protocol)) {
    throw new Error(`허용되지 않은 프로토콜입니다: ${parsed.protocol}`);
  }

  return parsed;
}
