import { OrderIntegrationProvider, ShipmentUploadBatchStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildPersistShipmentUploadBatchInputFromMatchBody,
  persistShipmentUploadBatch,
  type ShipmentUploadPersistPrismaClient,
  type ShipmentUploadPersistTransactionClient,
} from '@/app/lib/order-integration/shipments/persist-shipment-upload-batch';
import { uploadAndPersistShipmentFile } from '@/app/lib/order-integration/shipments/upload-and-persist-shipment-file';
import type { ShipmentMatchResult } from '@/app/lib/order-integration/shipments/types';

const mocks = vi.hoisted(() => ({
  matchUploadedShipmentFile: vi.fn(),
  loadOrderSyncSnapshotsForMatching: vi.fn(),
  persistShipmentUploadBatch: vi.fn(),
}));

vi.mock('@/app/lib/order-integration/shipments/match-uploaded-shipment-file', async () => {
  const actual = await vi.importActual<
    typeof import('@/app/lib/order-integration/shipments/match-uploaded-shipment-file')
  >('@/app/lib/order-integration/shipments/match-uploaded-shipment-file');

  return {
    ...actual,
    matchUploadedShipmentFile: mocks.matchUploadedShipmentFile,
  };
});

vi.mock('@/app/lib/order-integration/snapshots/load-order-sync-snapshots-for-matching', () => ({
  loadOrderSyncSnapshotsForMatching: mocks.loadOrderSyncSnapshotsForMatching,
}));

function buildMatchBody(matchResults: ShipmentMatchResult[]) {
  return {
    totalRows: matchResults.length,
    matchedConfidentCount: matchResults.filter((row) => row.matchStatus === 'MATCHED_CONFIDENT')
      .length,
    matchedWarningCount: 0,
    multipleCandidatesCount: 0,
    notMatchedCount: matchResults.filter((row) => row.matchStatus === 'NOT_MATCHED').length,
    duplicateTrackingNumberCount: 0,
    alreadyShippedCount: 0,
    cancelledOrInvalidOrderCount: 0,
    rows: matchResults,
    displayRows: [],
  };
}

describe('uploadAndPersistShipmentFile', () => {
  const file = {
    name: 'shipments.csv',
    type: 'text/csv',
    size: 20,
    buffer: new TextEncoder().encode('송장번호,주문번호\n1234567890,ORD-1').buffer,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadOrderSyncSnapshotsForMatching.mockResolvedValue([]);
    mocks.persistShipmentUploadBatch.mockResolvedValue({
      batch: { id: 'upload-batch-1' },
      rows: [{ id: 'row-1' }],
      matches: [{ id: 'match-1' }],
      rowCount: 1,
      matchCount: 1,
    });
    mocks.matchUploadedShipmentFile.mockResolvedValue({
      success: true,
      body: {
        success: true,
        file: { name: file.name, type: file.type, size: file.size },
        parse: { ok: true, rowCount: 1, warningCount: 0, warnings: [] },
        orders: { loadedCount: 0, emptyReason: 'no_bundle', bundle: null, scope: {} },
        match: buildMatchBody([
          {
            shipmentRowIndex: 0,
            matchStatus: 'NOT_MATCHED',
            matchScore: 0,
            matchReason: '점수 미달',
            mismatchFields: [],
            matchedOrderId: null,
            candidates: [],
            transmissionStatus: 'NOT_READY',
          },
        ]),
      },
    });
  });

  it('calls match and persist helpers in order', async () => {
    const result = await uploadAndPersistShipmentFile({
      file,
      scope: {
        userId: 'user-a',
        provider: OrderIntegrationProvider.SMARTSTORE,
        integrationAccountId: 'acc-1',
        batchId: 'order-batch-1',
      },
      snapshotClient: {} as never,
      persistClient: {} as ShipmentUploadPersistPrismaClient,
      matchUploadedShipmentFileFn: mocks.matchUploadedShipmentFile,
      loadSnapshots: mocks.loadOrderSyncSnapshotsForMatching,
      persistShipmentUploadBatchFn: mocks.persistShipmentUploadBatch,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(mocks.matchUploadedShipmentFile).toHaveBeenCalled();
    expect(mocks.loadOrderSyncSnapshotsForMatching).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-a',
      provider: OrderIntegrationProvider.SMARTSTORE,
      integrationAccountId: 'acc-1',
      batchId: 'order-batch-1',
      limit: 1000,
    });
    expect(mocks.persistShipmentUploadBatch).toHaveBeenCalled();
    expect(result.body.uploadBatch).toEqual({
      id: 'upload-batch-1',
      rowCount: 1,
      matchCount: 1,
    });
  });

  it('returns match failure without calling persist', async () => {
    mocks.matchUploadedShipmentFile.mockResolvedValueOnce({
      success: false,
      status: 400,
      error: '지원하지 않는 파일 형식입니다.',
    });

    const result = await uploadAndPersistShipmentFile({
      file,
      scope: { userId: 'user-a' },
      snapshotClient: {} as never,
      persistClient: {} as ShipmentUploadPersistPrismaClient,
      matchUploadedShipmentFileFn: mocks.matchUploadedShipmentFile,
      loadSnapshots: mocks.loadOrderSyncSnapshotsForMatching,
      persistShipmentUploadBatchFn: mocks.persistShipmentUploadBatch,
    });

    expect(result).toEqual({
      success: false,
      status: 400,
      error: '지원하지 않는 파일 형식입니다.',
    });
    expect(mocks.persistShipmentUploadBatch).not.toHaveBeenCalled();
  });

  it('returns safe error when persist fails', async () => {
    mocks.persistShipmentUploadBatch.mockRejectedValueOnce(new Error('db down'));

    const result = await uploadAndPersistShipmentFile({
      file,
      scope: { userId: 'user-a' },
      snapshotClient: {} as never,
      persistClient: {} as ShipmentUploadPersistPrismaClient,
      matchUploadedShipmentFileFn: mocks.matchUploadedShipmentFile,
      loadSnapshots: mocks.loadOrderSyncSnapshotsForMatching,
      persistShipmentUploadBatchFn: mocks.persistShipmentUploadBatch,
    });

    expect(result).toEqual({
      success: false,
      status: 500,
      error: '송장 업로드 결과를 저장하는 중 오류가 발생했습니다.',
    });
  });

  it('allows saving when order snapshots are empty', async () => {
    const result = await uploadAndPersistShipmentFile({
      file,
      scope: { userId: 'user-a' },
      snapshotClient: {} as never,
      persistClient: {} as ShipmentUploadPersistPrismaClient,
      matchUploadedShipmentFileFn: mocks.matchUploadedShipmentFile,
      loadSnapshots: mocks.loadOrderSyncSnapshotsForMatching,
      persistShipmentUploadBatchFn: mocks.persistShipmentUploadBatch,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.body.orders.loadedCount).toBe(0);
    expect(mocks.persistShipmentUploadBatch).toHaveBeenCalled();
  });
});

