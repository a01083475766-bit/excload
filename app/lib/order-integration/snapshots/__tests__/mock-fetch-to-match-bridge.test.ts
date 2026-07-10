import { OrderIntegrationProvider, OrderSyncTransmissionStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  matchShipmentRow,
  scoreShipmentOrderPair,
} from '@/app/lib/order-integration/shipments/match-shipment-row';
import { normalizeShipmentRow } from '@/app/lib/order-integration/shipments/normalize-shipment-row';
import { buildOrderSyncSnapshots } from '@/app/lib/order-integration/snapshots/build-order-sync-snapshots';
import { toOrderSyncSnapshot } from '@/app/lib/order-integration/snapshots/to-order-sync-snapshot';
import type {
  OrderSyncOrderSnapshotForPersist,
  PersistedOrderSyncOrderLike,
} from '@/app/lib/order-integration/snapshots/types';

/**
 * mock fetch-orders 성공 결과(orderStandardFile.rows) → snapshot → D-4 매칭 입력 bridge.
 * 외부 API·실 DB 없이 in-memory만 사용합니다.
 */
const MOCK_FETCH_ROWS: Record<string, string>[] = [
  {
    주문번호: 'BRIDGE-ORD-1001',
    상품주문번호: 'PO-BRIDGE-1',
    받는사람: '홍길동',
    받는사람전화1: '010-1234-5678',
    받는사람주소1: '서울시 강남구 테헤란로 123',
    상품명: '반팔티',
    수량: '1',
    주문상태: '결제완료',
    결제일시: '2026-07-09 10:00:00',
  },
  {
    주문번호: 'BRIDGE-ORD-1001',
    상품주문번호: 'PO-BRIDGE-2',
    받는사람: '홍길동',
    받는사람전화1: '010-1234-5678',
    받는사람주소1: '서울시 강남구 테헤란로 123',
    상품명: '바지',
    수량: '1',
    주문상태: '결제완료',
    결제일시: '2026-07-09 10:00:00',
  },
];

function asPersistedOrder(
  snapshot: OrderSyncOrderSnapshotForPersist,
  overrides: Partial<PersistedOrderSyncOrderLike> = {},
): PersistedOrderSyncOrderLike {
  return {
    id: 'order-bridge-1',
    batchId: snapshot.batchId ?? 'batch-bridge-1',
    userId: snapshot.userId,
    provider: snapshot.provider as OrderIntegrationProvider,
    integrationAccountId: snapshot.accountId ?? null,
    excloadOrderNo: snapshot.excloadOrderNo,
    mallOrderNo: snapshot.mallOrderNo,
    mallOrderId: snapshot.mallOrderId ?? null,
    mallLineItemIds: snapshot.mallLineItemIds ?? [],
    receiverName: snapshot.receiverName,
    receiverPhone: snapshot.receiverPhone,
    receiverAddress: snapshot.receiverAddress,
    productSummary: snapshot.productSummary,
    quantity: snapshot.quantity,
    deliveryMemo: snapshot.deliveryMemo ?? null,
    orderedAt: null,
    orderStatus: snapshot.orderStatus ?? null,
    rawPayloadJson: snapshot.rawPayloadJson ?? null,
    normalizedPayloadJson: snapshot.normalizedPayloadJson,
    trackingNumber: snapshot.trackingNumber ?? null,
    carrierCode: null,
    shippedAt: null,
    transmissionStatus: OrderSyncTransmissionStatus.NONE,
    createdAt: new Date('2026-07-09T00:00:00.000Z'),
    updatedAt: new Date('2026-07-09T00:00:00.000Z'),
    ...overrides,
  };
}

describe('mock fetch → snapshot → shipment match bridge', () => {
  it('carries mallOrderNo / receiverPhone / receiverName into D-4 matching', () => {
    const persistSnapshots = buildOrderSyncSnapshots({
      userId: 'user-bridge',
      provider: OrderIntegrationProvider.COUPANG,
      accountId: 'acc-bridge-1',
      batchId: 'batch-bridge-1',
      fetchedAt: '2026-07-09T00:00:00.000Z',
      excloadOrderNoStartSeq: 1,
      rows: MOCK_FETCH_ROWS,
    });

    expect(persistSnapshots).toHaveLength(1);
    const persistSnapshot = persistSnapshots[0]!;
    expect(persistSnapshot.mallOrderNo).toBe('BRIDGE-ORD-1001');
    expect(persistSnapshot.receiverName).toBe('홍길동');
    expect(persistSnapshot.receiverPhone).toBe('010-1234-5678');
    expect(persistSnapshot.productSummary).toBe('반팔티 x1 / 바지 x1');

    // loadOrderSyncSnapshotsForMatching → toOrderSyncSnapshot 과 동일한 변환
    const matchingOrder = toOrderSyncSnapshot(asPersistedOrder(persistSnapshot));

    expect(matchingOrder.mallOrderNo).toBe(persistSnapshot.mallOrderNo);
    expect(matchingOrder.receiverName).toBe(persistSnapshot.receiverName);
    expect(matchingOrder.receiverPhone).toBe(persistSnapshot.receiverPhone);
    expect(matchingOrder.excloadOrderNo).toBe(persistSnapshot.excloadOrderNo);
    expect(matchingOrder.accountId).toBe('acc-bridge-1');

    const shipment = normalizeShipmentRow({
      originalRowIndex: 0,
      rawRow: {
        송장번호: '012345678901',
        주문번호: 'BRIDGE-ORD-1001',
        받는분성명: '홍길동',
        받는분전화번호: '01012345678',
        택배사: 'CJ대한통운',
      },
    });

    const score = scoreShipmentOrderPair(shipment, matchingOrder);
    expect(score.reasons).toEqual(
      expect.arrayContaining(['mallOrderNo', 'phone', 'receiverName']),
    );

    const match = matchShipmentRow({
      shipment,
      orders: [matchingOrder],
      scope: { userId: 'user-bridge', provider: 'COUPANG', accountId: 'acc-bridge-1' },
    });

    expect(match.matchStatus).toBe('MATCHED_CONFIDENT');
    expect(match.matchedOrderId).toBe('order-bridge-1');
    expect(match.mismatchFields).toEqual([]);
  });
});
