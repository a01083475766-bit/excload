import { describe, expect, it, vi } from 'vitest';
import { clearTransmittedOrderPiiIfComplete } from '@/app/lib/order-integration/snapshots/clear-transmitted-order-pii';

describe('clearTransmittedOrderPiiIfComplete', () => {
  it('does not clear PII when Match count is 0 (not treated as complete)', async () => {
    const client = {
      shipmentMatch: {
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      shipmentUploadRow: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      orderSyncOrder: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    };

    const result = await clearTransmittedOrderPiiIfComplete(client, {
      userId: 'u1',
      orderSyncOrderId: 'o1',
    });

    expect(result.skippedIncomplete).toBe(true);
    expect(result.clearedOrder).toBe(false);
    expect(client.orderSyncOrder.updateMany).not.toHaveBeenCalled();
    expect(client.shipmentMatch.updateMany).not.toHaveBeenCalled();
    expect(client.shipmentUploadRow.updateMany).not.toHaveBeenCalled();
  });

  it('skips when any match is not fully transmitted', async () => {
    const client = {
      shipmentMatch: {
        findMany: vi.fn(async () => [
          { id: 'm1', uploadRowId: 'r1', transmissionStatus: 'SENT' },
          { id: 'm2', uploadRowId: 'r2', transmissionStatus: 'NONE' },
        ]),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      orderSyncOrder: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    };

    const result = await clearTransmittedOrderPiiIfComplete(client, {
      userId: 'u1',
      orderSyncOrderId: 'o1',
    });

    expect(result.skippedIncomplete).toBe(true);
    expect(client.orderSyncOrder.updateMany).not.toHaveBeenCalled();
  });

  it('does not clear PII when matches from multiple batches include any NONE', async () => {
    // 동일 orderSyncOrderId에 여러 업로드 배치(row) Match가 연결된 경우
    const client = {
      shipmentMatch: {
        findMany: vi.fn(async () => [
          { id: 'm-batch-a', uploadRowId: 'row-batch-a', transmissionStatus: 'SENT' },
          { id: 'm-batch-b', uploadRowId: 'row-batch-b', transmissionStatus: 'NONE' },
        ]),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      shipmentUploadRow: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      orderSyncOrder: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    };

    const result = await clearTransmittedOrderPiiIfComplete(client, {
      userId: 'u1',
      orderSyncOrderId: 'o-shared',
    });

    expect(client.shipmentMatch.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', orderSyncOrderId: 'o-shared' },
      select: {
        id: true,
        uploadRowId: true,
        transmissionStatus: true,
      },
    });
    expect(result.skippedIncomplete).toBe(true);
    expect(client.orderSyncOrder.updateMany).not.toHaveBeenCalled();
    expect(client.shipmentUploadRow.updateMany).not.toHaveBeenCalled();
  });

  it('clears order and related rows when all matches are SENT/SKIPPED', async () => {
    const client = {
      shipmentMatch: {
        findMany: vi.fn(async () => [
          { id: 'm1', uploadRowId: 'r1', transmissionStatus: 'SENT' },
          { id: 'm2', uploadRowId: 'r2', transmissionStatus: 'SKIPPED' },
        ]),
        updateMany: vi.fn(async () => ({ count: 2 })),
      },
      shipmentUploadRow: {
        updateMany: vi.fn(async () => ({ count: 2 })),
      },
      shipmentTransmissionAttempt: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      orderSyncOrder: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };

    const result = await clearTransmittedOrderPiiIfComplete(client, {
      userId: 'u1',
      orderSyncOrderId: 'o1',
      now: new Date('2026-07-21T00:00:00.000Z'),
    });

    expect(result.skippedIncomplete).toBe(false);
    expect(result.clearedOrder).toBe(true);
    expect(result.clearedUploadRows).toBe(2);
    expect(result.clearedMatches).toBe(2);
    expect(client.orderSyncOrder.updateMany).toHaveBeenCalled();
  });
});
