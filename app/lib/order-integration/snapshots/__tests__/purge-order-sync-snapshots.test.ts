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