describe('toSafeShipmentMatchLogMessage PII masking', () => {
  it('redacts phone numbers from error messages used by uploads route', async () => {
    const { toSafeShipmentMatchLogMessage } = await import(
      '@/app/lib/order-integration/shipments/match-uploaded-shipment-file'
    );

    const message = toSafeShipmentMatchLogMessage(
      new Error('failed for 010-1234-5678 tracking 12345678901234'),
    );

    expect(message).not.toContain('010-1234-5678');
    expect(message).not.toContain('12345678901234');
    expect(message).toContain('[redacted]');
  });
});

describe('buildPersistShipmentUploadBatchInputFromMatchBody integration', () => {
  it('builds persist input from match body rows', () => {
    const parseResult = {
      ok: true as const,
      warnings: [],
      file: {
        format: 'csv' as const,
        headerRowIndex: 0,
        headers: ['송장번호'],
        rows: [
          {
            originalRowIndex: 0,
            rawRow: { 송장번호: '1234567890' },
            normalized: {
              originalRowIndex: 0,
              trackingNumber: '1234567890',
              trackingNumberNormalized: '1234567890',
              carrierName: '',
              standardCarrierCode: '',
              excloadOrderNo: '',
              mallOrderNo: '',
              receiverName: '',
              receiverPhone: '',
              receiverPhoneNormalized: '',
              receiverAddress: '',
              receiverAddressNormalized: '',
              productText: '',
              shippedAt: '',
              parseWarnings: [],
            },
            warnings: [],
          },
        ],
      },
    };

    const input = buildPersistShipmentUploadBatchInputFromMatchBody({
      userId: 'user-a',
      file: { name: 'a.csv', type: 'text/csv', size: 1 },
      parseResult,
      matchBody: buildMatchBody([
        {
          shipmentRowIndex: 0,
          matchStatus: 'NOT_MATCHED',
          matchScore: 0,
          matchReason: 'none',
          mismatchFields: [],
          matchedOrderId: null,
          candidates: [],
          transmissionStatus: 'NOT_READY',
        },
      ]),
    });

    expect('error' in input).toBe(false);
    if ('error' in input) return;
    expect(input.matchResults).toHaveLength(1);
    expect(input.normalizedShipmentRows).toHaveLength(1);
  });
});

describe('persistShipmentUploadBatch transaction', () => {
  it('uses client transaction for persist', async () => {
    let transactionCalls = 0;
    const tx: ShipmentUploadPersistTransactionClient = {
      shipmentUploadBatch: {
        create: vi.fn(async ({ data }) => ({
          id: 'batch-1',
          userId: data.userId as string,
          provider: null,
          integrationAccountId: null,
          originalFileName: data.originalFileName as string,
          fileHash: null,
          fileSize: data.fileSize as number,
          fileType: null,
          rowCount: 0,
          matchedConfidentCount: 0,
          matchedWarningCount: 0,
          multipleCandidatesCount: 0,
          notMatchedCount: 0,
          duplicateTrackingNumberCount: 0,
          alreadyShippedCount: 0,
          cancelledOrInvalidOrderCount: 0,
          status: 'PARSED' as ShipmentUploadBatchStatus,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      },
      shipmentUploadRow: { create: vi.fn() },
      shipmentMatch: { create: vi.fn() },
    };
    const client: ShipmentUploadPersistPrismaClient = {
      $transaction: async (fn) => {
        transactionCalls += 1;
        return fn(tx);
      },
    };

    await persistShipmentUploadBatch(client, {
      userId: 'user-a',
      file: { name: 'a.csv', type: 'text/csv', size: 1 },
      parseResult: { ok: true, warnings: [] },
      normalizedShipmentRows: [],
      matchResults: [],
    });

    expect(transactionCalls).toBe(1);
  });
});
