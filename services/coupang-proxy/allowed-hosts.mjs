/**
 * Lightsail server.mjs upstream host whitelist
 *
 * ⚠️ 이 파일은 “연동 가능한 전체 채널 목록”이 아닙니다.
 * Vercel → Lightsail 프록시가 **실제로 호출하는 upstream hostname**만 등록합니다.
 *
 * - direct_api: 각 쇼핑몰 Open API host (예: api.11st.co.kr — 11번가 **직접** 연동용)
 * - hub_api: 허브 API host (예: sbadmin.sabangnet.co.kr — **사방넷 허브**용)
 *   → 허브 경유 시 api.11st.co.kr 등 direct 몰 host를 프록시하지 않음
 * - excel_upload: upstream host 없음 (이 파일에 포함하지 않음)
 *
 * `malls` 필드는 SSOT channelCode 라벨이며, integrationType 과 1:1이 아닐 수 있음.
 * sbadmin.sabangnet.co.kr 포함은 **사방넷 hub upstream 허용**이지, hub 전체 구현 완료가 아님.
 * (플레이오토·샵링커 등 다른 hub는 API host 확정·구현 후 별도 추가)
 *
 * @typedef {{ hostname: string; protocols: ('https'|'http')[]; malls: string[] }} HostRule
 * @typedef {{ suffix: string; protocols: ('https'|'http')[]; malls: string[] }} SuffixRule
 */

/** 카페24 mallId — app/lib/cafe24/mall-id.ts 와 동일 */
export const CAFE24_MALL_ID_REGEX = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/i;

export const CAFE24_API_HOST_SUFFIX = 'cafe24api.com';

/** @type {HostRule[]} — direct_api upstream (9) + hub_api upstream (1, 사방넷) */
export const INTEGRATION_PROXY_HOST_RULES = [
  // ── direct_api upstream (개별 몰 Open API) ─────────────────────
  { hostname: 'api-gateway.coupang.com', protocols: ['https'], malls: ['coupang'] },
  { hostname: 'api.commerce.naver.com', protocols: ['https'], malls: ['smartstore'] },
  { hostname: 'api.11st.co.kr', protocols: ['https'], malls: ['eleven'] },
  { hostname: 'openapi.lotteon.com', protocols: ['https'], malls: ['lotteon'] },
  { hostname: 'eapi.ssgadm.com', protocols: ['https'], malls: ['ssg'] },
  { hostname: 'api.cjonstyle.com', protocols: ['https'], malls: ['cjonstyle'] },
  { hostname: 'server-api.e-ncp.com', protocols: ['https'], malls: ['shopby'] },
  { hostname: 'openhub.godo.co.kr', protocols: ['https'], malls: ['godomall'] },
  { hostname: 'connect.makeshop.co.kr', protocols: ['https'], malls: ['makeshop'] },
  // ── hub_api upstream (허브 API — direct 몰 host 아님) ───────────
  { hostname: 'sbadmin.sabangnet.co.kr', protocols: ['https'], malls: ['sabangnet'] },
];

/** @type {SuffixRule[]} — direct_api 동적 upstream (카페24 {mallId}.cafe24api.com) */
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
