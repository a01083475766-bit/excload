import {
  OrderIntegrationProvider,
  OrderSyncTransmissionStatus,
  ShipmentAlgorithmMatchStatus,
  ShipmentUploadBatchStatus,
  ShipmentUserConfirmationStatus,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadShipmentUploadBatchDetail,
  mapShipmentUploadBatchDetailRow,
  validateShipmentUploadBatchId,
  type ShipmentUploadBatchDetailLoadClient,
} from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';

function buildBatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'batch-1',
    provider: OrderIntegrationProvider.SMARTSTORE,
    integrationAccountId: 'acc-1',
    originalFileName: 'shipments.csv',
    fileSize: 12345,
    fileType: 'text/csv',
    rowCount: 2,
    matchedConfidentCount: 1,
    matchedWarningCount: 0,
    multipleCandidatesCount: 0,
    notMatchedCount: 1,
    duplicateTrackingNumberCount: 0,
    alreadyShippedCount: 0,
    cancelledOrInvalidOrderCount: 0,
    status: ShipmentUploadBatchStatus.MATCHED,
    createdAt: new Date('2026-07-09T08:00:00.000Z'),
    ...overrides,
  };
}

function buildRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    originalRowIndex: 2,
    trackingNumber: '12345678901234',
    carrierName: 'CJ대한통운',
    receiverName: '홍길동',
    receiverPhone: '01012345678',
    receiverAddress: '서울시 강남구 테헤란로 123',
    mallOrderNo: 'ORD-1001',
    excloadOrderNo: 'EXC-20260709-000001',
    productText: '티셔츠',
    match: {
      id: 'match-1',
      algorithmMatchStatus: ShipmentAlgorithmMatchStatus.MATCHED_CONFIDENT,
      userConfirmationStatus: ShipmentUserConfirmationStatus.UNCONFIRMED,
      transmissionStatus: OrderSyncTransmissionStatus.NONE,
      matchScore: 100,
      matchReason: 'excloadOrderNo exact',
      provider: OrderIntegrationProvider.SMARTSTORE,
      orderSyncOrder: {
        id: 'order-1',
        provider: OrderIntegrationProvider.SMARTSTORE,
        excloadOrderNo: 'EXC-20260709-000001',
        mallOrderNo: 'ORD-1001',
        receiverName: '홍길동',
        receiverPhone: '01099998888',
        receiverAddress: '서울시 서초구 반포대로 10',
        productSummary: '티셔츠 1개',
      },
    },
    ...overrides,
  };
}

function buildClient(input: {
  batch?: ReturnType<typeof buildBatch> | null;
  rows?: ReturnType<typeof buildRow>[];
}): ShipmentUploadBatchDetailLoadClient {
  return {
    shipmentUploadBatch: {
      findFirst: vi.fn().mockResolvedValue(input.batch ?? null),
    },
    shipmentUploadRow: {
      findMany: vi.fn().mockResolvedValue(input.rows ?? []),
    },
  };
}

describe('validateShipmentUploadBatchId', () => {
  it('rejects empty batchId', () => {
    expect(validateShipmentUploadBatchId('')).toEqual({ error: 'batchId가 필요합니다.' });
    expect(validateShipmentUploadBatchId('   ')).toEqual({ error: 'batchId가 필요합니다.' });
  });

  it('accepts trimmed batchId', () => {
    expect(validateShipmentUploadBatchId('  batch-1  ')).toBe('batch-1');
  });
});

