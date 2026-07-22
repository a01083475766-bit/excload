import { describe, expect, it } from 'vitest';

import { buildPreviewDownloadAoA } from '@/app/lib/excel/preview-download-xlsx';
import {
  EXCLOAD_REMAIN_QUANTITY_ROW_KEY,
  normalizeRemainQuantityForPersist,
  resolveGroupedRemainQuantityForPersist,
  stripExcloadRemainQuantityFromRows,
} from '@/app/lib/order-integration/snapshots/remain-quantity';
import { buildOrderSyncSnapshots } from '@/app/lib/order-integration/snapshots/build-order-sync-snapshots';

describe('normalizeRemainQuantityForPersist', () => {
  it('allows finite integers >= 0', () => {
    expect(normalizeRemainQuantityForPersist(0)).toBe(0);
    expect(normalizeRemainQuantityForPersist(1)).toBe(1);
    expect(normalizeRemainQuantityForPersist(2)).toBe(2);
  });

  it('rejects unclear values without estimating 1 or coercing strings', () => {
    expect(normalizeRemainQuantityForPersist(-1)).toBeNull();
    expect(normalizeRemainQuantityForPersist(1.5)).toBeNull();
    expect(normalizeRemainQuantityForPersist(Number.NaN)).toBeNull();
    expect(normalizeRemainQuantityForPersist(Number.POSITIVE_INFINITY)).toBeNull();
    expect(normalizeRemainQuantityForPersist('1')).toBeNull();
    expect(normalizeRemainQuantityForPersist(null)).toBeNull();
    expect(normalizeRemainQuantityForPersist(undefined)).toBeNull();
    expect(normalizeRemainQuantityForPersist('')).toBeNull();
    expect(normalizeRemainQuantityForPersist({})).toBeNull();
  });
});

describe('resolveGroupedRemainQuantityForPersist', () => {
  it('sums smartstore remain quantities by source index', () => {
    expect(
      resolveGroupedRemainQuantityForPersist({
        provider: 'SMARTSTORE',
        sourceRowIndexes: [0, 1],
        remainQuantities: [1, 2],
      }),
    ).toBe(3);
  });

  it('returns null for non-smartstore or unclear entries', () => {
    expect(
      resolveGroupedRemainQuantityForPersist({
        provider: 'COUPANG',
        sourceRowIndexes: [0],
        remainQuantities: [1],
      }),
    ).toBeNull();
    expect(
      resolveGroupedRemainQuantityForPersist({
        provider: 'SMARTSTORE',
        sourceRowIndexes: [0, 1],
        remainQuantities: [1, null],
      }),
    ).toBeNull();
  });
});

describe('__excloadRemainQuantity download non-exposure', () => {
  it('strips internal key from rows before snapshot/download use', () => {
    const cleaned = stripExcloadRemainQuantityFromRows([
      {
        주문번호: '1001',
        [EXCLOAD_REMAIN_QUANTITY_ROW_KEY]: '9',
      },
    ]);
    expect(cleaned[0]).not.toHaveProperty(EXCLOAD_REMAIN_QUANTITY_ROW_KEY);
    expect(JSON.stringify(cleaned)).not.toContain(EXCLOAD_REMAIN_QUANTITY_ROW_KEY);
  });

  it('download AoA headers/rows never include the internal key even if present on source meta', () => {
    const courierHeaders = ['받는사람', '운송장번호', '상품명'];
    const aoa = buildPreviewDownloadAoA(
      courierHeaders,
      [
        {
          rowId: 'r1',
          data: {
            받는사람: '테스트',
            운송장번호: '123456789012',
            상품명: '상품',
            [EXCLOAD_REMAIN_QUANTITY_ROW_KEY]: '3',
          },
        },
      ],
      {},
    );

    expect(aoa[0]).toEqual(courierHeaders);
    expect(aoa[0]).not.toContain(EXCLOAD_REMAIN_QUANTITY_ROW_KEY);
    for (const cell of aoa.flat()) {
      expect(cell).not.toBe(EXCLOAD_REMAIN_QUANTITY_ROW_KEY);
      expect(String(cell)).not.toContain('__excload');
    }
  });

  it('snapshot build uses remainQuantities meta, not row internal key', () => {
    const snapshots = buildOrderSyncSnapshots({
      userId: 'user-a',
      provider: 'SMARTSTORE',
      accountId: 'acc-1',
      fetchedAt: '2026-07-09T00:00:00.000Z',
      rows: [
        {
          주문번호: '1001',
          상품주문번호: 'PO-1',
          받는사람: '홍길동',
          받는사람전화1: '010-1234-5678',
          받는사람주소1: '서울',
          상품명: '상품',
          수량: '1',
          [EXCLOAD_REMAIN_QUANTITY_ROW_KEY]: '9',
        },
      ],
      remainQuantities: [2],
    });

    expect(snapshots[0]?.remainQuantity).toBe(2);
    expect(JSON.stringify(snapshots[0]?.normalizedPayloadJson)).not.toContain(
      EXCLOAD_REMAIN_QUANTITY_ROW_KEY,
    );
  });
});
