import { describe, expect, it } from 'vitest';

import {
  buildOrderSyncSnapshots,
  buildProductSummary,
  buildShipmentGroupKey,
  groupOrderRowsForShipment,
} from '@/app/lib/order-integration/snapshots/build-order-sync-snapshots';
import {
  formatExcloadOrderNoDateKey,
  generateExcloadOrderNo,
} from '@/app/lib/order-integration/snapshots/excload-order-no';

const BASE_INPUT = {
  userId: 'user-a',
  provider: 'SMARTSTORE' as const,
  accountId: 'acc-1',
  batchId: 'batch-1',
  fetchedAt: '2026-07-09T00:00:00.000Z',
};

function makeRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    주문번호: '1001',
    상품주문번호: 'PO-1',
    받는사람: '홍길동',
    받는사람전화1: '010-1234-5678',
    받는사람주소1: '서울시 강남구',
    받는사람주소2: '101호',
    상품명: '반팔티',
    수량: '1',
    주문상태: '결제완료',
    결제일시: '2026-07-09 10:00:00',
    배송메시지: '문 앞',
    ...overrides,
  };
}

describe('buildProductSummary', () => {
  it('joins multiple line items with slash separator', () => {
    const summary = buildProductSummary([
      makeRow({ 상품명: '상품A', 수량: '1' }),
      makeRow({ 상품명: '상품B', 수량: '2', 상품옵션: '블랙' }),
    ]);

    expect(summary).toBe('상품A x1 / 상품B(블랙) x2');
  });
});

describe('groupOrderRowsForShipment', () => {
  it('merges 3 line items with same order/receiver/phone/address', () => {
    const groups = groupOrderRowsForShipment({
      provider: 'SMARTSTORE',
      accountId: 'acc-1',
      rows: [
        makeRow({ 상품주문번호: 'PO-1', 상품명: '반팔티' }),
        makeRow({ 상품주문번호: 'PO-2', 상품명: '바지', 수량: '1' }),
        makeRow({ 상품주문번호: 'PO-3', 상품명: '모자', 수량: '1' }),
      ],
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.rows).toHaveLength(3);
  });

  it('splits same mallOrderNo when address differs', () => {
    const groups = groupOrderRowsForShipment({
      provider: 'SMARTSTORE',
      accountId: 'acc-1',
      rows: [
        makeRow({ 상품주문번호: 'PO-1', 받는사람주소1: '서울시 강남구' }),
        makeRow({ 상품주문번호: 'PO-2', 받는사람주소1: '부산시 해운대구' }),
      ],
    });

    expect(groups).toHaveLength(2);
  });

  it('splits same mallOrderNo when receiver or phone differs', () => {
    const groups = groupOrderRowsForShipment({
      provider: 'SMARTSTORE',
      accountId: 'acc-1',
      rows: [
        makeRow({ 상품주문번호: 'PO-1', 받는사람: '홍길동', 받는사람전화1: '01011112222' }),
        makeRow({ 상품주문번호: 'PO-2', 받는사람: '김철수', 받는사람전화1: '01033334444' }),
      ],
    });

    expect(groups).toHaveLength(2);
  });

  it('groups by normalized phone and address', () => {
    const keyA = buildShipmentGroupKey({
      provider: 'SMARTSTORE',
      accountId: 'acc-1',
      row: makeRow({ 받는사람전화1: '010-1234-5678' }),
    });
    const keyB = buildShipmentGroupKey({
      provider: 'SMARTSTORE',
      accountId: 'acc-1',
      row: makeRow({ 받는사람전화1: '01012345678' }),
    });

    expect(keyA).toBe(keyB);
  });

  it('does not group by row index', () => {
    const groups = groupOrderRowsForShipment({
      provider: 'SMARTSTORE',
      accountId: 'acc-1',
      rows: [
        makeRow({ 상품주문번호: 'PO-9', 주문번호: '9999' }),
        makeRow({ 상품주문번호: 'PO-1' }),
        makeRow({ 상품주문번호: 'PO-2' }),
      ],
    });

    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.rows.length === 2)?.sourceRowIndexes).toEqual([1, 2]);
  });
});

