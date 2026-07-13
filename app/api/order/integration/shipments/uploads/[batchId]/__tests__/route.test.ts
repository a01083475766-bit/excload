import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  isAdminEmail: vi.fn(),
  loadShipmentUploadBatchDetail: vi.fn(),
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

vi.mock('@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail', async () => {
  const actual = await vi.importActual<
    typeof import('@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail')
  >('@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail');

  return {
    ...actual,
    loadShipmentUploadBatchDetail: mocks.loadShipmentUploadBatchDetail,
  };
});

import { GET } from '../route';

function buildRequest() {
  return new Request('http://localhost/api/order/integration/shipments/uploads/batch-1', {
    method: 'GET',
  });
}

function buildSuccessBody() {
  return {
    success: true,
    uploadBatch: {
      id: 'batch-1',
      provider: 'SMARTSTORE',
      integrationAccountId: 'acc-1',
      originalFileName: 'shipments.csv',
      fileSize: 12345,
      fileType: 'text/csv',
      rowCount: 1,
      matchedConfidentCount: 1,
      matchedWarningCount: 0,
      multipleCandidatesCount: 0,
      notMatchedCount: 0,
      duplicateTrackingNumberCount: 0,
      alreadyShippedCount: 0,
      cancelledOrInvalidOrderCount: 0,
      status: 'MATCHED',
      createdAt: '2026-07-09T08:00:00.000Z',
    },
    rows: [
      {
        uploadRowId: 'row-1',
        matchId: 'match-1',
        originalRowIndex: 0,
        algorithmMatchStatus: 'MATCHED_CONFIDENT',
        userConfirmationStatus: 'UNCONFIRMED',
        transmissionStatus: 'NONE',
        provider: '스마트스토어',
        excloadOrderNo: 'EXC-1',
        mallOrderNo: 'ORD-1',
        receiverPhoneMasked: '010-****-1234',
        receiverAddressMasked: '서울시 강남구 ... 123',
        trackingNumberMasked: '1234****5678',
        productSummary: '티셔츠',
        matchReason: 'exact',
        matchScore: 100,
      },
    ],
    summary: {
      totalRows: 1,
      matchedConfidentCount: 1,
      matchedWarningCount: 0,
      multipleCandidatesCount: 0,
      notMatchedCount: 0,
      duplicateTrackingNumberCount: 0,
      alreadyShippedCount: 0,
      cancelledOrInvalidOrderCount: 0,
    },
  };
}

describe('GET /api/order/integration/shipments/uploads/[batchId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { email: 'user@example.com' } });
    mocks.userFindUnique.mockResolvedValue({ id: 'user-a' });
    mocks.isAdminEmail.mockReturnValue(true);
    mocks.loadShipmentUploadBatchDetail.mockResolvedValue({
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
    expect(mocks.loadShipmentUploadBatchDetail).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not admin', async () => {
    mocks.isAdminEmail.mockReturnValueOnce(false);

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ batchId: 'batch-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe('관리자 권한이 필요합니다.');
    expect(mocks.loadShipmentUploadBatchDetail).not.toHaveBeenCalled();
  });

  it('returns 400 when batchId is missing', async () => {
    const response = await GET(buildRequest(), {
      params: Promise.resolve({ batchId: '   ' }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('batchId가 필요합니다.');
    expect(mocks.loadShipmentUploadBatchDetail).not.toHaveBeenCalled();
  });

  it('returns 404 when batch is not found for session user', async () => {
    mocks.loadShipmentUploadBatchDetail.mockResolvedValueOnce({
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

  it('loads batch detail with session userId', async () => {
    const response = await GET(buildRequest(), {
      params: Promise.resolve({ batchId: 'batch-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.loadShipmentUploadBatchDetail).toHaveBeenCalledWith(
      expect.anything(),
      {
        userId: 'user-a',
        batchId: 'batch-1',
      },
    );
    expect(json.success).toBe(true);
    expect(json.uploadBatch.id).toBe('batch-1');
    expect(json.rows[0].userConfirmationStatus).toBe('UNCONFIRMED');
    expect(json.rows[0].transmissionStatus).toBe('NONE');
    expect(json.summary.totalRows).toBe(1);
  });
});
