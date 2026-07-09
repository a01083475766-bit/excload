import {
  OrderIntegrationProvider,
  OrderSyncTransmissionStatus,
  ShipmentAlgorithmMatchStatus,
  ShipmentUploadBatchStatus,
  ShipmentUserConfirmationStatus,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildKnownOrdersByIdFromSnapshots,
  buildPersistShipmentUploadBatchInput,
  persistShipmentUploadBatch,
  resolveInitialUserConfirmationStatus,
  resolvePersistedOrderSyncOrderId,
  toShipmentAlgorithmMatchStatus,
  type ShipmentUploadPersistPrismaClient,
  type ShipmentUploadPersistTransactionClient,
} from '@/app/lib/order-integration/shipments/persist-shipment-upload-batch';
import type {
  NormalizedShipmentRow,
  ShipmentMatchResult,
  ShipmentParseResult,
} from '@/app/lib/order-integration/shipments/types';

function buildNormalizedRow(
  overrides: Partial<NormalizedShipmentRow> = {},
): NormalizedShipmentRow {
  return {
    originalRowIndex: 0,
    trackingNumber: '12345678901234',
    trackingNumberNormalized: '12345678901234',
    carrierName: 'CJ대한통운',
    standardCarrierCode: '04',
    excloadOrderNo: 'EXC-20260709-000001',
    mallOrderNo: 'ORD-1001',
    receiverName: '홍길동',
    receiverPhone: '01012345678',
    receiverPhoneNormalized: '01012345678',
    receiverAddress: '서울시 강남구',
    receiverAddressNormalized: '서울시강남구',
    productText: '티셔츠',
    shippedAt: '',
    parseWarnings: [],
    ...overrides,
  };
}

function buildMatchResult(overrides: Partial<ShipmentMatchResult> = {}): ShipmentMatchResult {
  return {
    shipmentRowIndex: 0,
    matchStatus: 'MATCHED_CONFIDENT',
    matchScore: 100,
    matchReason: 'excloadOrderNo exact',
    mismatchFields: [],
    matchedOrderId: 'order-1',
    candidates: [],
    transmissionStatus: 'NOT_READY',
    ...overrides,
  };
}

function buildParseResult(rows: NormalizedShipmentRow[]): ShipmentParseResult {
  return {
    ok: true,
    warnings: [],
    file: {
      format: 'csv',
      headerRowIndex: 0,
      headers: ['송장번호', '주문번호'],
      rows: rows.map((normalized) => ({
        originalRowIndex: normalized.originalRowIndex,
        rawRow: {
          송장번호: normalized.trackingNumber,
          주문번호: normalized.mallOrderNo,
        },
        normalized,
        warnings: [],
      })),
    },
  };
}

