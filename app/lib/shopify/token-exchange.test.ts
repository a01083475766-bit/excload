import { describe, expect, it, vi } from 'vitest';
import { buildShopifyAuthorizeUrl } from '@/app/lib/shopify/oauth';
import {
  isShopifyOAuthConfigured,
  resolveShopifyClientId,
  resolveShopifyOAuthRedirectUri,
} from '@/app/lib/shopify/oauth-credentials';
import {
  computeExpiryFromSeconds,
  exchangeShopifyAuthorizationCode,
  parseShopifyTokenExchangeResponse,
  sanitizeShopifyGrantedScope,
} from '@/app/lib/shopify/token-exchange';
import { SHOPIFY_OAUTH_SCOPES } from '@/app/lib/shopify/shop-domain';
import { EXCLOAD_INTEGRATION_INFO } from '@/app/lib/order-integration/malls';

describe('shopify oauth credentials', () => {
  it('resolves redirect uri from default excload host', () => {
    const prev = process.env.SHOPIFY_OAUTH_REDIRECT_URI;
    delete process.env.SHOPIFY_OAUTH_REDIRECT_URI;
    expect(resolveShopifyOAuthRedirectUri()).toBe(
      `${EXCLOAD_INTEGRATION_INFO.url}/api/order/integration/shopify/callback`,
    );
    if (prev !== undefined) process.env.SHOPIFY_OAUTH_REDIRECT_URI = prev;
  });

  it('detects missing client id without hardcoding secrets', () => {
    const prevId = process.env.SHOPIFY_CLIENT_ID;
    const prevSecret = process.env.SHOPIFY_CLIENT_SECRET;
    delete process.env.SHOPIFY_CLIENT_ID;
    delete process.env.SHOPIFY_CLIENT_SECRET;

    expect(isShopifyOAuthConfigured()).toBe(false);
    expect(() => resolveShopifyClientId()).toThrow(/SHOPIFY_CLIENT_ID/);

    if (prevId !== undefined) process.env.SHOPIFY_CLIENT_ID = prevId;
    if (prevSecret !== undefined) process.env.SHOPIFY_CLIENT_SECRET = prevSecret;
  });
});

describe('token exchange expiry helpers', () => {
  it('computes tokenExpiresAt from expires_in', () => {
    const now = Date.parse('2026-07-08T10:00:00.000Z');
    expect(computeExpiryFromSeconds(3600, now)?.toISOString()).toBe('2026-07-08T11:00:00.000Z');
    expect(computeExpiryFromSeconds(null, now)).toBeNull();
  });

  it('parses expiring offline token response', () => {
    const now = Date.parse('2026-07-08T10:00:00.000Z');
    const tokens = parseShopifyTokenExchangeResponse(
      JSON.stringify({
        access_token: 'fake-access-token',
        scope: 'read_orders',
        expires_in: 3600,
        refresh_token: 'fake-refresh-token',
        refresh_token_expires_in: 7776000,
      }),
      now,
    );

    expect(tokens.accessToken).toBe('fake-access-token');
    expect(tokens.refreshToken).toBe('fake-refresh-token');
    expect(tokens.scope).toBe('read_orders');
    expect(tokens.tokenExpiresAt?.toISOString()).toBe('2026-07-08T11:00:00.000Z');
    expect(tokens.refreshTokenExpiresAt?.toISOString()).toBe('2026-10-06T10:00:00.000Z');
  });

  it('exchanges code with expiring=1 via mocked fetch', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://mystore.myshopify.com/admin/oauth/access_token');
      expect(init?.method).toBe('POST');
      const body = String(init?.body ?? '');
      expect(body).toContain('client_id=test-client-id');
      expect(body).toContain('code=auth-code');
      expect(body).toContain('expiring=1');
      expect(body).not.toContain('read_all_orders');
      // secret is in body for Shopify API but must not be logged by caller
      expect(body).toContain('client_secret=test-client-secret');

      return new Response(
        JSON.stringify({
          access_token: 'fake-access-token',
          scope: 'read_orders',
          expires_in: 3600,
          refresh_token: 'fake-refresh-token',
          refresh_token_expires_in: 7776000,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const now = Date.parse('2026-07-08T10:00:00.000Z');
    const tokens = await exchangeShopifyAuthorizationCode({
      shopDomain: 'mystore',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      code: 'auth-code',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      nowMs: now,
    });

    expect(tokens.accessToken).toBe('fake-access-token');
    expect(tokens.tokenExpiresAt?.toISOString()).toBe('2026-07-08T11:00:00.000Z');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid shop domain before fetch', async () => {
    const fetchImpl = vi.fn();
    await expect(
      exchangeShopifyAuthorizationCode({
        shopDomain: 'evil-myshopify.com',
        clientId: 'id',
        clientSecret: 'secret',
        code: 'code',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('strips read_all_orders from granted scope for 1차 storage', () => {
    expect(sanitizeShopifyGrantedScope('read_orders')).toBe('read_orders');
    expect(sanitizeShopifyGrantedScope('read_orders,read_all_orders')).toBe('read_orders');
  });
});

describe('connect authorize url helpers', () => {
  it('builds redirect URL with verified shopDomain and read_orders only', () => {
    const url = buildShopifyAuthorizeUrl({
      shopDomain: 'https://mystore.myshopify.com',
      clientId: 'client-id',
      redirectUri: resolveShopifyOAuthRedirectUri(),
      state: 'signed-state',
      scopes: SHOPIFY_OAUTH_SCOPES,
    });

    const parsed = new URL(url);
    expect(parsed.hostname).toBe('mystore.myshopify.com');
    expect(parsed.searchParams.get('scope')).toBe('read_orders');
    expect(parsed.searchParams.get('scope')).not.toContain('read_all_orders');
    expect(parsed.searchParams.get('state')).toBe('signed-state');
    expect(parsed.searchParams.get('redirect_uri')).toContain('/api/order/integration/shopify/callback');
  });
});
