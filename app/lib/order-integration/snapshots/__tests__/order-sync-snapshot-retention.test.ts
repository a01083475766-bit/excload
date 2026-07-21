import { describe, expect, it, vi } from 'vitest';
import {
  computeOrderSyncSnapshotExpiresAt,
  ORDER_SYNC_SNAPSHOT_TTL_MS,
} from '@/app/lib/order-integration/snapshots/order-sync-snapshot-retention';
import { clearOrderSyncOrderPii } from '@/app/lib/order-integration/snapshots/clear-order-sync-order-pii';
import { buildLoadOrderSyncSnapshotsForMatchingWhere } from '@/app/lib/order-integration/snapshots/load-order-sync-snapshots-for-matching';

describe('computeOrderSyncSnapshotExpiresAt', () => {
  it('adds 14 days from download time', () => {
    const downloadedAt = new Date('2026-07-21T00:00:00.000Z');
    const expires = computeOrderSyncSnapshotExpiresAt(downloadedAt);
    expect(expires.getTime() - downloadedAt.getTime()).toBe(ORDER_SYNC_SNAPSHOT_TTL_MS);
  });
});

describe('clearOrderSyncOrderPii', () => {
  it('updates only uncleared rows', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const result = await clearOrderSyncOrderPii(
      { orderSyncOrder: { updateMany } },
      { userId: 'u1', orderSyncOrderId: 'o1', now: new Date('2026-07-21T12:00:00.000Z') },
    );
    expect(result.cleared).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'o1', userId: 'u1', piiClearedAt: null }),
      }),
    );
  });
});

describe('buildLoadOrderSyncSnapshotsForMatchingWhere', () => {
  it('filters out expired snapshots', () => {
    const now = new Date('2026-07-21T00:00:00.000Z');
    const where = buildLoadOrderSyncSnapshotsForMatchingWhere({
      userId: 'user-a',
      now,
    });
    expect(where.OR).toEqual([{ expiresAt: null }, { expiresAt: { gte: now } }]);
  });
});
