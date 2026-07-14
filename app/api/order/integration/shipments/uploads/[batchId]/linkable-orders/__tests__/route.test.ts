import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  isAdminEmail: vi.fn(),
  loadLinkableOrdersForShipmentUploadBatch: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock('@/app/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/app/lib/admin-auth', () => ({
  isAdminEmail: mocks.isAdminEmail,
}));

vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

vi.mock('@/app/lib/order-integration/shipments/load-linkable-orders-for-shipment-upload-batch', async () => {
  const actual = await vi.importActual<
    typeof import('@/app/lib/order-integration/shipments/load-linkable-orders-for-shipment-upload-batch')
  >('@/app/lib/order-integration/shipments/load-linkable-orders-for-shipment-upload-batch');

  return {
    ...actual,
    loadLinkableOrdersForShipmentUploadBatch: mocks.loadLinkableOrdersForShipmentUploadBatch,
  };
});

import { GET } from '../route';

function buildRequest(query = '') {
  return new Request(
    `http://localhost/api/order/integration/shipments/uploads/batch-1/linkable-orders${query}`,
    { method: 'GET' },
  );
}

function buildSuccessBody() {
  return {
    success: true,
    batchId: 'batch-1',
    orders: [
      {
        id: 'order-1',
        provider: 'SMARTSTORE',
        integrationAccountId: 'acc-1',
        mallOrderNo: 'ORD-1001',
        excloadOrderNo: 'EXC-1',
        recipientName: '홍*동',
        recipientPhone: '010-****-5678',
        address: '인천 미추홀구 ... 101호',
        orderedAt: '2026-07-08T10:00:00.000Z',
        usedInShipmentMatch: false,
      },
    ],
  };
}

describe('GET /api/order/integration/shipments/uploads/[batchId]/linkable-orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { email: 'user@example.com' } });
    mocks.userFindUnique.mockResolvedValue({ id: 'user-a' });
    mocks.isAdminEmail.mockReturnValue(true);
    mocks.loadLinkableOrdersForShipmentUploadBatch.mockResolvedValue({
      success: true,
      body: buildSuccessBody(),
    });
  });

  it('returns 401 when user is not logged in', async () => {
    mocks.getServerSession.mockResolvedValueOnce(null);

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ batchId: 'batch-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe('로그인이 필요합니다.');
    expect(mocks.loadLinkableOrdersForShipmentUploadBatch).not.toHaveBeenCalled();
  });

  it('allows authenticated non-admin users', async () => {
    mocks.isAdminEmail.mockReturnValueOnce(false);

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ batchId: 'batch-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.loadLinkableOrdersForShipmentUploadBatch).toHaveBeenCalled();
  });

  it('returns 404 when batch is not found for session user', async () => {
    mocks.loadLinkableOrdersForShipmentUploadBatch.mockResolvedValueOnce({
      success: false,
      status: 404,
      error: '업로드 배치를 찾을 수 없습니다.',
    });

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ batchId: 'missing-batch' }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe('업로드 배치를 찾을 수 없습니다.');
  });

  it('loads linkable orders with q and limit for session user', async () => {
    const response = await GET(buildRequest('?q=%ED%99%8D%EA%B8%B8%EB%8F%99&limit=20'), {
      params: Promise.resolve({ batchId: 'batch-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.loadLinkableOrdersForShipmentUploadBatch).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-a',
      batchId: 'batch-1',
      q: '홍길동',
      limit: 20,
    });
    expect(json.success).toBe(true);
    expect(json.orders[0].recipientPhone).toBe('010-****-5678');
  });
});
