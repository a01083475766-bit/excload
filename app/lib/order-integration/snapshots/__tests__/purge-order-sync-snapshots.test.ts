import { describe, expect, it, vi } from 'vitest';
import {
  SHIPMENT_MATCH_PII_CLEAR_DATA,
  SHIPMENT_UPLOAD_ROW_PII_CLEAR_DATA,
  scrubLinkedShipmentPiiForOrders,
} from '@/app/lib/order-integration/snapshots/scrub-linked-shipment-pii';
import { purgeOrderSyncSnapshots } from '@/app/lib/order-integration/snapshots/purge-order-sync-snapshots';

describe('scrubLinkedShipmentPiiForOrders', () => {
  it('clears Match candidate JSON and UploadRow PII for linked orders', async () => {
    const client = {
      shipmentMatch: {
        findMany: vi.fn(async () => [
          { id: 'm1', uploadRowId: 'r1' },
          { id: 'm2', uploadRowId: 'r1' },
        ]),
        updateMany: vi.fn(async () => ({ count: 2 })),
      },
      shipmentUploadRow: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };

    const result = await scrubLinkedShipmentPiiForOrders(client, {
      orderSyncOrderIds: ['o-expired'],
    });

    expect(result).toEqual({ clearedMatches: 2, clearedUploadRows: 1 });
    expect(client.shipmentMatch.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['m1', 'm2'] } },
      data: { ...SHIPMENT_MATCH_PII_CLEAR_DATA },
    });
    expect(client.shipmentUploadRow.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['r1'] } },
      data: { ...SHIPMENT_UPLOAD_ROW_PII_CLEAR_DATA },
    });
  });
});

describe('purgeOrderSyncSnapshots expired incomplete orders', () => {
  it('scrubs linked UploadRow·Match PII before hard-deleting expired orders', async () => {
    const callOrder: string[] = [];
    const matchUpdateMany = vi.fn(async () => {
      callOrder.push('match-scrub');
      return { count: 1 };
    });
    const rowUpdateMany = vi.fn(async () => {
      callOrder.push('row-scrub');
      return { count: 1 };
    });
    const deleteMany = vi.fn(async () => {
      callOrder.push('order-delete');
      return { count: 1 };
    });
    let expiredQueried = false;

    const client = {
      orderSyncOrder: {
        findMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
          if ('expiresAt' in args.where && !expiredQueried) {
            expiredQueried = true;
            return [{ id: 'o-expired' }];
          }
          return [];
        }),
        deleteMany,
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      shipmentMatch: {
        findMany: vi.fn(async () => [
          {
            id: 'm-expired',
            uploadRowId: 'r-expired',
            transmissionStatus: 'NONE',
          },
        ]),
        updateMany: matchUpdateMany,
      },
      shipmentUploadRow: {
        updateMany: rowUpdateMany,
      },
      shipmentTransmissionAttempt: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      $transaction: async <T>(_fn: (tx: never) => Promise<T>): Promise<T> => {
        throw new Error('unexpected PII clear transaction in expired-delete test');
      },
    };

    const result = await purgeOrderSyncSnapshots({
      now: new Date('2026-07-21T00:00:00.000Z'),
      client: client as never,
    });

    expect(result.deletedExpiredOrders).toBe(1);
    expect(result.scrubbedExpiredMatches).toBe(1);
    expect(result.scrubbedExpiredUploadRows).toBe(1);
    expect(matchUpdateMany).toHaveBeenCalled();
    expect(rowUpdateMany).toHaveBeenCalled();
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['o-expired'] } },
    });
    expect(callOrder.indexOf('match-scrub')).toBeLessThan(callOrder.indexOf('order-delete'));
    expect(callOrder.indexOf('row-scrub')).toBeLessThan(callOrder.indexOf('order-delete'));
  });
});

