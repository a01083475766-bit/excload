import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  isAdminEmail: vi.fn(),
  linkShipmentUploadMatch: vi.fn(),
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

vi.mock('@/app/lib/order-integration/shipments/link-shipment-upload-match', async () => {
  const actual = await vi.importActual<
    typeof import('@/app/lib/order-integration/shipments/link-shipment-upload-match')
  >('@/app/lib/order-integration/shipments/link-shipment-upload-match');

  return {
    ...actual,
    linkShipmentUploadMatch: mocks.linkShipmentUploadMatch,
  };
});

import { POST } from '../route';

function buildRequest(body?: Record<string, unknown>) {
  return new Request(
    'http://localhost/api/order/integration/shipments/uploads/batch-1/matches/match-1/link',
    {
      method: 'POST',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    },
  );
}

function buildSuccessBody() {
  return {
    success: true,
    linkedMatchId: 'match-1',
    orderSyncOrderId: 'order-1',
    match: {
      shipmentRowIndex: 0,
      matchStatus: 'NOT_MATCHED',
      matchReason: 'manual link',
      providerLabel: '스마트스토어',
      mallOrderNo: 'ORD-1',
      excloadOrderNo: 'EXC-1',
      receiverName: '홍길동',
      receiverPhoneMasked: '010-****-5678',
      receiverAddressMasked: '서울시 ... 123',
      productSummary: '티셔츠',
      carrierName: 'CJ대한통운',
      trackingNumberMasked: '1234****5678',
      matchId: 'match-1',
      uploadRowId: 'row-1',
      userConfirmationStatus: 'MANUALLY_LINKED',
      transmissionStatus: 'NONE',
    },
    uploadBatch: { id: 'batch-1', rowCount: 1 },
    rows: [],
    summary: { totalRows: 1 },
  };
}

describe('POST /api/order/integration/shipments/uploads/[batchId]/matches/[matchId]/link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { email: 'user@example.com' } });
    mocks.userFindUnique.mockResolvedValue({ id: 'user-a' });
    mocks.isAdminEmail.mockReturnValue(true);
    mocks.linkShipmentUploadMatch.mockResolvedValue({
      success: true,
      body: buildSuccessBody(),
    });
  });

  it('returns 401 when user is not logged in', async () => {
    mocks.getServerSession.mockResolvedValueOnce(null);

    const response = await POST(buildRequest({ orderSyncOrderId: 'order-1' }), {
      params: Promise.resolve({ batchId: 'batch-1', matchId: 'match-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe('로그인이 필요합니다.');
    expect(mocks.linkShipmentUploadMatch).not.toHaveBeenCalled();
  });

  it('allows authenticated non-admin users', async () => {
    mocks.isAdminEmail.mockReturnValueOnce(false);

    const response = await POST(buildRequest({ orderSyncOrderId: 'order-1' }), {
      params: Promise.resolve({ batchId: 'batch-1', matchId: 'match-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.linkShipmentUploadMatch).toHaveBeenCalled();
  });

  it('returns 400 when orderSyncOrderId is missing', async () => {
    const response = await POST(buildRequest({}), {
      params: Promise.resolve({ batchId: 'batch-1', matchId: 'match-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('orderSyncOrderId가 필요합니다.');
  });

  it('links match with session userId and orderSyncOrderId', async () => {
    const response = await POST(buildRequest({ orderSyncOrderId: 'order-1' }), {
      params: Promise.resolve({ batchId: 'batch-1', matchId: 'match-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.linkShipmentUploadMatch).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-1',
      orderSyncOrderId: 'order-1',
    });
    expect(json.linkedMatchId).toBe('match-1');
    expect(json.orderSyncOrderId).toBe('order-1');
    expect(json.match.userConfirmationStatus).toBe('MANUALLY_LINKED');
  });

  it('returns 404 when link service reports missing order', async () => {
    mocks.linkShipmentUploadMatch.mockResolvedValueOnce({
      success: false,
      status: 404,
      error: '연결할 주문을 찾을 수 없습니다.',
    });

    const response = await POST(buildRequest({ orderSyncOrderId: 'missing-order' }), {
      params: Promise.resolve({ batchId: 'batch-1', matchId: 'match-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe('연결할 주문을 찾을 수 없습니다.');
  });
});
