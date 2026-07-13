import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  isAdminEmail: vi.fn(),
  excludeShipmentUploadMatch: vi.fn(),
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

vi.mock('@/app/lib/order-integration/shipments/exclude-shipment-upload-match', async () => {
  const actual = await vi.importActual<
    typeof import('@/app/lib/order-integration/shipments/exclude-shipment-upload-match')
  >('@/app/lib/order-integration/shipments/exclude-shipment-upload-match');

  return {
    ...actual,
    excludeShipmentUploadMatch: mocks.excludeShipmentUploadMatch,
  };
});

import { POST } from '../route';

function buildRequest(body?: Record<string, unknown>) {
  return new Request(
    'http://localhost/api/order/integration/shipments/uploads/batch-1/matches/match-1/exclude',
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
    excludedMatchId: 'match-1',
    match: {
      shipmentRowIndex: 0,
      matchStatus: 'NOT_MATCHED',
      matchReason: 'no candidate',
      providerLabel: null,
      mallOrderNo: 'ORD-1',
      excloadOrderNo: null,
      receiverName: null,
      receiverPhoneMasked: null,
      receiverAddressMasked: null,
      productSummary: null,
      carrierName: null,
      trackingNumberMasked: '1234****5678',
      matchId: 'match-1',
      uploadRowId: 'row-1',
      userConfirmationStatus: 'EXCLUDED',
      transmissionStatus: 'NONE',
    },
    uploadBatch: { id: 'batch-1', rowCount: 1 },
    rows: [],
    summary: { totalRows: 1 },
  };
}

describe('POST /api/order/integration/shipments/uploads/[batchId]/matches/[matchId]/exclude', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { email: 'user@example.com' } });
    mocks.userFindUnique.mockResolvedValue({ id: 'user-a' });
    mocks.isAdminEmail.mockReturnValue(true);
    mocks.excludeShipmentUploadMatch.mockResolvedValue({
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
    expect(mocks.excludeShipmentUploadMatch).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not admin', async () => {
    mocks.isAdminEmail.mockReturnValueOnce(false);

    const response = await POST(buildRequest(), {
      params: Promise.resolve({ batchId: 'batch-1', matchId: 'match-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe('관리자 권한이 필요합니다.');
    expect(mocks.excludeShipmentUploadMatch).not.toHaveBeenCalled();
  });

  it('returns 400 when matchId is missing', async () => {
    const response = await POST(buildRequest(), {
      params: Promise.resolve({ batchId: 'batch-1', matchId: '   ' }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('matchId가 필요합니다.');
  });

  it('excludes match with session userId and optional reason', async () => {
    const response = await POST(buildRequest({ reason: '중복 송장 정리' }), {
      params: Promise.resolve({ batchId: 'batch-1', matchId: 'match-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.excludeShipmentUploadMatch).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-1',
      reason: '중복 송장 정리',
    });
    expect(json.excludedMatchId).toBe('match-1');
    expect(json.match.userConfirmationStatus).toBe('EXCLUDED');
  });

  it('returns 404 when exclude service reports missing match', async () => {
    mocks.excludeShipmentUploadMatch.mockResolvedValueOnce({
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