describe('purgeOrderSyncSnapshots SENT PII progress', () => {
  it('skips leading incomplete rows and still clears a later eligible order', async () => {
    const incompleteIds = Array.from({ length: 100 }, (_, i) => `inc-${i}`);
    const clearableId = 'clear-1';
    const findManyCalls: Array<Record<string, unknown>> = [];
    const clearedOrderIds = new Set<string>();

    const client = {
      orderSyncOrder: {
        findMany: vi.fn(async (args: { where: Record<string, unknown>; take?: number }) => {
          if ('expiresAt' in args.where) return [];
          findManyCalls.push(args.where);
          const notIn =
            args.where.id && typeof args.where.id === 'object' && args.where.id !== null && 'notIn' in args.where.id
              ? new Set((args.where.id as { notIn: string[] }).notIn)
              : new Set<string>();
          const remaining = [...incompleteIds, clearableId].filter(
            (id) => !notIn.has(id) && !clearedOrderIds.has(id),
          );
          return remaining.slice(0, args.take ?? 100).map((id) => ({ id, userId: 'user-1' }));
        }),
        deleteMany: vi.fn(async () => ({ count: 0 })),
        updateMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
          const id = typeof args.where.id === 'string' ? args.where.id : '';
          if (id) clearedOrderIds.add(id);
          return { count: 1 };
        }),
      },
      shipmentMatch: {
        findMany: vi.fn(async (args: { where: { orderSyncOrderId?: string } }) => {
          const orderId = String(args.where.orderSyncOrderId ?? '');
          const status = incompleteIds.includes(orderId) ? 'READY' : 'SENT';
          return [{ id: `m-${orderId}`, uploadRowId: `r-${orderId}`, transmissionStatus: status }];
        }),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      shipmentUploadRow: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      shipmentTransmissionAttempt: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(client),
    };

    const result = await purgeOrderSyncSnapshots({
      now: new Date('2026-07-21T00:00:00.000Z'),
      client: client as never,
      sentPiiBatchSize: 100,
      sentPiiMaxBatches: 10,
    });

    expect(result.clearedSentPiiOrders).toBe(1);
    expect(result.sentPiiStoppedReason).toBe('complete');
    expect(findManyCalls.length).toBeGreaterThanOrEqual(2);
    const secondWhere = findManyCalls[1] as { id?: { notIn: string[] } };
    expect(secondWhere.id?.notIn).toEqual(expect.arrayContaining(incompleteIds));
    expect(secondWhere.id?.notIn).toHaveLength(100);
    expect(clearedOrderIds.has(clearableId)).toBe(true);
  });

  it('does not re-query the same incomplete ids forever within one run', async () => {
    const incompleteIds = Array.from({ length: 3 }, (_, i) => `stuck-${i}`);
    const findManyCalls: Array<Record<string, unknown>> = [];

    const client = {
      orderSyncOrder: {
        findMany: vi.fn(async (args: { where: Record<string, unknown>; take?: number }) => {
          if ('expiresAt' in args.where) return [];
          findManyCalls.push(args.where);
          const notIn =
            args.where.id && typeof args.where.id === 'object' && args.where.id !== null && 'notIn' in args.where.id
              ? new Set((args.where.id as { notIn: string[] }).notIn)
              : new Set<string>();
          return incompleteIds
            .filter((id) => !notIn.has(id))
            .slice(0, args.take ?? 100)
            .map((id) => ({ id, userId: 'user-1' }));
        }),
        deleteMany: vi.fn(async () => ({ count: 0 })),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      shipmentMatch: {
        findMany: vi.fn(async (args: { where: { orderSyncOrderId?: string } }) => {
          const orderId = String(args.where.orderSyncOrderId ?? '');
          return [{ id: `m-${orderId}`, uploadRowId: `r-${orderId}`, transmissionStatus: 'READY' }];
        }),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      shipmentUploadRow: { updateMany: vi.fn(async () => ({ count: 0 })) },
      shipmentTransmissionAttempt: { updateMany: vi.fn(async () => ({ count: 0 })) },
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(client),
    };

    const result = await purgeOrderSyncSnapshots({
      now: new Date('2026-07-21T00:00:00.000Z'),
      client: client as never,
      sentPiiBatchSize: 100,
      sentPiiMaxBatches: 5,
    });

    expect(result.clearedSentPiiOrders).toBe(0);
    expect(result.sentPiiStoppedReason).toBe('complete');
    expect(findManyCalls.length).toBeLessThanOrEqual(2);
    expect(client.orderSyncOrder.updateMany).not.toHaveBeenCalled();
  });

  it('stops within maxBatches even when more SENT rows remain', async () => {
    let seq = 0;
    const client = {
      orderSyncOrder: {
        findMany: vi.fn(async (args: { where: Record<string, unknown>; take?: number }) => {
          if ('expiresAt' in args.where) return [];
          const take = args.take ?? 100;
          return Array.from({ length: take }, () => {
            seq += 1;
            return { id: `o-${seq}`, userId: 'user-1' };
          });
        }),
        deleteMany: vi.fn(async () => ({ count: 0 })),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      shipmentMatch: {
        findMany: vi.fn(async () => [
          { id: 'm1', uploadRowId: 'r1', transmissionStatus: 'READY' },
        ]),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      shipmentUploadRow: { updateMany: vi.fn(async () => ({ count: 0 })) },
      shipmentTransmissionAttempt: { updateMany: vi.fn(async () => ({ count: 0 })) },
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(client),
    };

    const result = await purgeOrderSyncSnapshots({
      now: new Date('2026-07-21T00:00:00.000Z'),
      client: client as never,
      sentPiiBatchSize: 10,
      sentPiiMaxBatches: 3,
    });

    expect(result.sentPiiBatchesAttempted).toBe(3);
    expect(result.sentPiiStoppedReason).toBe('max_batches');
    expect(result.clearedSentPiiOrders).toBe(0);
  });

  it('does not mark incomplete orders as piiCleared', async () => {
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const client = {
      orderSyncOrder: {
        findMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
          if ('expiresAt' in args.where) return [];
          if (args.where.id && typeof args.where.id === 'object') return [];
          return [{ id: 'inc-only', userId: 'user-1' }];
        }),
        deleteMany: vi.fn(async () => ({ count: 0 })),
        updateMany: orderUpdateMany,
      },
      shipmentMatch: {
        findMany: vi.fn(async () => [
          { id: 'm1', uploadRowId: 'r1', transmissionStatus: 'FAILED' },
        ]),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      shipmentUploadRow: { updateMany: vi.fn(async () => ({ count: 0 })) },
      shipmentTransmissionAttempt: { updateMany: vi.fn(async () => ({ count: 0 })) },
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(client),
    };

    const result = await purgeOrderSyncSnapshots({
      now: new Date('2026-07-21T00:00:00.000Z'),
      client: client as never,
    });

    expect(result.clearedSentPiiOrders).toBe(0);
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(client.shipmentMatch.updateMany).not.toHaveBeenCalled();
    expect(client.shipmentUploadRow.updateMany).not.toHaveBeenCalled();
  });
});
