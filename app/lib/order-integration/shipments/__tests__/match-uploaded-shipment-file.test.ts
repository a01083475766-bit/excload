import { OrderIntegrationProvider } from '@prisma/client';
import * as XLSX from 'xlsx';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrderSyncOrderSnapshot } from '@/app/lib/order-integration/shipments/types';
import {
  detectShipmentUploadFormat,
  matchUploadedShipmentFile,
  parseShipmentMatchUploadScope,
  parseUploadedShipmentFile,
  summarizeShipmentMatchResults,
  toSafeShipmentMatchLogMessage,
} from '@/app/lib/order-integration/shipments/match-uploaded-shipment-file';
import type { OrderSyncSnapshotLoadClient } from '@/app/lib/order-integration/snapshots/types';

function buildOrder(overrides: Partial<OrderSyncOrderSnapshot> = {}): OrderSyncOrderSnapshot {
  return {
    id: 'order-1',
    userId: 'user-a',
    provider: 'COUPANG',
    accountId: 'acc-1',
    batchId: 'batch-1',
    excloadOrderNo: 'EXC-20260709-000001',
    mallOrderNo: 'ORD-1001',
    receiverName: '홍길동',
    receiverPhone: '01012345678',
    receiverAddress: '서울시 강남구',
    productSummary: '티셔츠 x1',
    orderStatus: 'PAID',
    ...overrides,
  };
}

function createCsvFile(csv: string) {
  return {
    name: 'shipments.csv',
    type: 'text/csv',
    size: csv.length,
    buffer: new TextEncoder().encode(csv).buffer,
  };
}

function createXlsxFile(rows: string[][]) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });

  return {
    name: 'shipments.xlsx',
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.byteLength,
    buffer,
  };
}

function createMockClient() {
  const client: OrderSyncSnapshotLoadClient = {
    orderSyncOrder: {
      findMany: vi.fn(async () => []),
    },
  };
  return client;
}

describe('detectShipmentUploadFormat', () => {
  it('detects csv/xlsx/xls extensions', () => {
    expect(detectShipmentUploadFormat('a.CSV')).toBe('csv');
    expect(detectShipmentUploadFormat('a.xlsx')).toBe('xlsx');
    expect(detectShipmentUploadFormat('a.xls')).toBe('xls');
    expect(detectShipmentUploadFormat('a.pdf')).toBeNull();
  });
});

describe('parseUploadedShipmentFile', () => {
  it('returns 400 for unsupported extensions', () => {
    const result = parseUploadedShipmentFile({
      name: 'shipments.pdf',
      type: 'application/pdf',
      size: 10,
      buffer: new ArrayBuffer(10),
    });

    expect(result).toEqual({
      ok: false,
      error: '지원하지 않는 파일 형식입니다. csv, xlsx, xls만 업로드할 수 있습니다.',
      status: 400,
    });
  });

  it('returns 413 when file exceeds size limit', () => {
    const result = parseUploadedShipmentFile({
      name: 'shipments.csv',
      type: 'text/csv',
      size: 6 * 1024 * 1024,
      buffer: new ArrayBuffer(8),
    });

    expect(result.ok).toBe(false);
    if ('status' in result) {
      expect(result.status).toBe(413);
    }
  });
});

describe('toSafeShipmentMatchLogMessage', () => {
  it('redacts phone and tracking values from log messages', () => {
    const message = toSafeShipmentMatchLogMessage(
      new Error('failed for 010-1234-5678 tracking 12345678901234'),
    );

    expect(message).not.toContain('010-1234-5678');
    expect(message).not.toContain('12345678901234');
    expect(message).toContain('[redacted]');
  });
});

