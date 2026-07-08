import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  isShopifyIntegrationEnabled,
  isShopifyOAuthConfigured,
} from '@/app/lib/shopify/oauth-credentials';
import { SHOPIFY_OAUTH_SCOPES } from '@/app/lib/shopify/shop-domain';

const {
  requireOrderIntegrationAdminMock,
  upsertShopifyAccountMock,
  buildShopifyAuthorizeUrlMock,
  createShopifyOAuthStateMock,
  resolveShopifyClientIdMock,
  exchangeShopifyAuthorizationCodeMock,
  saveShopifyOAuthTokensMock,
  verifyShopifyOAuthHmacMock,
  verifyShopifyOAuthStateMock,
  getShopifyAccountByIdMock,
  getServerSessionMock,
  isAdminEmailMock,
} = vi.hoisted(() => ({
  requireOrderIntegrationAdminMock: vi.fn(),
  upsertShopifyAccountMock: vi.fn(),
  buildShopifyAuthorizeUrlMock: vi.fn(),
  createShopifyOAuthStateMock: vi.fn(),
  resolveShopifyClientIdMock: vi.fn(),
  exchangeShopifyAuthorizationCodeMock: vi.fn(),
  saveShopifyOAuthTokensMock: vi.fn(),
  verifyShopifyOAuthHmacMock: vi.fn(),
  verifyShopifyOAuthStateMock: vi.fn(),
  getShopifyAccountByIdMock: vi.fn(),
  getServerSessionMock: vi.fn(),
  isAdminEmailMock: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock('@/app/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/app/lib/admin-auth', () => ({
  isAdminEmail: isAdminEmailMock,
}));

vi.mock('@/app/lib/order-integration/admin-api-auth', () => ({
  requireOrderIntegrationAdmin: requireOrderIntegrationAdminMock,
  isAdminAuthFailure: (auth: { response?: Response }) => Boolean(auth.response),
}));

vi.mock('@/app/lib/order-integration/shopify-account', () => ({
  upsertShopifyAccount: upsertShopifyAccountMock,
  getShopifyAccountById: getShopifyAccountByIdMock,
  saveShopifyOAuthTokens: saveShopifyOAuthTokensMock,
}));

vi.mock('@/app/lib/shopify/oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/lib/shopify/oauth')>();
  return {
    ...actual,
    buildShopifyAuthorizeUrl: buildShopifyAuthorizeUrlMock,
    verifyShopifyOAuthHmac: verifyShopifyOAuthHmacMock,
  };
});

vi.mock('@/app/lib/shopify/oauth-state', () => ({
  createShopifyOAuthState: createShopifyOAuthStateMock,
  verifyShopifyOAuthState: verifyShopifyOAuthStateMock,
}));

vi.mock('@/app/lib/shopify/token-exchange', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/lib/shopify/token-exchange')>();
  return {
    ...actual,
    exchangeShopifyAuthorizationCode: exchangeShopifyAuthorizationCodeMock,
  };
});

vi.mock('@/app/lib/shopify/oauth-credentials', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/lib/shopify/oauth-credentials')>();
  return {
    ...actual,
    resolveShopifyClientId: resolveShopifyClientIdMock,
  };
});

import { GET as connectGet } from '@/app/api/order/integration/shopify/connect/route';
import { GET as callbackGet } from '@/app/api/order/integration/shopify/callback/route';

const ENV_KEYS = [
  'SHOPIFY_INTEGRATION_ENABLED',
  'SHOPIFY_CLIENT_ID',
  'SHOPIFY_CLIENT_SECRET',
] as const;

const envSnapshot: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    envSnapshot[key] = process.env[key];
  }
  vi.clearAllMocks();
  requireOrderIntegrationAdminMock.mockResolvedValue({ userId: 'user-1', email: 'admin@example.com' });
  resolveShopifyClientIdMock.mockReturnValue('test-client-id');
  process.env.SHOPIFY_CLIENT_ID = 'test-client-id';
  process.env.SHOPIFY_CLIENT_SECRET = 'test-client-secret';
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const prev = envSnapshot[key];
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
});

describe('isShopifyIntegrationEnabled', () => {
  it('defaults to false and only enables on exact true', () => {
    delete process.env.SHOPIFY_INTEGRATION_ENABLED;
    expect(isShopifyIntegrationEnabled()).toBe(false);

    process.env.SHOPIFY_INTEGRATION_ENABLED = 'false';
    expect(isShopifyIntegrationEnabled()).toBe(false);

    process.env.SHOPIFY_INTEGRATION_ENABLED = 'TRUE';
    expect(isShopifyIntegrationEnabled()).toBe(false);

    process.env.SHOPIFY_INTEGRATION_ENABLED = 'true';
    expect(isShopifyIntegrationEnabled()).toBe(true);
  });
});

