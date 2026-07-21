import { describe, expect, it, vi } from 'vitest';
import {
  clearTransmittedOrderPiiIfComplete,
  type ClearTransmittedOrderPiiClient,
  type ClearTransmittedOrderPiiTxClient,
} from '@/app/lib/order-integration/snapshots/clear-transmitted-order-pii';

function withTransaction(
  tx: ClearTransmittedOrderPiiTxClient,
  options?: {
    onTransaction?: () => void;
    wrap?: <T>(fn: (inner: ClearTransmittedOrderPiiTxClient) => Promise<T>) => Promise<T>;
  },
): ClearTransmittedOrderPiiClient {
  return {
    ...tx,
    $transaction: async <T>(fn: (inner: ClearTransmittedOrderPiiTxClient) => Promise<T>) => {
      options?.onTransaction?.();
      if (options?.wrap) return options.wrap(fn);
      return fn(tx);
    },
  };
}

describe('clearTransmittedOrderPiiIfComplete', () => {
  it('does not clear PII when Match count is 0 (not treated as complete)', async () => {
    const tx: ClearTransmittedOrderPiiTxClient = {
      shipmentMatch: {
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      shipmentUploadRow: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      shipmentTransmissionAttempt: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      orderSyncOrder: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    };
    const client = withTransaction(tx);

    const result = await clearTransmittedOrderPiiIfComplete(client, {
      userId: 'u1',
      orderSyncOrderId: 'o1',
    });

    expect(result.skippedIncomplete).toBe(true);
    expect(result.clearedOrder).toBe(false);
    expect(tx.orderSyncOrder.updateMany).not.toHaveBeenCalled();
    expect(tx.shipmentMatch.updateMany).not.toHaveBeenCalled();
    expect(tx.shipmentUploadRow.updateMany).not.toHaveBeenCalled();
  });

  it('skips when any match is not fully transmitted', async () => {
    const tx: ClearTransmittedOrderPiiTxClient = {
      shipmentMatch: {
        findMany: vi.fn(async () => [
          { id: 'm1', uploadRowId: 'r1', transmissionStatus: 'SENT' },
          { id: 'm2', uploadRowId: 'r2', transmissionStatus: 'NONE' },
        ]),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      shipmentUploadRow: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      shipmentTransmissionAttempt: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      orderSyncOrder: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    };
    const client = withTransaction(tx);

    const result = await clearTransmittedOrderPiiIfComplete(client, {
      userId: 'u1',
      orderSyncOrderId: 'o1',
    });

    expect(result.skippedIncomplete).toBe(true);
    expect(tx.orderSyncOrder.updateMany).not.toHaveBeenCalled();
  });

  it('does not clear PII when matches from multiple batches include any NONE', async () => {
    const tx: ClearTransmittedOrderPiiTxClient = {
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
      shipmentTransmissionAttempt: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      orderSyncOrder: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    };
    const client = withTransaction(tx);

    const result = await clearTransmittedOrderPiiIfComplete(client, {
      userId: 'u1',
      orderSyncOrderId: 'o-shared',
    });

    expect(tx.shipmentMatch.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', orderSyncOrderId: 'o-shared' },
      select: {
        id: true,
        uploadRowId: true,
        transmissionStatus: true,
      },
    });
    expect(result.skippedIncomplete).toBe(true);
    expect(tx.orderSyncOrder.updateMany).not.toHaveBeenCalled();
    expect(tx.shipmentUploadRow.updateMany).not.toHaveBeenCalled();
  });

  it('clears order and related rows atomically when all matches are SENT/SKIPPED', async () => {
    let transactionCalls = 0;
    const tx: ClearTransmittedOrderPiiTxClient = {
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
    const client = withTransaction(tx, {
      onTransaction: () => {
        transactionCalls += 1;
      },
    });

    const now = new Date('2026-07-21T00:00:00.000Z');
    const result = await clearTransmittedOrderPiiIfComplete(client, {
      userId: 'u1',
      orderSyncOrderId: 'o1',
      now,
    });

    expect(transactionCalls).toBe(1);
    expect(result.skippedIncomplete).toBe(false);
    expect(result.clearedOrder).toBe(true);
    expect(result.clearedUploadRows).toBe(2);
    expect(result.clearedMatches).toBe(2);
    expect(result.clearedAttempts).toBe(1);
    expect(tx.orderSyncOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', userId: 'u1', piiClearedAt: null },
      data: expect.objectContaining({
        receiverName: null,
        receiverPhone: null,
        receiverAddress: null,
        piiClearedAt: now,
      }),
    });
  });

  it('does not leave partial clears when a later update fails inside the transaction', async () => {
    const committed = {
      order: false,
      match: false,
      row: false,
      attempt: false,
    };
    const pending: Array<() => void> = [];

    const tx: ClearTransmittedOrderPiiTxClient = {
      shipmentMatch: {
        findMany: vi.fn(async () => [
          { id: 'm1', uploadRowId: 'r1', transmissionStatus: 'SENT' },
        ]),
        updateMany: vi.fn(async () => {
          pending.push(() => {
            committed.match = true;
          });
          return { count: 1 };
        }),
      },
      shipmentUploadRow: {
        updateMany: vi.fn(async () => {
          throw Object.assign(new Error('upload row clear failed'), { code: 'PII_CLEAR_ROW' });
        }),
      },
      shipmentTransmissionAttempt: {
        updateMany: vi.fn(async () => {
          pending.push(() => {
            committed.attempt = true;
          });
          return { count: 1 };
        }),
      },
      orderSyncOrder: {
        updateMany: vi.fn(async () => {
          pending.push(() => {
            committed.order = true;
          });
          return { count: 1 };
        }),
      },
    };

    const client = withTransaction(tx, {
      wrap: async (fn) => {
        try {
          const result = await fn(tx);
          for (const apply of pending) apply();
          return result;
        } catch (error) {
          pending.length = 0;
          throw error;
        }
      },
    });

    await expect(
      clearTransmittedOrderPiiIfComplete(client, {
        userId: 'u1',
        orderSyncOrderId: 'o1',
      }),
    ).rejects.toMatchObject({ code: 'PII_CLEAR_ROW' });

    expect(committed).toEqual({
      order: false,
      match: false,
      row: false,
      attempt: false,
    });
    expect(tx.orderSyncOrder.updateMany).toHaveBeenCalled();
    expect(tx.shipmentMatch.updateMany).toHaveBeenCalled();
    expect(tx.shipmentUploadRow.updateMany).toHaveBeenCalled();
    expect(tx.shipmentTransmissionAttempt.updateMany).not.toHaveBeenCalled();
  });

  it('keeps piiClearedAt unset after failed transaction so retry remains possible', async () => {
    let piiClearedAt: Date | null = null;
    const tx: ClearTransmittedOrderPiiTxClient = {
      shipmentMatch: {
        findMany: vi.fn(async () => [
          { id: 'm1', uploadRowId: 'r1', transmissionStatus: 'SENT' },
        ]),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      shipmentUploadRow: {
        updateMany: vi.fn(async () => {
          throw new Error('boom');
        }),
      },
      shipmentTransmissionAttempt: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      orderSyncOrder: {
        updateMany: vi.fn(async (args) => {
          if (args.data && typeof args.data === 'object' && 'piiClearedAt' in args.data) {
            // commit only if transaction succeeds — simulated by wrap below
            return { count: 1 };
          }
          return { count: 0 };
        }),
      },
    };

    const client = withTransaction(tx, {
      wrap: async (fn) => {
        const draft: { piiClearedAt: Date | null } = { piiClearedAt: null };
        const inner: ClearTransmittedOrderPiiTxClient = {
          ...tx,
          orderSyncOrder: {
            updateMany: vi.fn(async (args) => {
              if (args.data && typeof args.data === 'object' && 'piiClearedAt' in args.data) {
                draft.piiClearedAt = args.data.piiClearedAt as Date;
              }
              return { count: 1 };
            }),
          },
        };
        try {
          const result = await fn(inner);
          piiClearedAt = draft.piiClearedAt;
          return result;
        } catch (error) {
          // rollback: do not publish draft.piiClearedAt
          throw error;
        }
      },
    });

    await expect(
      clearTransmittedOrderPiiIfComplete(client, {
        userId: 'u1',
        orderSyncOrderId: 'o1',
        now: new Date('2026-07-21T00:00:00.000Z'),
      }),
    ).rejects.toThrow('boom');

    expect(piiClearedAt).toBeNull();
  });
});
