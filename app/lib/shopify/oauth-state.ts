import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { ShopifyOAuthStatePayload } from '@/app/lib/shopify/types';
import { normalizeShopifyShopDomain, parseShopifyShopFromHostname } from '@/app/lib/shopify/shop-domain';

const STATE_TTL_MS = 10 * 60 * 1000;

function getOAuthStateSecret(): string {
  const secret =
    process.env.SHOPIFY_OAUTH_STATE_SECRET?.trim() ||
    process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    '';
  if (!secret) {
    throw new Error('OAuth state 서명 키가 설정되지 않았습니다.');
  }
  return secret;
}

function signPayload(encodedPayload: string): string {
  return createHmac('sha256', getOAuthStateSecret()).update(encodedPayload).digest('base64url');
}

export function createShopifyOAuthState(input: {
  userId: string;
  accountId: string;
  shopDomain: string;
}): string {
  const shopDomain = normalizeShopifyShopDomain(input.shopDomain);
  const payload: ShopifyOAuthStatePayload = {
    userId: input.userId,
    accountId: input.accountId,
    shopDomain,
    nonce: randomBytes(16).toString('hex'),
    ts: Date.now(),
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyShopifyOAuthState(state: string): ShopifyOAuthStatePayload | null {
  const [encodedPayload, signature] = state.split('.');
  if (!encodedPayload || !signature) return null;

  const expected = signPayload(encodedPayload);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  let payload: ShopifyOAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as ShopifyOAuthStatePayload;
  } catch {
    return null;
  }

  if (!payload.userId || !payload.accountId || !payload.shopDomain || !payload.nonce || !payload.ts) {
    return null;
  }

  if (parseShopifyShopFromHostname(payload.shopDomain) === null) {
    return null;
  }

  if (Date.now() - payload.ts > STATE_TTL_MS) {
    return null;
  }

  return payload;
}