function createMockTransactionClient() {
  let batchSeq = 0;
  let rowSeq = 0;
  let matchSeq = 0;
  const batchCreates: Array<Record<string, unknown>> = [];
  const rowCreates: Array<Record<string, unknown>> = [];
  const matchCreates: Array<Record<string, unknown>> = [];
  let transactionCalls = 0;

  const tx: ShipmentUploadPersistTransactionClient = {
    shipmentUploadBatch: {
      create: vi.fn(async ({ data }) => {
        batchCreates.push(data);
        batchSeq += 1;
        return {
          id: `batch-${batchSeq}`,
          userId: data.userId as string,
          provider: (data.provider as OrderIntegrationProvider | null) ?? null,
          integrationAccountId: (data.integrationAccountId as string | null) ?? null,
          originalFileName: data.originalFileName as string,
          fileHash: (data.fileHash as string | null) ?? null,
          fileSize: data.fileSize as number,
          fileType: (data.fileType as string | null) ?? null,
          rowCount: data.rowCount as number,
          matchedConfidentCount: data.matchedConfidentCount as number,
          matchedWarningCount: data.matchedWarningCount as number,
          multipleCandidatesCount: data.multipleCandidatesCount as number,
          notMatchedCount: data.notMatchedCount as number,
          duplicateTrackingNumberCount: data.duplicateTrackingNumberCount as number,
          alreadyShippedCount: data.alreadyShippedCount as number,
          cancelledOrInvalidOrderCount: data.cancelledOrInvalidOrderCount as number,
          status: data.status as ShipmentUploadBatchStatus,
          createdAt: new Date('2026-07-09T00:00:00.000Z'),
          updatedAt: new Date('2026-07-09T00:00:00.000Z'),
        };
      }),
    },
    shipmentUploadRow: {
      create: vi.fn(async ({ data }) => {
        rowCreates.push(data);
        rowSeq += 1;
        return {
          id: `row-${rowSeq}`,
          uploadBatchId: data.uploadBatchId as string,
          userId: data.userId as string,
          originalRowIndex: data.originalRowIndex as number,
          rawRowJson: data.rawRowJson,
          trackingNumber: data.trackingNumber as string,
          trackingNumberNormalized: data.trackingNumberNormalized as string,
          carrierName: (data.carrierName as string | null) ?? null,
          carrierCode: (data.carrierCode as string | null) ?? null,
          receiverName: (data.receiverName as string | null) ?? null,
          receiverPhone: (data.receiverPhone as string | null) ?? null,
          receiverPhoneNormalized: (data.receiverPhoneNormalized as string | null) ?? null,
          receiverAddress: (data.receiverAddress as string | null) ?? null,
          mallOrderNo: (data.mallOrderNo as string | null) ?? null,
          excloadOrderNo: (data.excloadOrderNo as string | null) ?? null,
          productText: (data.productText as string | null) ?? null,
          warningsJson: data.warningsJson ?? null,
          createdAt: new Date('2026-07-09T00:00:00.000Z'),
          updatedAt: new Date('2026-07-09T00:00:00.000Z'),
        };
      }),
    },
    shipmentMatch: {
      create: vi.fn(async ({ data }) => {
        matchCreates.push(data);
        matchSeq += 1;
        return {
          id: `match-${matchSeq}`,
          uploadBatchId: data.uploadBatchId as string,
          uploadRowId: data.uploadRowId as string,
          userId: data.userId as string,
          orderSyncOrderId: (data.orderSyncOrderId as string | null) ?? null,
          provider: (data.provider as OrderIntegrationProvider | null) ?? null,
          integrationAccountId: (data.integrationAccountId as string | null) ?? null,
          algorithmMatchStatus: data.algorithmMatchStatus as ShipmentAlgorithmMatchStatus,
          userConfirmationStatus: data.userConfirmationStatus as ShipmentUserConfirmationStatus,
          transmissionStatus: data.transmissionStatus as OrderSyncTransmissionStatus,
          matchScore: data.matchScore as number,
          matchReason: (data.matchReason as string | null) ?? null,
          mismatchFieldsJson: data.mismatchFieldsJson ?? null,
          candidateOrdersJson: data.candidateOrdersJson ?? null,
          finalTrackingNumber: (data.finalTrackingNumber as string | null) ?? null,
          finalCarrierCode: (data.finalCarrierCode as string | null) ?? null,
          finalCarrierName: (data.finalCarrierName as string | null) ?? null,
          excludedAt: (data.excludedAt as Date | null) ?? null,
          excludeReason: (data.excludeReason as string | null) ?? null,
          createdAt: new Date('2026-07-09T00:00:00.000Z'),
          updatedAt: new Date('2026-07-09T00:00:00.000Z'),
        };
      }),
    },
  };

  const client: ShipmentUploadPersistPrismaClient = {
    $transaction: async <T>(fn: (innerTx: ShipmentUploadPersistTransactionClient) => Promise<T>) => {
      transactionCalls += 1;
      return fn(tx);
    },
  };

  return { client, tx, batchCreates, rowCreates, matchCreates, getTransactionCalls: () => transactionCalls };
}

describe('status mapping helpers', () => {
  it('maps MATCHED_CONFIDENT to prisma enum', () => {
    expect(toShipmentAlgorithmMatchStatus('MATCHED_CONFIDENT')).toBe('MATCHED_CONFIDENT');
  });

  it('defaults MATCHED_CONFIDENT to UNCONFIRMED', () => {
    expect(resolveInitialUserConfirmationStatus('MATCHED_CONFIDENT')).toBe('UNCONFIRMED');
  });

  it('defaults DUPLICATE_TRACKING_NUMBER to EXCLUDED', () => {
    expect(resolveInitialUserConfirmationStatus('DUPLICATE_TRACKING_NUMBER')).toBe('EXCLUDED');
  });

  it('does not link order for NOT_MATCHED', () => {
    expect(
      resolvePersistedOrderSyncOrderId({
        matchResult: buildMatchResult({
          matchStatus: 'NOT_MATCHED',
          matchedOrderId: 'order-1',
        }),
        userId: 'user-a',
      }),
    ).toBeNull();
  });

  it('does not link order for MULTIPLE_CANDIDATES', () => {
    expect(
      resolvePersistedOrderSyncOrderId({
        matchResult: buildMatchResult({
          matchStatus: 'MULTIPLE_CANDIDATES',
          matchedOrderId: 'order-1',
        }),
        userId: 'user-a',
      }),
    ).toBeNull();
  });
});

