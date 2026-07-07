/**
 * Lightsail server.mjs whitelist — app/lib/order-integration/mall-integration-specs.ts 와 동기화
 * 쇼핑몰 등록·구현 완료 후 server.mjs 한 번 교체 배포
 *
 * @typedef {{ hostname: string; protocols: ('https'|'http')[]; malls: string[] }} HostRule
 */

/** @type {HostRule[]} */
export const INTEGRATION_PROXY_HOST_RULES = [
  { hostname: 'api-gateway.coupang.com', protocols: ['https'], malls: ['coupang'] },
  { hostname: 'api.commerce.naver.com', protocols: ['https'], malls: ['smartstore'] },
  { hostname: 'api.11st.co.kr', protocols: ['http', 'https'], malls: ['eleven'] },
  { hostname: 'api.cafe24.com', protocols: ['https'], malls: ['cafe24'] },
  { hostname: 'sbadmin.sabangnet.co.kr', protocols: ['https'], malls: ['sabangnet'] },
];

export function getAllowedHostnames() {
  return INTEGRATION_PROXY_HOST_RULES.map((rule) => rule.hostname);
}

export function getAllowedProtocols(hostname) {
  const normalized = hostname.trim().toLowerCase();
  const rule = INTEGRATION_PROXY_HOST_RULES.find((entry) => entry.hostname === normalized);
  return rule?.protocols ?? [];
}

export function isHostAllowed(hostname, protocol) {
  const normalized = hostname.trim().toLowerCase();
  const rule = INTEGRATION_PROXY_HOST_RULES.find((entry) => entry.hostname === normalized);
  if (!rule) return false;
  return rule.protocols.includes(protocol.replace(':', ''));
}
