import { createHmac } from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeShopifyShopDomain,
  parseShopifyShopFromHostname,
  SHOPIFY_OAUTH_SCOPES,
} from '@/app/lib/shopify/shop-domain';
import {
  buildShopifyAuthorizeUrl,
  buildShopifyOAuthQueryMessage,
  verifyShopifyOAuthHmac,
} from '@/app/lib/shopify/oauth';
import { createShopifyOAuthState, verifyShopifyOAuthState } from '@/app/lib/shopify/oauth-state';

const TEST_STATE_SECRET = Buffer.alloc(32, 9).toString('base64');
const TEST_CLIENT_SECRET = 'test-client-secret';

function withStateSecret<T>(fn: () => T): T {
  const prev =
    process.env.SHOPIFY_OAUTH_STATE_SECRET ??
    process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY ??
    process.env.NEXTAUTH_SECRET;
  process.env.SHOPIFY_OAUTH_STATE_SECRET = TEST_STATE_SECRET;
  try {
    return fn();
  } finally {
    if (prev === undefined) {
      delete process.env.SHOPIFY_OAUTH_STATE_SECRET;
    } else {
      process.env.SHOPIFY_OAUTH_STATE_SECRET = prev;
    }
  }
}

function signShopifyQuery(params: Record<string, string>, secret: string): string {
  const message = buildShopifyOAuthQueryMessage(params);
  return createHmac('sha256', secret).update(message).digest('hex');
}

describe('normalizeShopifyShopDomain', () => {
  it('normalizes slug and full hostname inputs', () => {
    expect(normalizeShopifyShopDomain('mystore')).toBe('mystore.myshopify.com');
    expect(normalizeShopifyShopDomain('mystore.myshopify.com')).toBe('mystore.myshopify.com');
    expect(normalizeShopifyShopDomain('https://mystore.myshopify.com')).toBe('mystore.myshopify.com');
    expect(normalizeShopifyShopDomain('MyStore')).toBe('mystore.myshopify.com');
  });

  it('rejects unsafe hostnames', () => {
    const invalid = [
      'myshopify.com',
      'evil-myshopify.com',
      'myshopify.com.evil.com',
      'a.b.myshopify.com',
      'http://mystore.myshopify.com',
      '127.0.0.1',
      'localhost',
      '-bad.myshopify.com',
      'bad-.myshopify.com',
    ];

    for (const value of invalid) {
      expect(() => normalizeShopifyShopDomain(value)).toThrow();
      expect(parseShopifyShopFromHostname(value)).toBeNull();
    }
  });
});

describe('verifyShopifyOAuthHmac', () => {
  it('accepts valid hmac regardless of parameter order', () => {
    const base = {
      code: '0907a61c0c8d55e99db179b68161bc00',
      shop: 'mystore.myshopify.com',
      state: 'nonce-1',
      timestamp: '1337178173',
    };
    const hmac = signShopifyQuery(base, TEST_CLIENT_SECRET);

    expect(
      verifyShopifyOAuthHmac(
        {
          timestamp: base.timestamp,
          state: base.state,
          shop: base.shop,
          code: base.code,
          hmac,
        },
        TEST_CLIENT_SECRET,
      ),
    ).toBe(true);

    expect(
      verifyShopifyOAuthHmac(
        {
          code: base.code,
          hmac,
          shop: base.shop,
          state: base.state,
          timestamp: base.timestamp,
        },
        TEST_CLIENT_SECRET,
      ),
    ).toBe(true);
  });

  it('rejects invalid or missing hmac', () => {
    const params = {
      code: 'abc',
      shop: 'mystore.myshopify.com',
      state: 'nonce',
      timestamp: '1',
      hmac: signShopifyQuery(
        {
          code: 'abc',
          shop: 'mystore.myshopify.com',
          state: 'nonce',
          timestamp: '1',
        },
        TEST_CLIENT_SECRET,
      ),
    };

    expect(verifyShopifyOAuthHmac(params, TEST_CLIENT_SECRET)).toBe(true);
    expect(verifyShopifyOAuthHmac({ ...params, hmac: 'deadbeef' }, TEST_CLIENT_SECRET)).toBe(false);

    const { hmac: _hmac, ...withoutHmac } = params;
    expect(verifyShopifyOAuthHmac(withoutHmac, TEST_CLIENT_SECRET)).toBe(false);
  });

  it('excludes signature from hmac message', () => {
    const params = {
      code: 'abc',
      shop: 'mystore.myshopify.com',
      state: 'nonce',
      timestamp: '1',
      signature: 'should-be-ignored',
    };
    const hmac = signShopifyQuery(params, TEST_CLIENT_SECRET);
    expect(verifyShopifyOAuthHmac({ ...params, hmac }, TEST_CLIENT_SECRET)).toBe(true);
  });
});

describe('shopify oauth state', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates and verifies signed state', () => {
    withStateSecret(() => {
      const state = createShopifyOAuthState({
        userId: 'user-1',
        accountId: 'acc-1',
        shopDomain: 'mystore',
      });

      const payload = verifyShopifyOAuthState(state);
      expect(payload?.userId).toBe('user-1');
      expect(payload?.accountId).toBe('acc-1');
      expect(payload?.shopDomain).toBe('mystore.myshopify.com');
    });
  });

  it('rejects tampered state', () => {
    withStateSecret(() => {
      const state = createShopifyOAuthState({
        userId: 'user-1',
        accountId: 'acc-1',
        shopDomain: 'mystore',
      });
      const tampered = `${state.slice(0, -1)}x`;
      expect(verifyShopifyOAuthState(tampered)).toBeNull();
    });
  });

  it('rejects expired state', () => {
    withStateSecret(() => {
      const state = createShopifyOAuthState({
        userId: 'user-1',
        accountId: 'acc-1',
        shopDomain: 'mystore',
      });
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60 * 1000);
      expect(verifyShopifyOAuthState(state)).toBeNull();
    });
  });
});

describe('buildShopifyAuthorizeUrl', () => {
  it('builds authorize url with read_orders only', () => {
    const url = buildShopifyAuthorizeUrl({
      shopDomain: 'mystore',
      clientId: 'client-id',
      redirectUri: 'https://example.org/api/order/integration/shopify/callback',
      state: 'signed-state',
    });

    const parsed = new URL(url);
    expect(parsed.protocol).toBe('https:');
    expect(parsed.hostname).toBe('mystore.myshopify.com');
    expect(parsed.pathname).toBe('/admin/oauth/authorize');
    expect(parsed.searchParams.get('client_id')).toBe('client-id');
    expect(parsed.searchParams.get('scope')).toBe(SHOPIFY_OAUTH_SCOPES);
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'https://example.org/api/order/integration/shopify/callback',
    );
    expect(parsed.searchParams.get('state')).toBe('signed-state');
    expect(parsed.searchParams.get('scope')).not.toContain('read_all_orders');
    expect(parsed.searchParams.get('grant_options[]')).toBeNull();
  });

  it('rejects invalid shop domain and read_all_orders scope', () => {
    expect(() =>
      buildShopifyAuthorizeUrl({
        shopDomain: 'evil-myshopify.com',
        clientId: 'client-id',
        redirectUri: 'https://example.org/callback',
        state: 'state',
      }),
    ).toThrow();

    expect(() =>
      buildShopifyAuthorizeUrl({
        shopDomain: 'mystore',
        clientId: 'client-id',
        redirectUri: 'https://example.org/callback',
        state: 'state',
        scopes: 'read_orders,read_all_orders',
      }),
    ).toThrow(/read_all_orders/);
  });
});
