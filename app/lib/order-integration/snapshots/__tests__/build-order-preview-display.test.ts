import { describe, expect, it } from 'vitest';

import { buildOrderSyncSnapshots } from '@/app/lib/order-integration/snapshots/build-order-sync-snapshots';
import {
  buildCourierExportRowFromSnapshot,
  buildOrderPreviewDisplayRow,
  buildOrderPreviewDisplayRows,
  exportRowContainsInternalTrackingKeys,
} from '@/app/lib/order-integration/snapshots/build-order-preview-display';

const BASE_INPUT = {
  userId: 'user-a',
  provider: 'SMARTSTORE' as const,
  accountId: 'acc-1',
  fetchedAt: '2026-07-09T00:00:00.000Z',
  rows: [
    {
      주문번호: '1001',
      상품주문번호: 'PO-1',
      받는사람: '홍길동',
      받는사람전화1: '010-1234-5678',
      받는사람주소1: '서울시 강남구',
      상품명: '반팔티',
      수량: '1',
      배송메시지: '문 앞',
    },
  ],
};

describe('buildCourierExportRowFromSnapshot', () => {
  it('excludes internal tracking keys from exportRow by default', () => {
    const [snapshot] = buildOrderSyncSnapshots(BASE_INPUT);
    const exportRow = buildCourierExportRowFromSnapshot(snapshot!);

    expect(exportRow['받는사람']).toBe('홍길동');
    expect(exportRow['상품명']).toBe('반팔티 x1');
    expect(exportRow['주문번호']).toBeUndefined();
    expect(exportRow['엑클로드관리번호']).toBeUndefined();
    expect(exportRowContainsInternalTrackingKeys(exportRow)).toBe(false);
  });

  it('includes excloadOrderNo only when explicitly opted in', () => {
    const [snapshot] = buildOrderSyncSnapshots(BASE_INPUT);

    const withInternal = buildCourierExportRowFromSnapshot(snapshot!, {
      includeExcloadOrderNoInExport: true,
    });

    expect(withInternal['엑클로드관리번호']).toBe(snapshot?.excloadOrderNo);
  });
});

describe('buildOrderPreviewDisplayRow', () => {
  it('keeps meta and exportRow separated', () => {
    const [snapshot] = buildOrderSyncSnapshots(BASE_INPUT);
    const display = buildOrderPreviewDisplayRow(snapshot!, {
      providerLabel: '스마트스토어',
      accountLabel: '메인몰',
    });

    expect(display.meta.provider).toBe('SMARTSTORE');
    expect(display.meta.providerLabel).toBe('스마트스토어');
    expect(display.meta.accountId).toBe('acc-1');
    expect(display.meta.accountLabel).toBe('메인몰');
    expect(display.meta.mallOrderNo).toBe('1001');
    expect(display.meta.excloadOrderNo).toMatch(/^EXC-\d{8}-\d{6}$/);
    expect(display.exportRow['받는사람']).toBe('홍길동');
    expect(display.exportRow['엑클로드관리번호']).toBeUndefined();
  });
});

describe('buildOrderPreviewDisplayRows', () => {
  it('maps all snapshots to display rows', () => {
    const snapshots = buildOrderSyncSnapshots({
      ...BASE_INPUT,
      rows: [
        ...BASE_INPUT.rows,
        {
          ...BASE_INPUT.rows[0]!,
          주문번호: '1002',
          상품주문번호: 'PO-2',
          받는사람주소1: '부산시 해운대구',
        },
      ],
    });

    const displays = buildOrderPreviewDisplayRows({
      snapshots,
      providerLabel: '스마트스토어',
    });

    expect(displays).toHaveLength(2);
    expect(displays[0]?.meta.mallOrderNo).toBe('1001');
    expect(displays[1]?.meta.mallOrderNo).toBe('1002');
  });
});