describe('matchUploadedShipmentFile', () => {
  const loadSnapshots = vi.fn(async () => [buildOrder()]);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses csv and returns matching results', async () => {
    const csv = [
      '송장번호,받는분전화번호,주문번호,엑클로드관리번호',
      '1234567890,01012345678,ORD-1001,EXC-20260709-000001',
    ].join('\n');

    const result = await matchUploadedShipmentFile({
      file: createCsvFile(csv),
      scope: { userId: 'user-a' },
      client: createMockClient(),
      loadSnapshots,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.body.parse.rowCount).toBe(1);
    expect(result.body.match.matchedConfidentCount).toBe(1);
    expect(loadSnapshots).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-a',
      provider: undefined,
      integrationAccountId: undefined,
      batchId: undefined,
      limit: 1000,
    });
  });

  it('parses xlsx workbook and returns matching results', async () => {
    const file = createXlsxFile([
      ['송장번호', '받는분전화번호', '주문번호', '엑클로드관리번호'],
      ['1234567890', '01012345678', 'ORD-1001', 'EXC-20260709-000001'],
    ]);

    const result = await matchUploadedShipmentFile({
      file,
      scope: { userId: 'user-a' },
      client: createMockClient(),
      loadSnapshots,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.body.parse.rowCount).toBe(1);
    expect(result.body.match.matchedConfidentCount).toBe(1);
  });

  it('returns NOT_MATCHED rows when order snapshots are empty', async () => {
    loadSnapshots.mockResolvedValueOnce([]);

    const csv = '송장번호,주문번호\n1234567890,ORD-1001';
    const result = await matchUploadedShipmentFile({
      file: createCsvFile(csv),
      scope: { userId: 'user-a' },
      client: createMockClient(),
      loadSnapshots,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.body.orders.loadedCount).toBe(0);
    expect(result.body.match.notMatchedCount).toBe(1);
  });

  it('passes provider/integrationAccountId/batchId scope to snapshot loader', async () => {
    loadSnapshots.mockResolvedValueOnce([]);

    await matchUploadedShipmentFile({
      file: createCsvFile('송장번호\n1234567890'),
      scope: {
        userId: 'user-a',
        provider: OrderIntegrationProvider.SMARTSTORE,
        integrationAccountId: 'acc-1',
        batchId: 'batch-9',
      },
      client: createMockClient(),
      loadSnapshots,
    });

    expect(loadSnapshots).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-a',
      provider: OrderIntegrationProvider.SMARTSTORE,
      integrationAccountId: 'acc-1',
      batchId: 'batch-9',
      limit: 1000,
    });
  });

  it('counts duplicate tracking numbers in the same upload', async () => {
    loadSnapshots.mockResolvedValueOnce([buildOrder()]);

    const csv = ['송장번호', '1234567890', '1234567890'].join('\n');
    const result = await matchUploadedShipmentFile({
      file: createCsvFile(csv),
      scope: { userId: 'user-a' },
      client: createMockClient(),
      loadSnapshots,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.body.match.duplicateTrackingNumberCount).toBe(2);
  });

  it('counts MATCHED_WARNING results', async () => {
    loadSnapshots.mockResolvedValueOnce([buildOrder()]);

    const csv = [
      '송장번호,받는분전화번호,주문번호',
      '1234567890,01099998888,ORD-1001',
    ].join('\n');

    const result = await matchUploadedShipmentFile({
      file: createCsvFile(csv),
      scope: { userId: 'user-a' },
      client: createMockClient(),
      loadSnapshots,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.body.match.matchedWarningCount).toBe(1);
  });
});

describe('parseShipmentMatchUploadScope', () => {
  it('rejects invalid provider values', () => {
    const parsed = parseShipmentMatchUploadScope({
      userId: 'user-a',
      provider: 'INVALID',
      allowedProviders: Object.values(OrderIntegrationProvider),
    });

    expect(parsed).toEqual({ error: '유효하지 않은 provider 값입니다.' });
  });
});

describe('summarizeShipmentMatchResults', () => {
  it('aggregates match status counts', () => {
    const summary = summarizeShipmentMatchResults([
      {
        shipmentRowIndex: 0,
        matchStatus: 'MATCHED_CONFIDENT',
        matchScore: 100,
        matchReason: 'ok',
        mismatchFields: [],
        matchedOrderId: 'order-1',
        candidates: [],
        transmissionStatus: 'NOT_READY',
      },
      {
        shipmentRowIndex: 1,
        matchStatus: 'NOT_MATCHED',
        matchScore: 0,
        matchReason: 'none',
        mismatchFields: [],
        matchedOrderId: null,
        candidates: [],
        transmissionStatus: 'NOT_READY',
      },
    ]);

    expect(summary.matchedConfidentCount).toBe(1);
    expect(summary.notMatchedCount).toBe(1);
    expect(summary.totalRows).toBe(2);
  });
});
