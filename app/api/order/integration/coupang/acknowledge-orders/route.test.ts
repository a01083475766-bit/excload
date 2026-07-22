import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireUserMock = vi.fn();
const getAccountMock = vi.fn();
const toCredentialsMock = vi.fn();
const fetchMock = vi.fn();
const patchMock = vi.fn();
const isExpiredMock = vi.fn((_expiresAt?: unknown) => false);

vi.mock('@/app/lib/order-integration/user-api-auth', () => ({
  requireOrderIntegrationUser: () => requireUserMock(),
  isOrderIntegrationUserAuthFailure: (value: unknown) =>
    Boolean(value && typeof value === 'object' && 'response' in value),
}));

vi.mock('@/app/lib/order-integration/coupang-account', () => ({
  getCoupangAccountForUser: (userId: unknown) => getAccountMock(userId),
  isCoupangApiKeyExpired: (expiresAt: unknown) => isExpiredMock(expiresAt),
  toCoupangCredentials: (account: unknown) => toCredentialsMock(account),
}));

vi.mock('@/app/lib/coupang/client', () => ({
  fetchCoupangOrderSheetByShipmentBoxId: (input: unknown) => fetchMock(input),
  patchCoupangOrderSheetAcknowledgement: (input: unknown) => patchMock(input),
}));

vi.mock('@/app/lib/order-integration/snapshots/persist-order-fetch-result', () => ({
  isOrderSyncSnapshotPersistEnabled: () => false,
  persistOrderSyncSnapshotsFromStandardRows: vi.fn(),
}));

vi.mock('@/app/lib/prisma', () => ({ prisma: {} }));

import { POST } from '@/app/api/order/integration/coupang/acknowledge-orders/route';

const SERVER_VENDOR_ID = 'A00012345';

function mockAcceptThenInstructFetch() {
  fetchMock.mockImplementation(async () => ({
    shipmentBoxId: '123',
    orderId: '456',
    status: 'INSTRUCT',
    orderItems: [{ vendorItemId: '999', sellerProductName: '상품', shippingCount: 1 }],
  }));
  fetchMock.mockImplementationOnce(async () => ({
    shipmentBoxId: '123',
    orderId: '456',
    status: 'ACCEPT',
    orderItems: [{ vendorItemId: '999', sellerProductName: '상품', shippingCount: 1 }],
  }));
}

describe('POST /api/order/integration/coupang/acknowledge-orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserMock.mockResolvedValue({ userId: 'user-1', email: 'a@example.com' });
    getAccountMock.mockResolvedValue({ id: 'acc-1', expiresAt: null });
    toCredentialsMock.mockReturnValue({
      vendorId: SERVER_VENDOR_ID,
      accessKey: 'access',
      secretKey: 'secret',
    });
    mockAcceptThenInstructFetch();
    patchMock.mockResolvedValue({
      httpStatus: 200,
      bodyText:
        '{"responseCode":0,"responseList":[{"shipmentBoxId":123,"succeed":true,"retryRequired":false}]}',
    });
  });

  it('rejects unauthenticated requests', async () => {
    requireUserMock.mockResolvedValue({
      response: new Response(JSON.stringify({ error: '로그인이 필요합니다.' }), { status: 401 }),
    });
    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({ shipmentBoxIds: ['123'] }),
      }),
    );
    expect(res.status).toBe(401);
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('rejects client-supplied vendorId', async () => {
    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({ vendorId: 'EVIL', shipmentBoxIds: ['123'] }),
      }),
    );
    expect(res.status).toBe(400);
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('uses server vendorId in path and acknowledgement body', async () => {
    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({ shipmentBoxIds: ['123'] }),
      }),
    );
    expect(res.status).toBe(200);
    expect(patchMock).toHaveBeenCalledTimes(1);

    const patchInput = patchMock.mock.calls[0]?.[0] as {
      vendorId: string;
      bodyText: string;
    };
    expect(patchInput.vendorId).toBe(SERVER_VENDOR_ID);
    expect(patchInput.bodyText).toContain(`"vendorId":"${SERVER_VENDOR_ID}"`);
    expect(patchInput.bodyText).toContain('"shipmentBoxIds":[123]');

    const body = await res.json();
    expect(body.path).toBe(
      `/v2/providers/openapi/apis/api/v4/vendors/${SERVER_VENDOR_ID}/ordersheets/acknowledgement`,
    );
    expect(fetchMock.mock.calls.every((call) => call[0]?.vendorId === SERVER_VENDOR_ID)).toBe(true);
  });

  it('does not call PATCH when preflight single fetch fails', async () => {
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error('not found'));

    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({ shipmentBoxIds: ['123'] }),
      }),
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(patchMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.summary.failed).toBe(1);
  });

  it('does not call PATCH when preflight status is not ACCEPT', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      shipmentBoxId: '123',
      status: 'INSTRUCT',
      orderItems: [{ sellerProductName: '상품', shippingCount: 1 }],
    });

    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({ shipmentBoxIds: ['123'] }),
      }),
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(patchMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.summary.failed).toBe(1);
  });

  it('returns 404 when coupang account is missing', async () => {
    getAccountMock.mockResolvedValue(null);
    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({ shipmentBoxIds: ['123'] }),
      }),
    );
    expect(res.status).toBe(404);
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('rejects more than 50 unique shipmentBoxIds', async () => {
    const ids = Array.from({ length: 51 }, (_, index) => String(index + 1));
    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({ shipmentBoxIds: ids }),
      }),
    );
    expect(res.status).toBe(400);
    expect(patchMock).not.toHaveBeenCalled();
  });
});
