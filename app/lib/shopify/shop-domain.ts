import { isIP } from 'node:net';
import type { ShopifyShopDomain } from '@/app/lib/shopify/types';

export const SHOPIFY_HOST_SUFFIX = 'myshopify.com';

/** slug: 영문 소문자·숫자·하이픈, 시작/끝 하이픈 불가 */
export const SHOPIFY_SHOP_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export const SHOPIFY_OAUTH_SCOPES = 'read_orders';

export class ShopifyShopDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShopifyShopDomainError';
  }
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  if (isIP(normalized) !== 0) return true;
  return false;
}

function assertValidShopSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  if (!normalized || !SHOPIFY_SHOP_SLUG_REGEX.test(normalized)) {
    throw new ShopifyShopDomainError(
      'Shop URL slug 형식이 올바르지 않습니다. (영문 소문자·숫자·하이픈만, 시작/끝 하이픈 불가)',
    );
  }
  return normalized;
}

function extractHostname(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new ShopifyShopDomainError('Shop URL이 비어 있습니다.');
  }

  if (/^https?:\/\//i.test(trimmed)) {
    if (!/^https:\/\//i.test(trimmed)) {
      throw new ShopifyShopDomainError('Shop URL은 https만 허용됩니다.');
    }

    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new ShopifyShopDomainError('Shop URL 형식이 올바르지 않습니다.');
    }

    if (url.protocol !== 'https:') {
      throw new ShopifyShopDomainError('Shop URL은 https만 허용됩니다.');
    }
    if (url.username || url.password) {
      throw new ShopifyShopDomainError('Shop URL에 인증 정보를 포함할 수 없습니다.');
    }

    const hostname = url.hostname.toLowerCase();
    if (isBlockedHostname(hostname)) {
      throw new ShopifyShopDomainError('허용되지 않는 Shop hostname입니다.');
    }
    return hostname;
  }

  const candidate = trimmed.split(/[/?#]/)[0]?.trim().toLowerCase() ?? '';
  if (!candidate) {
    throw new ShopifyShopDomainError('Shop URL 형식이 올바르지 않습니다.');
  }
  if (candidate.includes('/') || candidate.includes('?')) {
    throw new ShopifyShopDomainError('Shop URL 형식이 올바르지 않습니다.');
  }
  if (isBlockedHostname(candidate)) {
    throw new ShopifyShopDomainError('허용되지 않는 Shop hostname입니다.');
  }

  return candidate;
}

/**
 * 사용자 입력을 `{slug}.myshopify.com`으로 정규화합니다.
 * 실제 HTTP fetch는 수행하지 않습니다.
 */
export function normalizeShopifyShopDomain(input: string): ShopifyShopDomain {
  const hostname = extractHostname(input);
  const suffix = `.${SHOPIFY_HOST_SUFFIX}`;

  if (hostname === SHOPIFY_HOST_SUFFIX) {
    throw new ShopifyShopDomainError('bare myshopify.com은 허용되지 않습니다.');
  }

  if (!hostname.endsWith(suffix)) {
    const slug = assertValidShopSlug(hostname);
    return `${slug}.${SHOPIFY_HOST_SUFFIX}` as ShopifyShopDomain;
  }

  const slug = hostname.slice(0, -suffix.length);
  if (!slug || slug.includes('.')) {
    throw new ShopifyShopDomainError('Shop URL은 단일 slug.myshopify.com 형식이어야 합니다.');
  }

  assertValidShopSlug(slug);
  return `${slug}.${SHOPIFY_HOST_SUFFIX}` as ShopifyShopDomain;
}

/** SSRF 방어·프록시 allowlist용 hostname 파싱 */
export function parseShopifyShopFromHostname(hostname: string): ShopifyShopDomain | null {
  try {
    return normalizeShopifyShopDomain(hostname);
  } catch {
    return null;
  }
}
