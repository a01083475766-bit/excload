import { OrderIntegrationProvider } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  toOrderSyncSnapshot,
  toOrderSyncSnapshots,
} from '@/app/lib/order-integration/snapshots/to-order-sync-snapshot';
import type { PersistedOrderSyncOrderLike } from '@/app/lib/order-integration/snapshots/types';

function buildPersistedOrder(
  overrides: Partial<PersistedOrderSyncOrderLike> = {},
): PersistedOrderSyncOrderLike {
  return {
    id: 'order-1',
    batchId: 'batch-1',
    userId: 'user-a',
    provider: OrderIntegrationProvider.SMARTSTORE,
    integrationAccountId: 'acc-1',
    excloadOrderNo: 'EXC-20260709-000001',
    mallOrderNo: 'ORD-1001',
    mallOrderId: 'ORD-1001',
    mallLineItemIds: ['PO-1'],
    receiverName: '홍길동',
    receiverPhone: '010-1234-5678',
    receiverAddress: '서울시 강남구',
    productSummary: '반팔티 x1',
    quantity: 1,
    deliveryMemo: '문 앞',
    orderedAt: new Date('2026-07-09T01:00:00.000Z'),
    orderStatus: '결제완료',
    rawPayloadJson: { source: 'test' },
    normalizedPayloadJson: { mallLineItemIds: ['PO-1'] },
    trackingNumber: '1234567890',
    carrierCode: null,
    shippedAt: null,
    transmissionStatus: 'NONE',
    createdAt: new Date('2026-07-09T00:00:00.000Z'),
    updatedAt: new Date('2026-07-09T00:00:00.000Z'),
    ...overrides,
  };
}

describe('toOrderSyncSnapshot', () => {
  it('maps persisted order fields to matching DTO', () => {
    const snapshot = toOrderSyncSnapshot(buildPersistedOrder());

    expect(snapshot.id).toBe('order-1');
    expect(snapshot.userId).toBe('user-a');
    expect(snapshot.provider).toBe('SMARTSTORE');
    expect(snapshot.accountId).toBe('acc-1');
    expect(snapshot.batchId).toBe('batch-1');
    expect(snapshot.excloadOrderNo).toBe('EXC-20260709-000001');
    expect(snapshot.mallOrderNo).toBe('ORD-1001');
    expect(snapshot.receiverName).toBe('홍길동');
    expect(snapshot.productSummary).toBe('반팔티 x1');
    expect(snapshot.existingTrackingNumber).toBe('1234567890');
    expect(snapshot.exportedRowIndex).toBeNull();
  });

  it('preserves cancelled order status for matching layer', () => {
    const snapshot = toOrderSyncSnapshot(
      buildPersistedOrder({ orderStatus: '취소완료', trackingNumber: null }),
    );

    expect(snapshot.orderStatus).toBe('취소완료');
    expect(snapshot.existingTrackingNumber).toBeNull();
  });
});

describe('toOrderSyncSnapshots', () => {
  it('maps multiple persisted orders', () => {
    const snapshots = toOrderSyncSnapshots([
      buildPersistedOrder({ id: 'order-1' }),
      buildPersistedOrder({ id: 'order-2', mallOrderNo: 'ORD-1002' }),
    ]);

    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]?.mallOrderNo).toBe('ORD-1002');
  });
});
