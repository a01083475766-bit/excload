import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
  buildShipmentMatchPiiClearData,
  buildShipmentUploadRowPiiClearData,
  computeShipmentUploadPiiCutoff,
  scrubExpiredShipmentUploadPii,
  SHIPMENT_UPLOAD_PII_TTL_MS,
} from '@/app/lib/order-integration/snapshots/scrub-expired-shipment-upload-pii';
import { purgeOrderSyncSnapshots } from '@/app/lib/order-integration/snapshots/purge-order-sync-snapshots';
import {
  SHIPMENT_MATCH_PII_CLEAR_DATA,
  SHIPMENT_UPLOAD_ROW_PII_CLEAR_DATA,
} from '@/app/lib/order-integration/snapshots/scrub-linked-shipment-pii';

describe('scrubExpiredShipmentUploadPii', () => {
  const now = new Date('2026-07-21T12:00:00.000Z');
  const cutoff = computeShipmentUploadPiiCutoff(now);

  it('computes 14-day cutoff from createdAt policy', () => {
    expect(cutoff.getTime()).toBe(now.getTime() - SHIPMENT_UPLOAD_PII_TTL_MS);
  });

  it('uses Prisma.DbNull (SQL NULL) for JSON clear data, not JSON null', () => {
    const rowData = buildShipmentUploadRowPiiClearData();
    const matchData = buildShipmentMatchPiiClearData();
    expect(rowData.rawRowJson).toBe(Prisma.DbNull);
    expect(matchData.candidateOrdersJson).toBe(Prisma.DbNull);
    expect(matchData.mismatchFieldsJson).toBe(Prisma.DbNull);
    expect(rowData.rawRowJson).not.toBe(Prisma.JsonNull);
    expect(SHIPMENT_UPLOAD_ROW_PII_CLEAR_DATA.rawRowJson).toBe(Prisma.DbNull);
    expect(SHIPMENT_MATCH_PII_CLEAR_DATA.candidateOrdersJson).toBe(Prisma.DbNull);
  });

  it('scrubs expired linked UploadRow/Match without requiring OrderSyncOrder in the query', async () => {
    const rowFindMany = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'r-linked' }])
      .mockResolvedValueOnce([]);
    const rowUpdateMany = vi.fn(async () => ({ count: 1 }));
    const matchFindMany = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'm-linked' }])
      .mockResolvedValueOnce([]);
    const matchUpdateMany = vi.fn(async () => ({ count: 1 }));

    const result = await scrubExpiredShipmentUploadPii(
      {
        shipmentUploadRow: { findMany: rowFindMany, updateMany: rowUpdateMany },
        shipmentMatch: { findMany: matchFindMany, updateMany: matchUpdateMany },
      },
      { now },
    );

    expect(result.scrubbedUploadRows).toBe(1);
    expect(result.scrubbedMatches).toBe(1);
    expect(result.batchFailures).toBe(0);
    expect(result.stoppedReason).toBe('complete');
    const rowWhere = rowFindMany.mock.calls[0]?.[0]?.where as {
      createdAt: { lt: Date };
      OR: unknown[];
      orderSyncOrderId?: unknown;
    };
    expect(rowWhere.createdAt.lt).toEqual(cutoff);
    expect(rowWhere.orderSyncOrderId).toBeUndefined();
    expect(rowUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['r-linked'] } },
      data: expect.objectContaining({ rawRowJson: Prisma.DbNull }),
    });
  });

  it('scrubs expired unlinked UploadRow', async () => {
    const rowFindMany = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'r-orphan' }])
      .mockResolvedValueOnce([]);
    const rowUpdateMany = vi.fn(async () => ({ count: 1 }));

    const result = await scrubExpiredShipmentUploadPii(
      {
        shipmentUploadRow: { findMany: rowFindMany, updateMany: rowUpdateMany },
        shipmentMatch: {
          findMany: vi.fn(async () => []),
          updateMany: vi.fn(async () => ({ count: 0 })),
        },
      },
      { now },
    );

    expect(result.scrubbedUploadRows).toBe(1);
    expect(rowFindMany.mock.calls[0]?.[0]?.where).toEqual(
      expect.objectContaining({ createdAt: { lt: cutoff } }),
    );
  });

  it('scrubs expired unlinked/unmatched Match JSON fields', async () => {
    const matchFindMany = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'm-orphan' }])
      .mockResolvedValueOnce([]);
    const matchUpdateMany = vi.fn(async () => ({ count: 1 }));

    const result = await scrubExpiredShipmentUploadPii(
      {
        shipmentUploadRow: {
          findMany: vi.fn(async () => []),
          updateMany: vi.fn(async () => ({ count: 0 })),
        },
        shipmentMatch: { findMany: matchFindMany, updateMany: matchUpdateMany },
      },
      { now },
    );

    expect(result.scrubbedMatches).toBe(1);
    const where = matchFindMany.mock.calls[0]?.[0]?.where as {
      orderSyncOrderId?: unknown;
      OR: Array<Record<string, unknown>>;
    };
    expect(where.orderSyncOrderId).toBeUndefined();
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { candidateOrdersJson: { not: Prisma.DbNull } },
        { mismatchFieldsJson: { not: Prisma.DbNull } },
      ]),
    );
  });

  it('is idempotent when findMany returns empty (already NULL)', async () => {
    const result = await scrubExpiredShipmentUploadPii(
      {
        shipmentUploadRow: {
          findMany: vi.fn(async () => []),
          updateMany: vi.fn(async () => ({ count: 0 })),
        },
        shipmentMatch: {
          findMany: vi.fn(async () => []),
          updateMany: vi.fn(async () => ({ count: 0 })),
        },
      },
      { now },
    );
    expect(result.scrubbedUploadRows).toBe(0);
    expect(result.scrubbedMatches).toBe(0);
    expect(result.batchFailures).toBe(0);
    expect(result.stoppedReason).toBe('complete');
  });

  it('clears matches when only one of candidate/mismatch JSON remains', async () => {
    const matchUpdateMany = vi.fn(async () => ({ count: 1 }));
    await scrubExpiredShipmentUploadPii(
      {
        shipmentUploadRow: {
          findMany: vi.fn(async () => []),
          updateMany: vi.fn(async () => ({ count: 0 })),
        },
        shipmentMatch: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([{ id: 'm-partial' }])
            .mockResolvedValueOnce([]),
          updateMany: matchUpdateMany,
        },
      },
      { now },
    );
    expect(matchUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['m-partial'] } },
      data: expect.objectContaining({
        candidateOrdersJson: Prisma.DbNull,
        mismatchFieldsJson: Prisma.DbNull,
      }),
    });
  });

  it('records batchFailures without throwing when a batch update fails', async () => {
    const rowFindMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
      const excluded = (args.where.id as { notIn?: string[] } | undefined)?.notIn ?? [];
      if (excluded.includes('r1')) return [];
      return [{ id: 'r1' }];
    });
    const result = await scrubExpiredShipmentUploadPii(
      {
        shipmentUploadRow: {
          findMany: rowFindMany,
          updateMany: vi.fn(async () => {
            throw new Error('db');
          }),
        },
        shipmentMatch: {
          findMany: vi.fn(async () => []),
          updateMany: vi.fn(async () => ({ count: 0 })),
        },
      },
      { now, maxBatches: 5 },
    );
    expect(result.batchFailures).toBe(1);
    expect(result.scrubbedUploadRows).toBe(0);
    expect(result.lastErrorCode).toBe('Error');
    expect(result.stoppedReason).toBe('update_error');
  });

  it('does not re-query the same ids forever when update keeps failing (skips + maxBatches)', async () => {
    const seenWheres: unknown[] = [];
    const rowFindMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
      seenWheres.push(args.where);
      const excluded = (args.where.id as { notIn?: string[] } | undefined)?.notIn ?? [];
      if (excluded.includes('r-bad')) return [];
      return [{ id: 'r-bad' }];
    });
    const rowUpdateMany = vi.fn(async () => {
      throw new Error('permanent');
    });

    const result = await scrubExpiredShipmentUploadPii(
      {
        shipmentUploadRow: { findMany: rowFindMany, updateMany: rowUpdateMany },
        shipmentMatch: {
          findMany: vi.fn(async () => []),
          updateMany: vi.fn(async () => ({ count: 0 })),
        },
      },
      { now, batchSize: 1, maxBatches: 5 },
    );

    expect(rowUpdateMany).toHaveBeenCalledTimes(1);
    expect(result.batchFailures).toBe(1);
    expect(result.rowBatchesAttempted).toBe(1);
    // 두 번째 find는 실패 id를 notIn으로 제외
    expect(seenWheres.some((w) => JSON.stringify(w).includes('r-bad'))).toBe(true);
    const secondWhere = seenWheres[1] as { id?: { notIn?: string[] } };
    expect(secondWhere?.id?.notIn).toEqual(expect.arrayContaining(['r-bad']));
  });

  it('keeps earlier successful scrub counts when a later batch fails', async () => {
    const rowFindMany = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'r-ok' }])
      .mockResolvedValueOnce([{ id: 'r-fail' }])
      .mockResolvedValueOnce([]);
    const rowUpdateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(new Error('second-batch'));

    const result = await scrubExpiredShipmentUploadPii(
      {
        shipmentUploadRow: { findMany: rowFindMany, updateMany: rowUpdateMany },
        shipmentMatch: {
          findMany: vi.fn(async () => []),
          updateMany: vi.fn(async () => ({ count: 0 })),
        },
      },
      { now, batchSize: 1, maxBatches: 10 },
    );

    expect(result.scrubbedUploadRows).toBe(1);
    expect(result.batchFailures).toBe(1);
    expect(rowUpdateMany).toHaveBeenCalledTimes(2);
  });

  it('stops on zero-progress update instead of looping the same ids', async () => {
    const rowFindMany = vi.fn(async () => [{ id: 'r-stuck' }]);
    const rowUpdateMany = vi.fn(async () => ({ count: 0 }));

    const result = await scrubExpiredShipmentUploadPii(
      {
        shipmentUploadRow: { findMany: rowFindMany, updateMany: rowUpdateMany },
        shipmentMatch: {
          findMany: vi.fn(async () => []),
          updateMany: vi.fn(async () => ({ count: 0 })),
        },
      },
      { now, batchSize: 10, maxBatches: 20 },
    );

    expect(rowUpdateMany).toHaveBeenCalledTimes(1);
    expect(rowFindMany.mock.calls.length).toBeLessThan(5);
    expect(result.stoppedReason).toBe('zero_progress');
    expect(result.lastErrorCode).toBe('ZERO_PROGRESS');
  });

  it('honours maxBatches so cron cannot run unbounded', async () => {
    const rowFindMany = vi.fn(async () => [{ id: 'r-more' }]);
    const rowUpdateMany = vi.fn(async () => ({ count: 1 }));

    const result = await scrubExpiredShipmentUploadPii(
      {
        shipmentUploadRow: { findMany: rowFindMany, updateMany: rowUpdateMany },
        shipmentMatch: {
          findMany: vi.fn(async () => []),
          updateMany: vi.fn(async () => ({ count: 0 })),
        },
      },
      { now, batchSize: 1, maxBatches: 3 },
    );

    expect(result.rowBatchesAttempted).toBe(3);
    expect(result.scrubbedUploadRows).toBe(3);
    expect(result.stoppedReason).toBe('max_batches');
  });
});

describe('purgeOrderSyncSnapshots regression with independent scrub constants', () => {
  it('still scrubs linked PII before deleting expired OrderSyncOrder', async () => {
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

    const result = await purgeOrderSyncSnapshots({
      now: new Date('2026-07-21T00:00:00.000Z'),
      client: {
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
            { id: 'm-expired', uploadRowId: 'r-expired', transmissionStatus: 'NONE' },
          ]),
          updateMany: matchUpdateMany,
        },
        shipmentUploadRow: {
          updateMany: rowUpdateMany,
        },
        shipmentTransmissionAttempt: {
          updateMany: vi.fn(async () => ({ count: 0 })),
        },
      },
    });

    expect(result.deletedExpiredOrders).toBe(1);
    expect(matchUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          candidateOrdersJson: Prisma.DbNull,
        }),
      }),
    );
    expect(callOrder.indexOf('match-scrub')).toBeLessThan(callOrder.indexOf('order-delete'));
  });
});
