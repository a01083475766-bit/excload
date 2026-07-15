import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  confirmShipmentUploadMatch: vi.fn(),
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

vi.mock('@/app/lib/order-integration/shipments/confirm-shipment-upload-match', async () => {
  const actual = await vi.importActual<
    typeof import('@/app/lib/order-integration/shipments/confirm-shipment-upload-match')
  >('@/app/lib/order-integration/shipments/confirm-shipment-upload-match');

  return {
    ...actual,
    confirmShipmentUploadMatch: mocks.confirmShipmentUploadMatch,
  };
});

import { POST } from '../route';

function buildRequest() {
  return new Request(
    'http://localhost/api/order/integration/shipments/uploads/batch-1/matches/match-1/confirm',
    { method: 'POST' },
  );
}

function buildSuccessBody() {
  return {
    success: true,
    confirmedMatchId: 'match-1',
    match: {
      shipmentRowIndex: 0,
      matchStatus: 'MATCHED_CONFIDENT',
      matchReason: 'exact',
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
      userConfirmationStatus: 'CONFIRMED',
      transmissionStatus: 'NONE',
    },
    uploadBatch: { id: 'batch-1', rowCount: 1 },
    rows: [],
    summary: { totalRows: 1 },
  };
}

describe('POST /api/order/integration/shipments/uploads/[batchId]/matches/[matchId]/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { email: 'user@example.com' } });
    mocks.userFindUnique.mockResolvedValue({ id: 'user-a' });
    mocks.confirmShipmentUploadMatch.mockResolvedValue({
      success: true,
      body: buildSuccessBody(),
    });
  });

  it('returns 401 when user is not logged in', async () => {
    mocks.getServerSession.mockResolvedValueOnce(null);

    const response = await POST(buildRequest(), {
      params: Promise.resolve({ batchId: 'batch-1', matchId: 'match-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe('로그인이 필요합니다.');
    expect(mocks.confirmShipmentUploadMatch).not.toHaveBeenCalled();
  });

  it('returns 400 when matchId is missing', async () => {
    const response = await POST(buildRequest(), {
      params: Promise.resolve({ batchId: 'batch-1', matchId: '   ' }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('matchId가 필요합니다.');
  });

  it('confirms match with session userId and batch/match isolation', async () => {
    const response = await POST(buildRequest(), {
      params: Promise.resolve({ batchId: 'batch-1', matchId: 'match-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.confirmShipmentUploadMatch).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-1',
    });
    expect(json.confirmedMatchId).toBe('match-1');
    expect(json.match.userConfirmationStatus).toBe('CONFIRMED');
  });

  it('returns 404 when confirm service reports missing match', async () => {
    mocks.confirmShipmentUploadMatch.mockResolvedValueOnce({
      success: false,
      status: 404,
      error: '매칭 결과를 찾을 수 없습니다.',
    });

    const response = await POST(buildRequest(), {
      params: Promise.resolve({ batchId: 'batch-1', matchId: 'missing-match' }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe('매칭 결과를 찾을 수 없습니다.');
  });
});
