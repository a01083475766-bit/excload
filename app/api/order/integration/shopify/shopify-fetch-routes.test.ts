import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isShopifyIntegrationEnabled } from '@/app/lib/shopify/oauth-credentials';

const {
  requireOrderIntegrationUserMock,
  getShopifyAccountForUserMock,
  decryptShopifyAccountCredentialsMock,
  markShopifyAccountSyncResultMock,
  markShopifyAccountTestResultMock,
  fetchShopifyOrdersMock,
  testShopifyConnectionMock,
} = vi.hoisted(() => ({
  requireOrderIntegrationUserMock: vi.fn(),
  getShopifyAccountForUserMock: vi.fn(),
  decryptShopifyAccountCredentialsMock: vi.fn(),
  markShopifyAccountSyncResultMock: vi.fn(),
  markShopifyAccountTestResultMock: vi.fn(),
  fetchShopifyOrdersMock: vi.fn(),
  testShopifyConnectionMock: vi.fn(),
}));

vi.mock('@/app/lib/order-integration/user-api-auth', () => ({
  requireOrderIntegrationUser: requireOrderIntegrationUserMock,
  isOrderIntegrationUserAuthFailure: (auth: { response?: Response }) => Boolean(auth.response),
}));

vi.mock('@/app/lib/order-integration/shopify-account', () => ({
  getShopifyAccountForUser: getShopifyAccountForUserMock,
  decryptShopifyAccountCredentials: decryptShopifyAccountCredentialsMock,
  markShopifyAccountSyncResult: markShopifyAccountSyncResultMock,
  markShopifyAccountTestResult: markShopifyAccountTestResultMock,
}));

vi.mock('@/app/lib/shopify/orders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/lib/shopify/orders')>();
  return {
    ...actual,
    fetchShopifyOrders: fetchShopifyOrdersMock,
    testShopifyConnection: testShopifyConnectionMock,
  };
});

import { POST as fetchOrdersPost } from '@/app/api/order/integration/shopify/fetch-orders/route';
import { POST as testPost } from '@/app/api/order/integration/shopify/test/route';

const ENV_KEYS = ['SHOPIFY_INTEGRATION_ENABLED'] as const;
const envSnapshot: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    envSnapshot[key] = process.env[key];
  }
  requireOrderIntegrationUserMock.mockResolvedValue({ userId: 'user-1', email: 'user@example.com' });
  getShopifyAccountForUserMock.mockResolvedValue({ id: 'acc-1' });
  decryptShopifyAccountCredentialsMock.mockReturnValue({
    shopDomain: 'mystore.myshopify.com',
    accessToken: 'fake-access-token',
    refreshToken: 'fake-refresh-token',
    scope: 'read_orders',
    tokenExpiresAt: null,
    refreshTokenExpiresAt: null,
  });
  markShopifyAccountSyncResultMock.mockResolvedValue(undefined);
  markShopifyAccountTestResultMock.mockResolvedValue(undefined);
  fetchShopifyOrdersMock.mockResolvedValue([
    {
      id: 'gid://shopify/Order/1',
      name: '#1001',
      createdAt: '2026-07-01T10:00:00Z',
      processedAt: '2026-07-01T10:05:00Z',
      displayFinancialStatus: 'PAID',
      displayFulfillmentStatus: 'UNFULFILLED',
      note: '',
      shippingAddress: null,
      customer: null,
      lineItems: [
        {
          id: 'gid://shopify/LineItem/11',
          title: 'T-Shirt',
          variantTitle: 'Blue',
          quantity: 1,
        },
      ],
    },
  ]);
  testShopifyConnectionMock.mockResolvedValue({
    shopName: 'Test Shop',
    myshopifyDomain: 'mystore.myshopify.com',
  });
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (envSnapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = envSnapshot[key];
    }
  }
  vi.clearAllMocks();
});

describe('shopify fetch-orders route', () => {
  it('returns 404 when feature flag is disabled', async () => {
    delete process.env.SHOPIFY_INTEGRATION_ENABLED;

    const response = await fetchOrdersPost();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain('비활성화');
    expect(fetchShopifyOrdersMock).not.toHaveBeenCalled();
  });

  it('fetches orders and returns OrderStandardFile when enabled', async () => {
    process.env.SHOPIFY_INTEGRATION_ENABLED = 'true';

    const response = await fetchOrdersPost();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.orderStandardFile.rows).toHaveLength(1);
    expect(body.previewRows).toHaveLength(1);
    expect(fetchShopifyOrdersMock).toHaveBeenCalledWith({
      shopDomain: 'mystore.myshopify.com',
      accessToken: 'fake-access-token',
      days: 7,
    });
    expect(markShopifyAccountSyncResultMock).toHaveBeenCalledWith({
      accountId: 'acc-1',
      success: true,
    });
  });

  it('rejects read_all_orders scope', async () => {
    process.env.SHOPIFY_INTEGRATION_ENABLED = 'true';
    decryptShopifyAccountCredentialsMock.mockReturnValue({
      shopDomain: 'mystore.myshopify.com',
      accessToken: 'fake-access-token',
      scope: 'read_orders,read_all_orders',
      refreshToken: null,
      tokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    });

    const response = await fetchOrdersPost();
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('read_all_orders');
    expect(fetchShopifyOrdersMock).not.toHaveBeenCalled();
  });
});

describe('shopify test route', () => {
  it('returns 404 when feature flag is disabled', async () => {
    delete process.env.SHOPIFY_INTEGRATION_ENABLED;

    const response = await testPost();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain('비활성화');
    expect(testShopifyConnectionMock).not.toHaveBeenCalled();
  });

  it('tests connection when enabled without exposing token in response', async () => {
    process.env.SHOPIFY_INTEGRATION_ENABLED = 'true';

    const response = await testPost();
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.shopName).toBe('Test Shop');
    expect(serialized).not.toContain('fake-access-token');
    expect(testShopifyConnectionMock).toHaveBeenCalledWith({
      shopDomain: 'mystore.myshopify.com',
      accessToken: 'fake-access-token',
    });
    expect(markShopifyAccountTestResultMock).toHaveBeenCalledWith({
      accountId: 'acc-1',
      success: true,
    });
  });
});

describe('isShopifyIntegrationEnabled default', () => {
  it('is false when env is unset', () => {
    delete process.env.SHOPIFY_INTEGRATION_ENABLED;
    expect(isShopifyIntegrationEnabled()).toBe(false);
  });
});
