import {
  OrderIntegrationProvider,
  OrderSyncTransmissionStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
  buildLoadOrderSyncSnapshotsForMatchingWhere,
  loadOrderSyncSnapshotsForMatching,
} from '@/app/lib/order-integration/snapshots/load-order-sync-snapshots-for-matching';
import type {
  OrderSyncSnapshotLoadClient,
  PersistedOrderSyncOrderLike,
} from '@/app/lib/order-integration/snapshots/types';
import { DEFAULT_LOAD_ORDER_SYNC_SNAPSHOTS_FOR_MATCHING_LIMIT } from '@/app/lib/order-integration/snapshots/types';

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
    transmissionStatus: OrderSyncTransmissionStatus.NONE,
    createdAt: new Date('2026-07-09T00:00:00.000Z'),
    updatedAt: new Date('2026-07-09T00:00:00.000Z'),
    ...overrides,
  };
}

function createMockClient(orders: PersistedOrderSyncOrderLike[] = []) {
  const findMany = vi.fn(async () => orders);
  const client: OrderSyncSnapshotLoadClient = {
    orderSyncOrder: { findMany },
  };
  return { client, findMany };
}

describe('buildLoadOrderSyncSnapshotsForMatchingWhere', () => {
  const now = new Date('2026-07-21T00:00:00.000Z');
  const notExpired = {
    OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
  };

  it('always includes userId and non-expired filter', () => {
    expect(
      buildLoadOrderSyncSnapshotsForMatchingWhere({ userId: 'user-a', now }),
    ).toEqual({ userId: 'user-a', ...notExpired });
  });

  it('narrows by provider when provided', () => {
    expect(
      buildLoadOrderSyncSnapshotsForMatchingWhere({
        userId: 'user-a',
        provider: OrderIntegrationProvider.COUPANG,
        now,
      }),
    ).toEqual({
      userId: 'user-a',
      provider: OrderIntegrationProvider.COUPANG,
      ...notExpired,
    });
  });

  it('narrows by integrationAccountId when provided', () => {
    expect(
      buildLoadOrderSyncSnapshotsForMatchingWhere({
        userId: 'user-a',
        integrationAccountId: 'acc-1',
        now,
      }),
    ).toEqual({
      userId: 'user-a',
      integrationAccountId: 'acc-1',
      ...notExpired,
    });
  });

  it('narrows by batchId when provided', () => {
    expect(
      buildLoadOrderSyncSnapshotsForMatchingWhere({
        userId: 'user-a',
        batchId: 'batch-9',
        now,
      }),
    ).toEqual({
      userId: 'user-a',
      batchId: 'batch-9',
      ...notExpired,
    });
  });

  it('throws when userId is missing', () => {
    expect(() => buildLoadOrderSyncSnapshotsForMatchingWhere({ userId: '' })).toThrow(
      'userId는 필수입니다.',
    );
  });
});

describe('loadOrderSyncSnapshotsForMatching', () => {
  it('queries with userId, expiry filter, and default limit', async () => {
    const { client, findMany } = createMockClient([buildPersistedOrder()]);
    const now = new Date('2026-07-21T00:00:00.000Z');

    await loadOrderSyncSnapshotsForMatching(client, { userId: 'user-a', now });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-a',
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      orderBy: { createdAt: 'desc' },
      take: DEFAULT_LOAD_ORDER_SYNC_SNAPSHOTS_FOR_MATCHING_LIMIT,
    });
  });

  it('applies optional filters and custom limit', async () => {
    const { client, findMany } = createMockClient([]);
    const now = new Date('2026-07-21T00:00:00.000Z');

    await loadOrderSyncSnapshotsForMatching(client, {
      userId: 'user-a',
      provider: OrderIntegrationProvider.SMARTSTORE,
      integrationAccountId: 'acc-1',
      batchId: 'batch-1',
      limit: 25,
      now,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-a',
        provider: OrderIntegrationProvider.SMARTSTORE,
        integrationAccountId: 'acc-1',
        batchId: 'batch-1',
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
  });

  it('maps DB rows to matching DTOs', async () => {
    const { client } = createMockClient([
      buildPersistedOrder({
        orderStatus: '취소완료',
        trackingNumber: '9999888877',
      }),
    ]);

    const snapshots = await loadOrderSyncSnapshotsForMatching(client, {
      userId: 'user-a',
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.existingTrackingNumber).toBe('9999888877');
    expect(snapshots[0]?.orderStatus).toBe('취소완료');
    expect(snapshots[0]?.accountId).toBe('acc-1');
  });

  it('returns an empty array when no rows exist', async () => {
    const { client } = createMockClient([]);

    const snapshots = await loadOrderSyncSnapshotsForMatching(client, {
      userId: 'user-a',
    });

    expect(snapshots).toEqual([]);
  });

  it('throws when userId is missing', async () => {
    const { client } = createMockClient([]);

    await expect(loadOrderSyncSnapshotsForMatching(client, { userId: '' })).rejects.toThrow(
      'userId는 필수입니다.',
    );
  });
});
