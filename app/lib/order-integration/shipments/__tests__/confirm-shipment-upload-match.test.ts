import {
  ShipmentAlgorithmMatchStatus,
  ShipmentUserConfirmationStatus,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadShipmentUploadBatchDetail: vi.fn(),
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

import {
  confirmShipmentUploadMatch,
  evaluateShipmentMatchConfirmEligibility,
  isShipmentMatchAlreadyConfirmed,
  validateShipmentUploadMatchId,
  type ConfirmShipmentUploadMatchClient,
} from '@/app/lib/order-integration/shipments/confirm-shipment-upload-match';

function buildMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'match-1',
    uploadBatchId: 'batch-1',
    uploadRowId: 'row-1',
    userId: 'user-a',
    orderSyncOrderId: 'order-1',
    algorithmMatchStatus: 'MATCHED_CONFIDENT' as ShipmentAlgorithmMatchStatus,
    userConfirmationStatus: 'UNCONFIRMED' as ShipmentUserConfirmationStatus,
    confirmedAt: null,
    confirmedByUserId: null,
    ...overrides,
  };
}

function buildDetailBody() {
  return {
    success: true as const,
    uploadBatch: {
      id: 'batch-1',
      provider: 'SMARTSTORE',
      integrationAccountId: 'acc-1',
      originalFileName: 'shipments.csv',
      fileSize: 100,
      fileType: 'text/csv',
      rowCount: 1,
      matchedConfidentCount: 1,
      matchedWarningCount: 0,
      multipleCandidatesCount: 0,
      notMatchedCount: 0,
      duplicateTrackingNumberCount: 0,
      alreadyShippedCount: 0,
      cancelledOrInvalidOrderCount: 0,
      status: 'MATCHED' as const,
      createdAt: '2026-07-09T08:00:00.000Z',
    },
    rows: [
      {
        uploadRowId: 'row-1',
        matchId: 'match-1',
        originalRowIndex: 0,
        algorithmMatchStatus: 'MATCHED_CONFIDENT' as const,
        userConfirmationStatus: 'CONFIRMED' as const,
        transmissionStatus: 'NONE' as const,
        provider: '스마트스토어',
        excloadOrderNo: 'EXC-1',
        mallOrderNo: 'ORD-1',
        receiverName: '홍길동',
        receiverPhoneMasked: '010-****-5678',
        receiverAddressMasked: '서울시 ... 123',
        trackingNumberMasked: '1234****5678',
        productSummary: '티셔츠',
        carrierName: 'CJ대한통운',
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

function buildClient(input: {
  batch?: { id: string; status?: 'MATCHED' | 'READY' } | null;
  match?: ReturnType<typeof buildMatch> | null;
  order?: { id: string } | null;
  allMatches?: Array<{ userConfirmationStatus: ShipmentUserConfirmationStatus }>;
}) {
  const batchRecord = input.batch ?? null;

  return {
    shipmentUploadBatch: {
      findFirst: vi.fn().mockImplementation((args: { select?: { status?: boolean } }) => {
        if (!batchRecord) return null;
        if (args?.select?.status) {
          return { id: batchRecord.id, status: batchRecord.status ?? 'MATCHED' };
        }
        return { id: batchRecord.id };
      }),
      update: vi.fn().mockResolvedValue({
        id: batchRecord?.id ?? 'batch-1',
        status: 'READY',
      }),
    },
    shipmentUploadRow: {
      findMany: vi.fn(),
    },
    shipmentMatch: {
      findFirst: vi.fn().mockResolvedValue(input.match ?? null),
      findMany: vi.fn().mockResolvedValue(
        input.allMatches ?? [{ userConfirmationStatus: 'CONFIRMED' }],
      ),
      update: vi.fn().mockResolvedValue(
        buildMatch({
          userConfirmationStatus: 'CONFIRMED',
          confirmedAt: new Date('2026-07-09T09:00:00.000Z'),
          confirmedByUserId: 'user-a',
        }),
      ),
    },
    orderSyncOrder: {
      findFirst: vi.fn().mockResolvedValue(input.order ?? null),
    },
  } satisfies ConfirmShipmentUploadMatchClient;
}

describe('validateShipmentUploadMatchId', () => {
  it('rejects empty matchId', () => {
    expect(validateShipmentUploadMatchId('')).toEqual({ error: 'matchId가 필요합니다.' });
  });
});

describe('evaluateShipmentMatchConfirmEligibility', () => {
  it('allows MATCHED_CONFIDENT with linked order', () => {
    expect(
      evaluateShipmentMatchConfirmEligibility({
        algorithmMatchStatus: 'MATCHED_CONFIDENT',
        userConfirmationStatus: 'UNCONFIRMED',
        orderSyncOrderId: 'order-1',
      }),
    ).toEqual({ ok: true, idempotent: false });
  });

  it('allows MATCHED_WARNING with linked order', () => {
    expect(
      evaluateShipmentMatchConfirmEligibility({
        algorithmMatchStatus: 'MATCHED_WARNING',
        userConfirmationStatus: 'UNCONFIRMED',
        orderSyncOrderId: 'order-1',
      }),
    ).toEqual({ ok: true, idempotent: false });
  });

  it('rejects match without linked order', () => {
    expect(
      evaluateShipmentMatchConfirmEligibility({
        algorithmMatchStatus: 'NOT_MATCHED',
        userConfirmationStatus: 'UNCONFIRMED',
        orderSyncOrderId: null,
      }),
    ).toEqual({ ok: false, error: '이 알고리즘 매칭 상태는 확정할 수 없습니다.' });
  });

  it('rejects excluded statuses', () => {
    expect(
      evaluateShipmentMatchConfirmEligibility({
        algorithmMatchStatus: 'DUPLICATE_TRACKING_NUMBER',
        userConfirmationStatus: 'EXCLUDED',
        orderSyncOrderId: null,
      }),
    ).toEqual({ ok: false, error: '제외된 매칭은 확정할 수 없습니다.' });
  });

  it('treats already confirmed match as idempotent', () => {
    expect(isShipmentMatchAlreadyConfirmed('CONFIRMED')).toBe(true);
    expect(
      evaluateShipmentMatchConfirmEligibility({
        algorithmMatchStatus: 'MATCHED_CONFIDENT',
        userConfirmationStatus: 'CONFIRMED',
        orderSyncOrderId: 'order-1',
      }),
    ).toEqual({ ok: true, idempotent: true });
  });
});

describe('confirmShipmentUploadMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadShipmentUploadBatchDetail.mockResolvedValue({
      success: true,
      body: buildDetailBody(),
    });
  });

  it('confirms eligible match and returns latest batch detail without raw json', async () => {
    const client = buildClient({
      batch: { id: 'batch-1' },
      match: buildMatch(),
      order: { id: 'order-1' },
    });

    const result = await confirmShipmentUploadMatch(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-1',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(client.shipmentUploadBatch.findFirst).toHaveBeenCalledWith({
      where: { id: 'batch-1', userId: 'user-a' },
      select: { id: true },
    });
    expect(client.shipmentMatch.findFirst).toHaveBeenCalledWith({
      where: { id: 'match-1', uploadBatchId: 'batch-1', userId: 'user-a' },
      select: expect.any(Object),
    });
    expect(client.shipmentMatch.update).toHaveBeenCalledWith({
      where: { id: 'match-1' },
      data: expect.objectContaining({
        userConfirmationStatus: 'CONFIRMED',
        confirmedByUserId: 'user-a',
      }),
    });
    expect(result.body.confirmedMatchId).toBe('match-1');
    expect(result.body.match.userConfirmationStatus).toBe('CONFIRMED');
    expect(JSON.stringify(result.body)).not.toContain('rawRowJson');
    expect(JSON.stringify(result.body)).not.toContain('candidateOrdersJson');
  });

  it('returns 404 when batch belongs to another user', async () => {
    const client = buildClient({ batch: null });

    const result = await confirmShipmentUploadMatch(client, {
      userId: 'user-b',
      batchId: 'batch-1',
      matchId: 'match-1',
    });

    expect(result).toEqual({
      success: false,
      status: 404,
      error: '업로드 배치를 찾을 수 없습니다.',
    });
    expect(client.shipmentMatch.findFirst).not.toHaveBeenCalled();
  });

  it('returns 404 when match is not in the batch', async () => {
    const client = buildClient({
      batch: { id: 'batch-1' },
      match: null,
    });

    const result = await confirmShipmentUploadMatch(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-other',
    });

    expect(result).toEqual({
      success: false,
      status: 404,
      error: '매칭 결과를 찾을 수 없습니다.',
    });
  });

  it('returns 400 when linked order is missing', async () => {
    const client = buildClient({
      batch: { id: 'batch-1' },
      match: buildMatch({ orderSyncOrderId: null }),
    });

    const result = await confirmShipmentUploadMatch(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-1',
    });

    expect(result).toEqual({
      success: false,
      status: 400,
      error: '연결된 주문이 없어 확정할 수 없습니다.',
    });
  });

  it('returns 400 for non-confirmable algorithm status', async () => {
    const client = buildClient({
      batch: { id: 'batch-1' },
      match: buildMatch({
        algorithmMatchStatus: 'MULTIPLE_CANDIDATES',
        orderSyncOrderId: null,
      }),
    });

    const result = await confirmShipmentUploadMatch(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-1',
    });

    expect(result).toEqual({
      success: false,
      status: 400,
      error: '이 알고리즘 매칭 상태는 확정할 수 없습니다.',
    });
  });

  it('is idempotent when match is already confirmed', async () => {
    const client = buildClient({
      batch: { id: 'batch-1' },
      match: buildMatch({ userConfirmationStatus: 'CONFIRMED' }),
      order: { id: 'order-1' },
    });

    const result = await confirmShipmentUploadMatch(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-1',
    });

    expect(result.success).toBe(true);
    expect(client.shipmentMatch.update).not.toHaveBeenCalled();
  });

  it('promotes batch to READY after confirming the last unconfirmed match', async () => {
    const client = buildClient({
      batch: { id: 'batch-1', status: 'MATCHED' },
      match: buildMatch(),
      order: { id: 'order-1' },
      allMatches: [{ userConfirmationStatus: 'CONFIRMED' }],
    });

    const result = await confirmShipmentUploadMatch(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-1',
    });

    expect(result.success).toBe(true);
    expect(client.shipmentUploadBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: { status: 'READY' },
    });
  });

  it('does not promote batch when another match remains unconfirmed', async () => {
    const client = buildClient({
      batch: { id: 'batch-1', status: 'MATCHED' },
      match: buildMatch(),
      order: { id: 'order-1' },
      allMatches: [
        { userConfirmationStatus: 'CONFIRMED' },
        { userConfirmationStatus: 'UNCONFIRMED' },
      ],
    });

    const result = await confirmShipmentUploadMatch(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-1',
    });

    expect(result.success).toBe(true);
    expect(client.shipmentUploadBatch.update).not.toHaveBeenCalled();
  });
});
