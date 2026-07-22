import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  listCourierDownloadBundleOrders: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock('@/app/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

vi.mock('@/app/lib/order-integration/courier-download/list-courier-download-bundle-orders', async () => {
  const actual = await vi.importActual<
    typeof import('@/app/lib/order-integration/courier-download/list-courier-download-bundle-orders')
  >('@/app/lib/order-integration/courier-download/list-courier-download-bundle-orders');

  return {
    ...actual,
    listCourierDownloadBundleOrders: mocks.listCourierDownloadBundleOrders,
  };
});

import { GET } from '../route';

function buildParams(bundleId: string) {
  return { params: Promise.resolve({ bundleId }) };
}

describe('GET /api/order/integration/orders/courier-download-bundles/[bundleId]/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { email: 'user@example.com' } });
    mocks.userFindUnique.mockResolvedValue({ id: 'user-a' });
  });

  it('returns 401 when user is not logged in', async () => {
    mocks.getServerSession.mockResolvedValueOnce(null);
    const response = await GET(new Request('http://localhost/x'), buildParams('bundle-1'));
    expect(response.status).toBe(401);
    expect(mocks.listCourierDownloadBundleOrders).not.toHaveBeenCalled();
  });

  it('returns allowed DTO fields for owned bundle', async () => {
    mocks.listCourierDownloadBundleOrders.mockResolvedValue({
      ok: true,
      bundleId: 'bundle-1',
      orderCount: 1,
      orders: [
        {
          id: 'w1',
          mallLabel: '스마트스토어',
          mallOrderNo: '20260722-1',
          sourceType: 'API',
          sourceTypeLabel: 'API 주문',
          excloadOrderNo: 'EXC-1',
        },
      ],
    });

    const response = await GET(new Request('http://localhost/x'), buildParams('bundle-1'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      success: true,
      bundleId: 'bundle-1',
      orderCount: 1,
      orders: [
        {
          id: 'w1',
          mallLabel: '스마트스토어',
          mallOrderNo: '20260722-1',
          sourceType: 'API',
          sourceTypeLabel: 'API 주문',
          excloadOrderNo: 'EXC-1',
        },
      ],
    });
    expect(JSON.stringify(body)).not.toMatch(/recipient|phone|address|rawRowJson|rawPayload|secret/i);
    expect(mocks.listCourierDownloadBundleOrders).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'user-a', bundleId: 'bundle-1' }),
    );
  });

  it('returns 404 for other user / expired / missing bundle', async () => {
    mocks.listCourierDownloadBundleOrders.mockResolvedValue({ ok: false, reason: 'NOT_FOUND' });
    const response = await GET(new Request('http://localhost/x'), buildParams('foreign'));
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe('Download bundle not found.');
  });

  it('returns 500 on unexpected failure', async () => {
    mocks.listCourierDownloadBundleOrders.mockRejectedValue(new Error('boom'));
    const response = await GET(new Request('http://localhost/x'), buildParams('bundle-1'));
    expect(response.status).toBe(500);
  });
});