describe('mapShipmentUploadBatchDetailRow', () => {
  it('masks phone, address, and tracking number', () => {
    const mapped = mapShipmentUploadBatchDetailRow({
      row: buildRow(),
      batchProvider: OrderIntegrationProvider.SMARTSTORE,
    });

    expect(mapped.receiverPhoneMasked).toBe('010-****-8888');
    expect(mapped.receiverAddressMasked).toContain('...');
    expect(mapped.trackingNumberMasked).toBe('1234****1234');
    expect(mapped.receiverPhoneMasked).not.toContain('8888'.repeat(2));
    expect(JSON.stringify(mapped)).not.toContain('01099998888');
    expect(JSON.stringify(mapped)).not.toContain('12345678901234');
    expect(JSON.stringify(mapped)).not.toContain('반포대로 10');
  });

  it('includes confirmation and transmission status', () => {
    const mapped = mapShipmentUploadBatchDetailRow({
      row: buildRow(),
      batchProvider: OrderIntegrationProvider.SMARTSTORE,
    });

    expect(mapped.userConfirmationStatus).toBe(ShipmentUserConfirmationStatus.UNCONFIRMED);
    expect(mapped.transmissionStatus).toBe(OrderSyncTransmissionStatus.NONE);
    expect(mapped.algorithmMatchStatus).toBe(ShipmentAlgorithmMatchStatus.MATCHED_CONFIDENT);
  });
});

describe('loadShipmentUploadBatchDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries batch and rows with userId isolation', async () => {
    const client = buildClient({
      batch: buildBatch(),
      rows: [buildRow()],
    });

    const result = await loadShipmentUploadBatchDetail(client, {
      userId: 'user-a',
      batchId: 'batch-1',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(client.shipmentUploadBatch.findFirst).toHaveBeenCalledWith({
      where: { id: 'batch-1', userId: 'user-a' },
      select: expect.any(Object),
    });
    expect(client.shipmentUploadRow.findMany).toHaveBeenCalledWith({
      where: { uploadBatchId: 'batch-1', userId: 'user-a' },
      orderBy: { originalRowIndex: 'asc' },
      select: expect.any(Object),
    });
  });

  it('returns 404 when batch is missing', async () => {
    const client = buildClient({ batch: null });

    const result = await loadShipmentUploadBatchDetail(client, {
      userId: 'user-a',
      batchId: 'missing-batch',
    });

    expect(result).toEqual({
      success: false,
      status: 404,
      error: '업로드 배치를 찾을 수 없습니다.',
    });
    expect(client.shipmentUploadRow.findMany).not.toHaveBeenCalled();
  });

  it('returns masked rows, linked order fields, and summary counts', async () => {
    const client = buildClient({
      batch: buildBatch(),
      rows: [buildRow()],
    });

    const result = await loadShipmentUploadBatchDetail(client, {
      userId: 'user-a',
      batchId: 'batch-1',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const serialized = JSON.stringify(result.body);
    expect(serialized).not.toContain('rawRowJson');
    expect(serialized).not.toContain('candidateOrdersJson');
    expect(serialized).not.toContain('01099998888');
    expect(serialized).not.toContain('12345678901234');

    expect(result.body.uploadBatch.id).toBe('batch-1');
    expect(result.body.rows).toHaveLength(1);
    expect(result.body.rows[0]).toMatchObject({
      uploadRowId: 'row-1',
      matchId: 'match-1',
      excloadOrderNo: 'EXC-20260709-000001',
      mallOrderNo: 'ORD-1001',
      productSummary: '티셔츠 1개',
      matchReason: 'excloadOrderNo exact',
      matchScore: 100,
    });
    expect(result.body.summary).toEqual({
      totalRows: 2,
      matchedConfidentCount: 1,
      matchedWarningCount: 0,
      multipleCandidatesCount: 0,
      notMatchedCount: 1,
      duplicateTrackingNumberCount: 0,
      alreadyShippedCount: 0,
      cancelledOrInvalidOrderCount: 0,
    });
  });

  it('does not expose another user batch when userId differs', async () => {
    const client = buildClient({ batch: null });

    const result = await loadShipmentUploadBatchDetail(client, {
      userId: 'user-b',
      batchId: 'batch-1',
    });

    expect(result).toEqual({
      success: false,
      status: 404,
      error: '업로드 배치를 찾을 수 없습니다.',
    });
    expect(client.shipmentUploadBatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'batch-1', userId: 'user-b' },
      }),
    );
  });
});
