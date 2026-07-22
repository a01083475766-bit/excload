import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireUserMock = vi.fn();
const getAccountMock = vi.fn();
const toCredentialsMock = vi.fn();
const fetchByIdsMock = vi.fn();
const confirmMock = vi.fn();
const proxyConfiguredMock = vi.fn(() => true);

vi.mock('@/app/lib/order-integration/user-api-auth', () => ({
  requireOrderIntegrationUser: () => requireUserMock(),
  isOrderIntegrationUserAuthFailure: (value: unknown) =>
    Boolean(value && typeof value === 'object' && 'response' in value),
}));

vi.mock('@/app/lib/order-integration/smartstore-account', () => ({
  getSmartstoreAccountForUser: (userId: unknown) => getAccountMock(userId),
  toSmartstoreCredentials: (account: unknown) => toCredentialsMock(account),
}));

vi.mock('@/app/lib/smartstore/client', async () => {
  const actual = await vi.importActual<typeof import('@/app/lib/smartstore/client')>(
    '@/app/lib/smartstore/client',
  );
  return {
    ...actual,
    fetchSmartstoreProductOrdersByIds: (input: unknown) => fetchByIdsMock(input),
    postSmartstoreProductOrdersConfirm: (input: unknown) => confirmMock(input),
  };
});

vi.mock('@/app/lib/integration-proxy/config', () => ({
  isIntegrationProxyConfigured: () => proxyConfiguredMock(),
}));

vi.mock('@/app/lib/order-integration/snapshots/persist-order-fetch-result', () => ({
  isOrderSyncSnapshotPersistEnabled: () => false,
  persistOrderSyncSnapshotsFromStandardRows: vi.fn(),
}));

vi.mock('@/app/lib/prisma', () => ({ prisma: {} }));

import { POST } from '@/app/api/order/integration/smartstore/confirm-orders/route';

describe('POST /api/order/integration/smartstore/confirm-orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    proxyConfiguredMock.mockReturnValue(true);
    requireUserMock.mockResolvedValue({ userId: 'user-1', email: 'a@example.com' });
    getAccountMock.mockResolvedValue({ id: 'acc-1' });
    toCredentialsMock.mockReturnValue({
      clientId: 'client',
      clientSecret: 'secret',
      authType: 'SELF',
    });
    fetchByIdsMock.mockImplementation(async (input: { productOrderIds: string[] }) =>
      input.productOrderIds.map((productOrderId) => ({
        order: { orderId: `ORDER-${productOrderId}` },
        productOrder: {
          productOrderId,
          productOrderStatus: 'PAYED',
          placeOrderStatus: 'NOT_YET',
          productName: '상품',
          remainQuantity: 1,
          shippingAddress: { name: '홍길동', baseAddress: '서울' },
        },
      })),
    );
    confirmMock.mockResolvedValue({
      httpStatus: 200,
      bodyText: JSON.stringify({
        data: {
          successProductOrderInfos: [{ productOrderId: 'PO-1', isReceiverAddressChanged: false }],
          failProductOrderInfos: [],
        },
      }),
    });
  });

  it('rejects unauthenticated requests', async () => {
    requireUserMock.mockResolvedValue({
      response: new Response(JSON.stringify({ error: '로그인이 필요합니다.' }), { status: 401 }),
    });
    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({ productOrderIds: ['PO-1'] }),
      }),
    );
    expect(res.status).toBe(401);
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('rejects client-supplied secrets', async () => {
    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({
          productOrderIds: ['PO-1'],
          clientSecret: 'leak',
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('uses logged-in user smartstore account only', async () => {
    let fetchCalls = 0;
    fetchByIdsMock.mockImplementation(async (input: { productOrderIds: string[] }) => {
      fetchCalls += 1;
      return input.productOrderIds.map((productOrderId) => ({
        order: { orderId: `ORDER-${productOrderId}` },
        productOrder: {
          productOrderId,
          productOrderStatus: 'PAYED',
          placeOrderStatus: fetchCalls === 1 ? 'NOT_YET' : 'OK',
          productName: '상품',
          remainQuantity: 1,
          shippingAddress: { name: '수취인', baseAddress: '서울' },
        },
      }));
    });

    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({ productOrderIds: ['PO-1'] }),
      }),
    );
    expect(res.status).toBe(200);
    expect(getAccountMock).toHaveBeenCalledWith('user-1');
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(confirmMock.mock.calls[0]?.[0]?.productOrderIds).toEqual(['PO-1']);
    const body = await res.json();
    expect(body.path).toBe('/external/v1/pay-order/seller/product-orders/confirm');
    expect(JSON.stringify(body.results)).not.toContain('secret');
    expect(JSON.stringify(body.results)).not.toContain('client');
    expect(body.summary.confirmed).toBe(1);
  });

  it('does not call confirm when preflight status is not PAYED+NOT_YET', async () => {
    fetchByIdsMock.mockResolvedValue([
      {
        order: { orderId: 'ORDER-1' },
        productOrder: {
          productOrderId: 'PO-1',
          productOrderStatus: 'PAYED',
          placeOrderStatus: 'OK',
          productName: '상품',
        },
      },
    ]);

    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({ productOrderIds: ['PO-1'] }),
      }),
    );
    expect(res.status).toBe(200);
    expect(confirmMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.summary.alreadyConfirmed).toBe(1);
  });

  it('blocks other-account style missing product orders without confirm POST', async () => {
    fetchByIdsMock.mockResolvedValue([]);
    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({ productOrderIds: ['PO-FOREIGN'] }),
      }),
    );
    expect(res.status).toBe(200);
    expect(confirmMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.summary.failed).toBe(1);
  });
});