describe('buildPersistShipmentUploadBatchInput', () => {
  it('returns error when parse result is invalid', () => {
    const result = buildPersistShipmentUploadBatchInput({
      userId: 'user-a',
      file: { name: 'a.csv', type: 'text/csv', size: 10 },
      parseResult: { ok: false, error: 'bad', warnings: [] },
      matchResults: [],
    });

    expect(result).toEqual({ error: 'bad' });
  });
});

describe('persistShipmentUploadBatch', () => {
  let mock: ReturnType<typeof createMockTransactionClient>;

  beforeEach(() => {
    mock = createMockTransactionClient();
  });

  it('persists one batch, rows, and matches in a transaction', async () => {
    const rows = [
      buildNormalizedRow({ originalRowIndex: 0 }),
      buildNormalizedRow({
        originalRowIndex: 1,
        trackingNumber: '999988887777',
        trackingNumberNormalized: '999988887777',
        mallOrderNo: 'ORD-1002',
      }),
    ];
    const matchResults = [
      buildMatchResult({ shipmentRowIndex: 0, matchedOrderId: 'order-1' }),
      buildMatchResult({
        shipmentRowIndex: 1,
        matchStatus: 'MATCHED_WARNING',
        matchScore: 80,
        matchedOrderId: 'order-2',
        mismatchFields: ['receiverName'],
      }),
    ];

    const result = await persistShipmentUploadBatch(mock.client, {
      userId: 'user-a',
      provider: OrderIntegrationProvider.SMARTSTORE,
      integrationAccountId: 'acc-1',
      file: {
        name: 'shipments.csv',
        type: 'text/csv',
        size: 120,
        hash: 'hash-1',
      },
      parseResult: buildParseResult(rows),
      normalizedShipmentRows: rows,
      parsedShipmentRows: buildParseResult(rows).file?.rows,
      matchResults,
      knownOrdersById: buildKnownOrdersByIdFromSnapshots([
        {
          id: 'order-1',
          userId: 'user-a',
          provider: 'SMARTSTORE',
          accountId: 'acc-1',
          excloadOrderNo: 'EXC-1',
          mallOrderNo: 'ORD-1001',
        },
        {
          id: 'order-2',
          userId: 'user-a',
          provider: 'SMARTSTORE',
          accountId: 'acc-1',
          excloadOrderNo: 'EXC-2',
          mallOrderNo: 'ORD-1002',
        },
      ]),
    });

    expect(mock.getTransactionCalls()).toBe(1);
    expect(result.batch.id).toBe('batch-1');
    expect(result.rowCount).toBe(2);
    expect(result.matchCount).toBe(2);
    expect(result.batch.matchedConfidentCount).toBe(1);
    expect(result.batch.matchedWarningCount).toBe(1);
    expect(result.batch.status).toBe('MATCHED');
    expect(mock.batchCreates[0]?.fileHash).toBe('hash-1');
    expect(mock.rowCreates[0]?.rawRowJson).toEqual({
      송장번호: '12345678901234',
      주문번호: 'ORD-1001',
    });
    expect(mock.matchCreates[0]?.algorithmMatchStatus).toBe('MATCHED_CONFIDENT');
    expect(mock.matchCreates[0]?.userConfirmationStatus).toBe('UNCONFIRMED');
    expect(mock.matchCreates[0]?.transmissionStatus).toBe('NONE');
    expect(mock.matchCreates[0]?.orderSyncOrderId).toBe('order-1');
    expect(mock.matchCreates[0]?.finalTrackingNumber).toBe('12345678901234');
    expect(mock.matchCreates[1]?.mismatchFieldsJson).toEqual(['receiverName']);
  });

  it('stores DUPLICATE_TRACKING_NUMBER as EXCLUDED without order link', async () => {
    const rows = [buildNormalizedRow()];
    const result = await persistShipmentUploadBatch(mock.client, {
      userId: 'user-a',
      file: { name: 'shipments.csv', type: 'text/csv', size: 10 },
      parseResult: buildParseResult(rows),
      normalizedShipmentRows: rows,
      matchResults: [
        buildMatchResult({
          matchStatus: 'DUPLICATE_TRACKING_NUMBER',
          matchedOrderId: 'order-1',
        }),
      ],
    });

    expect(result.matches[0]?.userConfirmationStatus).toBe('EXCLUDED');
    expect(result.matches[0]?.orderSyncOrderId).toBeNull();
    expect(result.matches[0]?.excludedAt).not.toBeNull();
    expect(result.batch.duplicateTrackingNumberCount).toBe(1);
  });

  it('stores ALREADY_SHIPPED and CANCELLED_OR_INVALID_ORDER as EXCLUDED', async () => {
    const rows = [
      buildNormalizedRow({ originalRowIndex: 0 }),
      buildNormalizedRow({ originalRowIndex: 1, mallOrderNo: 'ORD-2' }),
    ];

    const result = await persistShipmentUploadBatch(mock.client, {
      userId: 'user-a',
      file: { name: 'shipments.csv', type: 'text/csv', size: 10 },
      parseResult: buildParseResult(rows),
      normalizedShipmentRows: rows,
      matchResults: [
        buildMatchResult({
          shipmentRowIndex: 0,
          matchStatus: 'ALREADY_SHIPPED',
          matchedOrderId: 'order-1',
        }),
        buildMatchResult({
          shipmentRowIndex: 1,
          matchStatus: 'CANCELLED_OR_INVALID_ORDER',
          matchedOrderId: 'order-2',
        }),
      ],
    });

    expect(result.matches[0]?.userConfirmationStatus).toBe('EXCLUDED');
    expect(result.matches[1]?.userConfirmationStatus).toBe('EXCLUDED');
    expect(result.matches[0]?.orderSyncOrderId).toBeNull();
    expect(result.matches[1]?.orderSyncOrderId).toBeNull();
  });

  it('stores candidateOrdersJson without extra PII fields', async () => {
    const rows = [buildNormalizedRow()];
    await persistShipmentUploadBatch(mock.client, {
      userId: 'user-a',
      file: { name: 'shipments.csv', type: 'text/csv', size: 10 },
      parseResult: buildParseResult(rows),
      normalizedShipmentRows: rows,
      matchResults: [
        buildMatchResult({
          matchStatus: 'MULTIPLE_CANDIDATES',
          matchedOrderId: 'order-1',
          candidates: [
            {
              orderId: 'order-1',
              score: 80,
              reasons: ['mallOrderNo'],
              mismatchFields: [],
            },
            {
              orderId: 'order-2',
              score: 80,
              reasons: ['phone'],
              mismatchFields: ['receiverName'],
            },
          ],
        }),
      ],
    });

    expect(mock.matchCreates[0]?.candidateOrdersJson).toEqual([
      {
        orderId: 'order-1',
        score: 80,
        reasons: ['mallOrderNo'],
        mismatchFields: [],
      },
      {
        orderId: 'order-2',
        score: 80,
        reasons: ['phone'],
        mismatchFields: ['receiverName'],
      },
    ]);
    expect(mock.matchCreates[0]?.orderSyncOrderId).toBeNull();
  });

  it('rejects order link when known order belongs to another user', async () => {
    const rows = [buildNormalizedRow()];
    await persistShipmentUploadBatch(mock.client, {
      userId: 'user-a',
      file: { name: 'shipments.csv', type: 'text/csv', size: 10 },
      parseResult: buildParseResult(rows),
      normalizedShipmentRows: rows,
      matchResults: [buildMatchResult({ matchedOrderId: 'order-1' })],
      knownOrdersById: buildKnownOrdersByIdFromSnapshots([
        {
          id: 'order-1',
          userId: 'user-b',
          provider: 'SMARTSTORE',
          excloadOrderNo: 'EXC-1',
          mallOrderNo: 'ORD-1001',
        },
      ]),
    });

    expect(mock.matchCreates[0]?.orderSyncOrderId).toBeNull();
  });

  it('creates an empty batch when rows are empty', async () => {
    const result = await persistShipmentUploadBatch(mock.client, {
      userId: 'user-a',
      file: { name: 'shipments.csv', type: 'text/csv', size: 10 },
      parseResult: buildParseResult([]),
      normalizedShipmentRows: [],
      matchResults: [],
    });

    expect(result.batch.rowCount).toBe(0);
    expect(result.batch.status).toBe('PARSED');
    expect(result.rows).toEqual([]);
    expect(result.matches).toEqual([]);
    expect(mock.tx.shipmentUploadRow.create).not.toHaveBeenCalled();
    expect(mock.tx.shipmentMatch.create).not.toHaveBeenCalled();
  });
});
