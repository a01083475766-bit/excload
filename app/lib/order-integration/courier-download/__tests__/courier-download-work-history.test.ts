import { describe, expect, it, vi } from 'vitest';

import {
  deleteCourierDownloadBundlesByIds,
  parseCourierDownloadBundleIdsBody,
} from '@/app/lib/order-integration/courier-download/persist-courier-download-bundle';
import { buildCourierDownloadRedownloadRows } from '@/app/lib/order-integration/courier-download/redownload-courier-download-bundle';

describe('parseCourierDownloadBundleIdsBody', () => {
  it('rejects empty or invalid body', () => {
    expect(parseCourierDownloadBundleIdsBody(null).ok).toBe(false);
    expect(parseCourierDownloadBundleIdsBody({}).ok).toBe(false);
    expect(parseCourierDownloadBundleIdsBody({ bundleIds: [] }).ok).toBe(false);
    expect(parseCourierDownloadBundleIdsBody({ bundleIds: [1] }).ok).toBe(false);
  });

  it('accepts unique trimmed ids', () => {
    expect(parseCourierDownloadBundleIdsBody({ bundleIds: [' a ', 'a', 'b'] })).toEqual({
      ok: true,
      bundleIds: ['a', 'b'],
    });
  });
});

describe('deleteCourierDownloadBundlesByIds', () => {
  it('deletes only owner bundles', async () => {
    const deleteMany = vi.fn(async () => ({ count: 2 }));
    const result = await deleteCourierDownloadBundlesByIds(
      { courierDownloadBundle: { deleteMany } },
      { userId: 'u1', bundleIds: ['b1', 'b2', 'b1'] },
    );
    expect(result).toEqual({ deletedCount: 2, requestedCount: 2 });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', id: { in: ['b1', 'b2'] } },
    });
  });
});

describe('buildCourierDownloadRedownloadRows', () => {
  it('returns NOT_FOUND when bundle missing', async () => {
    const findFirst = vi.fn(async () => null);
    const result = await buildCourierDownloadRedownloadRows(
      { courierDownloadBundle: { findFirst } },
      { userId: 'u1', bundleId: 'missing' },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NOT_FOUND');
  });

  it('exports rows from linked OrderSyncOrder and skips PII-cleared', async () => {
    const findFirst = vi.fn(async () => ({
      id: 'bundle-1',
      createdAt: new Date('2026-08-09T01:02:00.000Z'),
      rowCount: 2,
      workItems: [
        {
          mallOrderNo: 'M-1',
          orderSyncOrder: {
            provider: 'SMARTSTORE',
            integrationAccountId: null,
            mallOrderNo: 'M-1',
            excloadOrderNo: 'EX-1',
            receiverName: '홍길동',
            receiverPhone: '010',
            receiverAddress: '서울',
            productSummary: '상품',
            quantity: 2,
            deliveryMemo: '문앞',
            trackingNumber: null,
            piiClearedAt: null,
          },
        },
        {
          mallOrderNo: 'M-2',
          orderSyncOrder: {
            provider: 'SMARTSTORE',
            integrationAccountId: null,
            mallOrderNo: 'M-2',
            excloadOrderNo: 'EX-2',
            receiverName: '',
            receiverPhone: '',
            receiverAddress: '',
            productSummary: '상품2',
            quantity: 1,
            deliveryMemo: null,
            trackingNumber: null,
            piiClearedAt: new Date('2026-08-01T00:00:00.000Z'),
          },
        },
      ],
    }));

    const result = await buildCourierDownloadRedownloadRows(
      { courierDownloadBundle: { findFirst } },
      { userId: 'u1', bundleId: 'bundle-1' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.exportedCount).toBe(1);
    expect(result.skippedPiiCleared).toBe(1);
    expect(result.rows[0]).toMatchObject({
      주문번호: 'M-1',
      엑클로드관리번호: 'EX-1',
      받는사람: '홍길동',
      수량: '2',
    });
    expect(result.fileStem.endsWith('_1건')).toBe(true);
  });

  it('fails when no exportable rows remain', async () => {
    const findFirst = vi.fn(async () => ({
      id: 'bundle-2',
      createdAt: new Date('2026-08-09T01:02:00.000Z'),
      rowCount: 1,
      workItems: [
        {
          mallOrderNo: 'M-9',
          orderSyncOrder: {
            provider: 'SMARTSTORE',
            integrationAccountId: null,
            mallOrderNo: 'M-9',
            excloadOrderNo: 'EX-9',
            receiverName: '',
            receiverPhone: '',
            receiverAddress: '',
            productSummary: '',
            quantity: 1,
            deliveryMemo: null,
            trackingNumber: null,
            piiClearedAt: new Date(),
          },
        },
      ],
    }));

    const result = await buildCourierDownloadRedownloadRows(
      { courierDownloadBundle: { findFirst } },
      { userId: 'u1', bundleId: 'bundle-2' },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NO_EXPORTABLE_ROWS');
  });
});