describe('shopify connect feature flag', () => {
  it('returns 404 when disabled and does not build authorize URL', async () => {
    delete process.env.SHOPIFY_INTEGRATION_ENABLED;
    delete process.env.SHOPIFY_CLIENT_ID;
    delete process.env.SHOPIFY_CLIENT_SECRET;

    const res = await connectGet(
      new NextRequest('http://localhost/api/order/integration/shopify/connect?shop=mystore'),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/비활성화/);
    expect(buildShopifyAuthorizeUrlMock).not.toHaveBeenCalled();
    expect(upsertShopifyAccountMock).not.toHaveBeenCalled();
    expect(createShopifyOAuthStateMock).not.toHaveBeenCalled();
  });

  it('returns 500 for missing credentials only when enabled', async () => {
    process.env.SHOPIFY_INTEGRATION_ENABLED = 'true';
    delete process.env.SHOPIFY_CLIENT_ID;
    delete process.env.SHOPIFY_CLIENT_SECRET;

    expect(isShopifyOAuthConfigured()).toBe(false);

    const res = await connectGet(
      new NextRequest('http://localhost/api/order/integration/shopify/connect?shop=mystore'),
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/SHOPIFY_CLIENT_ID/);
    expect(buildShopifyAuthorizeUrlMock).not.toHaveBeenCalled();
  });

  it('builds authorize URL with read_orders when enabled', async () => {
    process.env.SHOPIFY_INTEGRATION_ENABLED = 'true';
    upsertShopifyAccountMock.mockResolvedValue({
      id: 'acc-1',
      vendorId: 'mystore.myshopify.com',
    });
    createShopifyOAuthStateMock.mockReturnValue('signed-state');
    buildShopifyAuthorizeUrlMock.mockReturnValue(
      'https://mystore.myshopify.com/admin/oauth/authorize?scope=read_orders&state=signed-state',
    );

    const res = await connectGet(
      new NextRequest('http://localhost/api/order/integration/shopify/connect?shop=mystore'),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('mystore.myshopify.com');
    expect(buildShopifyAuthorizeUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shopDomain: 'mystore.myshopify.com',
        scopes: SHOPIFY_OAUTH_SCOPES,
        state: 'signed-state',
      }),
    );
    expect(SHOPIFY_OAUTH_SCOPES).toBe('read_orders');
    expect(SHOPIFY_OAUTH_SCOPES).not.toContain('read_all_orders');
  });
});

describe('shopify callback feature flag', () => {
  it('redirects disabled without token exchange or save', async () => {
    delete process.env.SHOPIFY_INTEGRATION_ENABLED;

    const res = await callbackGet(
      new NextRequest(
        'http://localhost/api/order/integration/shopify/callback?code=secret-code&state=state&shop=mystore.myshopify.com&hmac=abc',
      ),
    );

    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('status=disabled');
    expect(location).not.toContain('secret-code');
    expect(location).not.toContain('hmac=');
    expect(verifyShopifyOAuthHmacMock).not.toHaveBeenCalled();
    expect(exchangeShopifyAuthorizationCodeMock).not.toHaveBeenCalled();
    expect(saveShopifyOAuthTokensMock).not.toHaveBeenCalled();
    expect(verifyShopifyOAuthStateMock).not.toHaveBeenCalled();
  });

  it('runs exchange and save when enabled and checks pass', async () => {
    process.env.SHOPIFY_INTEGRATION_ENABLED = 'true';
    process.env.SHOPIFY_OAUTH_STATE_SECRET = Buffer.alloc(32, 3).toString('base64');
    process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');

    verifyShopifyOAuthStateMock.mockReturnValue({
      userId: 'user-1',
      accountId: 'acc-1',
      shopDomain: 'mystore.myshopify.com',
      nonce: 'n',
      ts: Date.now(),
    });
    verifyShopifyOAuthHmacMock.mockReturnValue(true);
    getServerSessionMock.mockResolvedValue({ user: { email: 'admin@example.com' } });
    isAdminEmailMock.mockReturnValue(true);
    getShopifyAccountByIdMock.mockResolvedValue({
      id: 'acc-1',
      vendorId: 'mystore.myshopify.com',
      userId: 'user-1',
    });
    exchangeShopifyAuthorizationCodeMock.mockResolvedValue({
      accessToken: 'fake-access',
      refreshToken: 'fake-refresh',
      scope: 'read_orders',
      tokenExpiresAt: new Date('2026-07-08T11:00:00.000Z'),
      refreshTokenExpiresAt: new Date('2026-10-01T00:00:00.000Z'),
      expiresIn: 3600,
      refreshTokenExpiresIn: 7776000,
    });
    saveShopifyOAuthTokensMock.mockResolvedValue({ id: 'acc-1' });

    const res = await callbackGet(
      new NextRequest(
        'http://localhost/api/order/integration/shopify/callback?code=auth-code&state=signed&shop=mystore.myshopify.com&hmac=valid',
      ),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('status=success');
    expect(exchangeShopifyAuthorizationCodeMock).toHaveBeenCalledTimes(1);
    expect(saveShopifyOAuthTokensMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-1',
        accessToken: 'fake-access',
        scope: 'read_orders',
      }),
    );
    expect(saveShopifyOAuthTokensMock.mock.calls[0]?.[0]?.scope).not.toContain('read_all_orders');
  });
});
