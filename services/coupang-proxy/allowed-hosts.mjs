/**
 * Lightsail server.mjs whitelist — app/lib/order-integration/mall-integration-specs.ts 와 동기화
 * 쇼핑몰 등록·구현 완료 후 server.mjs 한 번 교체 배포
 *
 * @typedef {{ hostname: string; protocols: ('https'|'http')[]; malls: string[] }} HostRule
 * @typedef {{ suffix: string; protocols: ('https'|'http')[]; malls: string[] }} SuffixRule
 */

/** 카페24 mallId — app/lib/cafe24/mall-id.ts 와 동일 */
export const CAFE24_MALL_ID_REGEX = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/i;

export const CAFE24_API_HOST_SUFFIX = 'cafe24api.com';

/** @type {HostRule[]} */
export const INTEGRATION_PROXY_HOST_RULES = [
  { hostname: 'api-gateway.coupang.com', protocols: ['https'], malls: ['coupang'] },
  { hostname: 'api.commerce.naver.com', protocols: ['https'], malls: ['smartstore'] },
  { hostname: 'api.11st.co.kr', protocols: ['https'], malls: ['eleven'] },
  { hostname: 'sbadmin.sabangnet.co.kr', protocols: ['https'], malls: ['sabangnet'] },
  { hostname: 'openapi.lotteon.com', protocols: ['https'], malls: ['lotteon'] },
  { hostname: 'eapi.ssgadm.com', protocols: ['https'], malls: ['ssg'] },
  { hostname: 'api.cjonstyle.com', protocols: ['https'], malls: ['cjonstyle'] },
  { hostname: 'server-api.e-ncp.com', protocols: ['https'], malls: ['shopby'] },
  { hostname: 'openhub.godo.co.kr', protocols: ['https'], malls: ['godomall'] },
  { hostname: 'connect.makeshop.co.kr', protocols: ['https'], malls: ['makeshop'] },
];

/** @type {SuffixRule[]} */
export const INTEGRATION_PROXY_SUFFIX_RULES = [
  {
    suffix: CAFE24_API_HOST_SUFFIX,
    protocols: ['https'],
    malls: ['cafe24'],
  },
];

/**
 * @param {string} hostname
 * @returns {string | null}
 */
export function parseCafe24MallIdFromHostname(hostname) {
  const normalized = hostname.trim().toLowerCase();
  const suffix = `.${CAFE24_API_HOST_SUFFIX}`;
  if (!normalized.endsWith(suffix)) return null;

  const mallId = normalized.slice(0, -suffix.length);
  if (!mallId || mallId.includes('.')) return null;
  if (!CAFE24_MALL_ID_REGEX.test(mallId)) return null;

  return mallId;
}

export function getAllowedHostnames() {
  return INTEGRATION_PROXY_HOST_RULES.map((rule) => rule.hostname);
}

/**
 * @param {string} hostname
 * @returns {('https'|'http')[]}
 */
export function getAllowedProtocols(hostname) {
  const normalized = hostname.trim().toLowerCase();
  const exact = INTEGRATION_PROXY_HOST_RULES.find((entry) => entry.hostname === normalized);
  if (exact) return exact.protocols;

  for (const rule of INTEGRATION_PROXY_SUFFIX_RULES) {
    if (matchesSuffixHostname(normalized, rule.suffix)) {
      if (rule.suffix === CAFE24_API_HOST_SUFFIX && !parseCafe24MallIdFromHostname(normalized)) {
        return [];
      }
      return rule.protocols;
    }
  }

  return [];
}

/**
 * @param {string} hostname
 * @param {string} suffix
 */
function matchesSuffixHostname(hostname, suffix) {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

/**
 * @param {string} hostname
 * @param {string} protocol
 */
export function isHostAllowed(hostname, protocol) {
  const normalized = hostname.trim().toLowerCase();
  const normalizedProtocol = protocol.replace(':', '');

  const exact = INTEGRATION_PROXY_HOST_RULES.find((entry) => entry.hostname === normalized);
  if (exact) {
    return exact.protocols.includes(normalizedProtocol);
  }

  for (const rule of INTEGRATION_PROXY_SUFFIX_RULES) {
    if (!matchesSuffixHostname(normalized, rule.suffix)) continue;
    if (rule.suffix === CAFE24_API_HOST_SUFFIX && !parseCafe24MallIdFromHostname(normalized)) {
      return false;
    }
    return rule.protocols.includes(normalizedProtocol);
  }

  return false;
}

/**
 * @param {string} rawUrl
 * @returns {URL}
 */
export function assertUrlAllowed(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('invalid url');
  }

  const protocol = parsed.protocol.replace(':', '');
  if (!isHostAllowed(parsed.hostname, protocol)) {
    throw new Error('domain not allowed');
  }

  return parsed;
}
