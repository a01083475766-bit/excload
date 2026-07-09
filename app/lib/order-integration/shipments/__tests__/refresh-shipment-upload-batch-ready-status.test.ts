import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  evaluateShipmentUploadBatchReadiness,
  isShipmentMatchUserConfirmationComplete,
  refreshShipmentUploadBatchReadyStatus,
  type RefreshShipmentUploadBatchReadyStatusClient,
} from '@/app/lib/order-integration/shipments/refresh-shipment-upload-batch-ready-status';

function buildClient(input: {
  batch?: { id: string; status: 'MATCHED' | 'READY' | 'CANCELLED' } | null;
  matches?: Array<{ userConfirmationStatus: 'UNCONFIRMED' | 'CONFIRMED' | 'EXCLUDED' | 'MANUALLY_LINKED' | 'EDITED' }>;
}): RefreshShipmentUploadBatchReadyStatusClient {
  return {
    shipmentUploadBatch: {
      findFirst: vi.fn().mockResolvedValue(input.batch ?? null),
      update: vi.fn().mockImplementation(async () => ({
        id: input.batch?.id ?? 'batch-1',
        status: 'READY' as const,
      })),
    },
    shipmentMatch: {
      findMany: vi.fn().mockResolvedValue(input.matches ?? []),
    },
  };
}

describe('isShipmentMatchUserConfirmationComplete', () => {
  it('treats confirmed, excluded, manually linked, and edited as complete', () => {
    expect(isShipmentMatchUserConfirmationComplete('CONFIRMED')).toBe(true);
    expect(isShipmentMatchUserConfirmationComplete('EXCLUDED')).toBe(true);
    expect(isShipmentMatchUserConfirmationComplete('MANUALLY_LINKED')).toBe(true);
    expect(isShipmentMatchUserConfirmationComplete('EDITED')).toBe(true);
    expect(isShipmentMatchUserConfirmationComplete('UNCONFIRMED')).toBe(false);
  });
});

describe('evaluateShipmentUploadBatchReadiness', () => {
  it('promotes when all matches are confirmed', () => {
    expect(
      evaluateShipmentUploadBatchReadiness({
        batchStatus: 'MATCHED',
        matches: [{ userConfirmationStatus: 'CONFIRMED' }],
      }),
    ).toEqual({
      matchCount: 1,
      unconfirmedCount: 0,
      isComplete: true,
      shouldPromoteToReady: true,
    });
  });

  it('promotes for mixed completed statuses', () => {
    expect(
      evaluateShipmentUploadBatchReadiness({
        batchStatus: 'PARTIALLY_CONFIRMED',
        matches: [
          { userConfirmationStatus: 'CONFIRMED' },
          { userConfirmationStatus: 'EXCLUDED' },
          { userConfirmationStatus: 'MANUALLY_LINKED' },
        ],
      }).shouldPromoteToReady,
    ).toBe(true);
  });

  it('does not promote when any match is unconfirmed', () => {
    expect(
      evaluateShipmentUploadBatchReadiness({
        batchStatus: 'MATCHED',
        matches: [
          { userConfirmationStatus: 'CONFIRMED' },
          { userConfirmationStatus: 'UNCONFIRMED' },
        ],
      }),
    ).toEqual({
      matchCount: 2,
      unconfirmedCount: 1,
      isComplete: false,
      shouldPromoteToReady: false,
    });
  });

  it('does not promote when batch has zero matches', () => {
    expect(
      evaluateShipmentUploadBatchReadiness({
        batchStatus: 'MATCHED',
        matches: [],
      }),
    ).toEqual({
      matchCount: 0,
      unconfirmedCount: 0,
      isComplete: false,
      shouldPromoteToReady: false,
    });
  });

  it('is idempotent when batch is already ready', () => {
    expect(
      evaluateShipmentUploadBatchReadiness({
        batchStatus: 'READY',
        matches: [{ userConfirmationStatus: 'CONFIRMED' }],
      }).shouldPromoteToReady,
    ).toBe(false);
  });
});

describe('refreshShipmentUploadBatchReadyStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates batch status to READY when all matches are complete', async () => {
    const client = buildClient({
      batch: { id: 'batch-1', status: 'MATCHED' },
      matches: [{ userConfirmationStatus: 'CONFIRMED' }],
    });

    const result = await refreshShipmentUploadBatchReadyStatus(client, {
      userId: 'user-a',
      batchId: 'batch-1',
    });

    expect(result).toEqual({
      success: true,
      batchId: 'batch-1',
      previousStatus: 'MATCHED',
      currentStatus: 'READY',
      promoted: true,
      evaluation: {
        matchCount: 1,
        unconfirmedCount: 0,
        isComplete: true,
        shouldPromoteToReady: true,
      },
    });
    expect(client.shipmentUploadBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: { status: 'READY' },
    });
  });

  it('does not promote when a match remains unconfirmed', async () => {
    const client = buildClient({
      batch: { id: 'batch-1', status: 'MATCHED' },
      matches: [
        { userConfirmationStatus: 'CONFIRMED' },
        { userConfirmationStatus: 'UNCONFIRMED' },
      ],
    });

    const result = await refreshShipmentUploadBatchReadyStatus(client, {
      userId: 'user-a',
      batchId: 'batch-1',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.promoted).toBe(false);
    expect(result.currentStatus).toBe('MATCHED');
    expect(client.shipmentUploadBatch.update).not.toHaveBeenCalled();
  });

  it('does not promote when batch has zero matches', async () => {
    const client = buildClient({
      batch: { id: 'batch-1', status: 'MATCHED' },
      matches: [],
    });

    const result = await refreshShipmentUploadBatchReadyStatus(client, {
      userId: 'user-a',
      batchId: 'batch-1',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.promoted).toBe(false);
    expect(client.shipmentUploadBatch.update).not.toHaveBeenCalled();
  });

  it('is idempotent when batch is already ready', async () => {
    const client = buildClient({
      batch: { id: 'batch-1', status: 'READY' },
      matches: [{ userConfirmationStatus: 'EXCLUDED' }],
    });

    const result = await refreshShipmentUploadBatchReadyStatus(client, {
      userId: 'user-a',
      batchId: 'batch-1',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.promoted).toBe(false);
    expect(result.currentStatus).toBe('READY');
    expect(client.shipmentUploadBatch.update).not.toHaveBeenCalled();
  });

  it('returns 404 for another user batch', async () => {
    const client = buildClient({ batch: null });

    const result = await refreshShipmentUploadBatchReadyStatus(client, {
      userId: 'user-b',
      batchId: 'batch-1',
    });

    expect(result).toEqual({
      success: false,
      status: 404,
      error: '업로드 배치를 찾을 수 없습니다.',
    });
    expect(client.shipmentMatch.findMany).not.toHaveBeenCalled();
  });
});