describe('buildOrderSyncSnapshots', () => {
  it('builds one snapshot from 3 merged line items', () => {
    const snapshots = buildOrderSyncSnapshots({
      ...BASE_INPUT,
      rows: [
        makeRow({ 상품주문번호: 'PO-1', 상품명: '반팔티' }),
        makeRow({ 상품주문번호: 'PO-2', 상품명: '바지' }),
        makeRow({ 상품주문번호: 'PO-3', 상품명: '모자' }),
      ],
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.mallOrderNo).toBe('1001');
    expect(snapshots[0]?.productSummary).toBe('반팔티 x1 / 바지 x1 / 모자 x1');
    expect(snapshots[0]?.quantity).toBe(3);
    expect(snapshots[0]?.remainQuantity).toBeNull();
    expect(snapshots[0]?.receiverName).toBe('홍길동');
    expect(snapshots[0]?.receiverPhone).toBe('010-1234-5678');
    expect(snapshots[0]?.mallLineItemIds).toEqual(['PO-1', 'PO-2', 'PO-3']);
  });

  it('keeps single-row Shopify-like orders as one snapshot', () => {
    const snapshots = buildOrderSyncSnapshots({
      ...BASE_INPUT,
      provider: 'SHOPIFY',
      rows: [
        makeRow({
          상품주문번호: '#1001',
          상품명: '티셔츠 / 후드',
          수량: '3',
        }),
      ],
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.productSummary).toBe('티셔츠 / 후드 x3');
    expect(snapshots[0]?.quantity).toBe(3);
  });

  it('preserves userId, provider, and accountId', () => {
    const snapshots = buildOrderSyncSnapshots({
      ...BASE_INPUT,
      rows: [makeRow()],
    });

    expect(snapshots[0]?.userId).toBe('user-a');
    expect(snapshots[0]?.provider).toBe('SMARTSTORE');
    expect(snapshots[0]?.accountId).toBe('acc-1');
  });

  it('returns empty array for empty rows', () => {
    expect(buildOrderSyncSnapshots({ ...BASE_INPUT, rows: [] })).toEqual([]);
    expect(
      buildOrderSyncSnapshots({
        ...BASE_INPUT,
        rows: [{ 운송장번호: '', 상품명: '' }],
      }),
    ).toEqual([]);
  });

  it('assigns sequential excloadOrderNo values', () => {
    const snapshots = buildOrderSyncSnapshots({
      ...BASE_INPUT,
      excloadOrderNoStartSeq: 1,
      rows: [
        makeRow({ 상품주문번호: 'PO-1' }),
        makeRow({ 상품주문번호: 'PO-2', 받는사람주소1: '부산시' }),
      ],
    });

    expect(snapshots[0]?.excloadOrderNo).toBe('EXC-20260709-000001');
    expect(snapshots[1]?.excloadOrderNo).toBe('EXC-20260709-000002');
  });

  it('persists smartstore remainQuantity from remainQuantities meta without estimating 1', () => {
    const snapshots = buildOrderSyncSnapshots({
      ...BASE_INPUT,
      provider: 'SMARTSTORE',
      rows: [
        makeRow({
          상품주문번호: 'PO-1',
        }),
      ],
      remainQuantities: [2],
    });
    expect(snapshots[0]?.remainQuantity).toBe(2);

    const missing = buildOrderSyncSnapshots({
      ...BASE_INPUT,
      rows: [makeRow({ 상품주문번호: 'PO-9' })],
    });
    expect(missing[0]?.remainQuantity).toBeNull();
  });
});

describe('generateExcloadOrderNo', () => {
  it('formats EXC-YYYYMMDD-######', () => {
    expect(
      generateExcloadOrderNo({
        dateKey: formatExcloadOrderNoDateKey(new Date('2026-07-09T00:00:00.000Z')),
        sequence: 1,
      }),
    ).toBe('EXC-20260709-000001');
  });
});
