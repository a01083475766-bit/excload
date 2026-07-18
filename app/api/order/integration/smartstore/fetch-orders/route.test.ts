import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchOrders: vi.fn(),
  getAccount: vi.fn(),
  markResult: vi.fn(),
  beginOperation: vi.fn(),
}));

vi.mock('@/app/lib/order-integration/user-api-auth', () => ({
  requireOrderIntegrationUser: vi.fn(async () => ({ userId: 'user-1' })),
  isOrderIntegrationUserAuthFailure: vi.fn(() => false),
}));

vi.mock('@/app/lib/integration-proxy/config', () => ({
  isIntegrationProxyConfigured: vi.fn(() => true),
}));

vi.mock('@/app/lib/prisma', () => ({ prisma: {} }));

vi.mock('@/app/lib/order-integration/smartstore-account', () => ({
  getSmartstoreAccountForUser: mocks.getAccount,
  markSmartstoreAccountSyncResult: mocks.markResult,
  toSmartstoreCredentials: vi.fn(() => ({ clientId: 'id', clientSecret: 'secret', authType: 'SELF' })),
}));

vi.mock('@/app/lib/smartstore/client', () => ({
  fetchSmartstoreProductOrders: mocks.fetchOrders,
}));

vi.mock('@/app/lib/order-integration/connection-health/concurrency', () => ({
  beginConnectionHealthOperation: mocks.beginOperation,
}));

vi.mock('@/app/lib/smartstore/map-smartstore-orders', () => ({
  SMARTSTORE_PREVIEW_HEADERS: ['주문번호'],
  mapSmartstoreOrdersToFetchViews: vi.fn(() => []),
  mapSmartstoreOrdersToOrderStandardFile: vi.fn(() => ({ rows: [] })),
  mapSmartstoreOrdersToPreviewRows: vi.fn(() => []),
}));

vi.mock('@/app/lib/order-integration/snapshots/persist-order-fetch-result', () => ({
  isOrderSyncSnapshotPersistEnabled: vi.fn(() => false),
  maybePersistOrderFetchResult: vi.fn(async () => ({ persisted: false })),
}));

import { POST } from './route';

function request(body: unknown): Request {
  return new Request('http://localhost/api/order/integration/smartstore/fetch-orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/order/integration/smartstore/fetch-orders', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T06:00:00.000Z'));
    vi.clearAllMocks();
    mocks.getAccount.mockResolvedValue({ id: 'account-1' });
    mocks.fetchOrders.mockResolvedValue([]);
    mocks.beginOperation.mockResolvedValue({ started: true, operationSequence: BigInt(11) });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [{ from: '2026-07-18' }],
    [{ to: '2026-07-18' }],
    [{ from: '2026-07-18', to: '' }],
  ])('날짜 범위 한쪽만 전달되면 400으로 거부한다: %o', async (body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: '시작일과 종료일을 모두 입력해 주세요.',
    });
    expect(mocks.fetchOrders).not.toHaveBeenCalled();
    expect(mocks.beginOperation).not.toHaveBeenCalled();
  });

  it('표시한 KST 날짜 범위를 실제 주문 API 범위로 사용하고 내부 debug를 반환하지 않는다', async () => {
    const response = await POST(request({ from: '2026-07-12', to: '2026-07-18' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.fetchOrders).toHaveBeenCalledWith({
      credentials: expect.any(Object),
      range: {
        fromMs: Date.parse('2026-07-11T15:00:00.000Z'),
        toMs: Date.parse('2026-07-18T06:00:00.000Z'),
      },
    });
    expect(mocks.beginOperation).toHaveBeenCalledWith({
      accountId: 'account-1',
      userId: 'user-1',
      source: 'fetch_orders',
    });
    expect(mocks.beginOperation.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.fetchOrders.mock.invocationCallOrder[0]!,
    );
    expect(mocks.markResult).toHaveBeenCalledWith({
      accountId: 'account-1',
      userId: 'user-1',
      operationSequence: BigInt(11),
      result: { success: true },
    });
    expect(body).not.toHaveProperty('debug');
    expect(JSON.stringify(body)).not.toContain('transport');
  });

  it('operation 시작이 거부되면 주문 API를 호출하지 않는다', async () => {
    mocks.beginOperation.mockResolvedValue({ started: false, reason: 'NOT_FOUND' });

    const response = await POST(request({ from: '2026-07-12', to: '2026-07-18' }));

    expect(response.status).toBe(404);
    expect(mocks.fetchOrders).not.toHaveBeenCalled();
    expect(mocks.markResult).not.toHaveBeenCalled();
  });
});
