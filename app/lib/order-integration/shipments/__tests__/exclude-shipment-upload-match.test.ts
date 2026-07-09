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
  evaluateShipmentMatchExcludeEligibility,
  excludeShipmentUploadMatch,
  isShipmentMatchAlreadyExcluded,
  type ExcludeShipmentUploadMatchClient,
} from '@/app/lib/order-integration/shipments/exclude-shipment-upload-match';

function buildMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'match-1',
    uploadBatchId: 'batch-1',
    uploadRowId: 'row-1',
    userId: 'user-a',
    userConfirmationStatus: 'UNCONFIRMED' as const,
    excludedAt: null,
    excludeReason: null,
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
      matchedConfidentCount: 0,
      matchedWarningCount: 0,
      multipleCandidatesCount: 0,
      notMatchedCount: 1,
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
        algorithmMatchStatus: 'NOT_MATCHED' as const,
        userConfirmationStatus: 'EXCLUDED' as const,
        transmissionStatus: 'NONE' as const,
        provider: null,
        excloadOrderNo: null,
        mallOrderNo: 'ORD-1',
        receiverName: null,
        receiverPhoneMasked: null,
        receiverAddressMasked: null,
        trackingNumberMasked: '1234****5678',
        productSummary: null,
        carrierName: null,
        matchReason: 'no candidate',
        matchScore: 0,
      },
    ],
    summary: {
      totalRows: 1,
      matchedConfidentCount: 0,
      matchedWarningCount: 0,
      multipleCandidatesCount: 0,
      notMatchedCount: 1,
      duplicateTrackingNumberCount: 0,
      alreadyShippedCount: 0,
      cancelledOrInvalidOrderCount: 0,
    },
  };
}

function buildClient(input: {
  batch?: { id: string; status?: 'MATCHED' | 'READY' } | null;
  match?: ReturnType<typeof buildMatch> | null;
  allMatches?: Array<{ userConfirmationStatus: 'UNCONFIRMED' | 'CONFIRMED' | 'EXCLUDED' | 'MANUALLY_LINKED' | 'EDITED' }>;
}): ExcludeShipmentUploadMatchClient {
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
        input.allMatches ?? [{ userConfirmationStatus: 'EXCLUDED' }],
      ),
      update: vi.fn().mockResolvedValue(
        buildMatch({
          userConfirmationStatus: 'EXCLUDED',
          excludedAt: new Date('2026-07-09T09:00:00.000Z'),
          excludeReason: 'manual exclude',
        }),
      ),
    },
  };
}

describe('evaluateShipmentMatchExcludeEligibility', () => {
  it('allows unconfirmed match to be excluded', () => {
    expect(
      evaluateShipmentMatchExcludeEligibility({ userConfirmationStatus: 'UNCONFIRMED' }),
    ).toEqual({ ok: true, idempotent: false });
  });

  it('treats already excluded match as idempotent', () => {
    expect(isShipmentMatchAlreadyExcluded('EXCLUDED')).toBe(true);
    expect(
      evaluateShipmentMatchExcludeEligibility({ userConfirmationStatus: 'EXCLUDED' }),
    ).toEqual({ ok: true, idempotent: true });
  });

  it('rejects confirmed match', () => {
    expect(
      evaluateShipmentMatchExcludeEligibility({ userConfirmationStatus: 'CONFIRMED' }),
    ).toEqual({ ok: false, error: '확정된 매칭은 제외할 수 없습니다.' });
  });

  it('rejects manually linked and edited matches', () => {
    expect(
      evaluateShipmentMatchExcludeEligibility({ userConfirmationStatus: 'MANUALLY_LINKED' }),
    ).toEqual({ ok: false, error: '이미 처리된 매칭입니다.' });
    expect(
      evaluateShipmentMatchExcludeEligibility({ userConfirmationStatus: 'EDITED' }),
    ).toEqual({ ok: false, error: '이미 처리된 매칭입니다.' });
  });
});

describe('excludeShipmentUploadMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadShipmentUploadBatchDetail.mockResolvedValue({
      success: true,
      body: buildDetailBody(),
    });
  });

  it('excludes unconfirmed match and returns latest batch detail without raw json', async () => {
    const client = buildClient({
      batch: { id: 'batch-1' },
      match: buildMatch(),
    });

    const result = await excludeShipmentUploadMatch(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-1',
      reason: 'manual exclude',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(client.shipmentMatch.update).toHaveBeenCalledWith({
      where: { id: 'match-1' },
      data: expect.objectContaining({
        userConfirmationStatus: 'EXCLUDED',
        excludeReason: 'manual exclude',
      }),
    });
    expect(result.body.excludedMatchId).toBe('match-1');
    expect(result.body.match.userConfirmationStatus).toBe('EXCLUDED');
    expect(JSON.stringify(result.body)).not.toContain('rawRowJson');
    expect(JSON.stringify(result.body)).not.toContain('candidateOrdersJson');
  });

  it('returns 404 when batch belongs to another user', async () => {
    const client = buildClient({ batch: null });

    const result = await excludeShipmentUploadMatch(client, {
      userId: 'user-b',
      batchId: 'batch-1',
      matchId: 'match-1',
    });

    expect(result).toEqual({
      success: false,
      status: 404,
      error: '업로드 배치를 찾을 수 없습니다.',
    });
  });

  it('returns 404 when match is not in the batch', async () => {
    const client = buildClient({
      batch: { id: 'batch-1' },
      match: null,
    });

    const result = await excludeShipmentUploadMatch(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'missing-match',
    });

    expect(result).toEqual({
      success: false,
      status: 404,
      error: '매칭 결과를 찾을 수 없습니다.',
    });
  });

  it('is idempotent when match is already excluded', async () => {
    const client = buildClient({
      batch: { id: 'batch-1' },
      match: buildMatch({ userConfirmationStatus: 'EXCLUDED' }),
    });

    const result = await excludeShipmentUploadMatch(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-1',
    });

    expect(result.success).toBe(true);
    expect(client.shipmentMatch.update).not.toHaveBeenCalled();
  });

  it('returns 400 when match is already confirmed', async () => {
    const client = buildClient({
      batch: { id: 'batch-1' },
      match: buildMatch({ userConfirmationStatus: 'CONFIRMED' }),
    });

    const result = await excludeShipmentUploadMatch(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-1',
    });

    expect(result).toEqual({
      success: false,
      status: 400,
      error: '확정된 매칭은 제외할 수 없습니다.',
    });
  });

  it('promotes batch to READY after excluding the last unconfirmed match', async () => {
    const client = buildClient({
      batch: { id: 'batch-1', status: 'MATCHED' },
      match: buildMatch(),
      allMatches: [{ userConfirmationStatus: 'EXCLUDED' }],
    });

    const result = await excludeShipmentUploadMatch(client, {
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
});
