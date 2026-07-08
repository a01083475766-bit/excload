import { OrderIntegrationProvider } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildOrderSyncSnapshots } from '@/app/lib/order-integration/snapshots/build-order-sync-snapshots';
import { persistOrderSyncBatch } from '@/app/lib/order-integration/snapshots/persist-order-sync-batch';
import {
  buildExcloadOrderNoRange,
  reserveExcloadOrderNos,
} from '@/app/lib/order-integration/snapshots/reserve-excload-order-nos';
import type { OrderSyncPersistTransactionClient } from '@/app/lib/order-integration/snapshots/types';

function createSequenceStore() {
  return new Map<string, number>();
}

function createMockTransactionClient(sequenceStore: Map<string, number>) {
  const orderCreates: Array<Record<string, unknown>> = [];

  const tx: OrderSyncPersistTransactionClient = {
    excloadOrderNoSequence: {
      upsert: vi.fn(async ({ where, create, update }) => {
        const existing = sequenceStore.get(where.dateKey);
        if (existing === undefined) {
          sequenceStore.set(where.dateKey, create.lastNumber);
          return { dateKey: where.dateKey, lastNumber: create.lastNumber };
        }

        const next = existing + update.lastNumber.increment;
        sequenceStore.set(where.dateKey, next);
        return { dateKey: where.dateKey, lastNumber: next };
      }),
    },
    orderSyncBatch: {
      create: vi.fn(async ({ data }) => ({
        id: 'batch-1',
        userId: data.userId as string,
        provider: data.provider as OrderIntegrationProvider,
        integrationAccountId: (data.integrationAccountId as string | null) ?? null,
        sourceType: data.sourceType as 'API',
        fetchedAt: data.fetchedAt as Date,
        orderCount: data.orderCount as number,
        status: 'ACTIVE',
        memo: (data.memo as string | null) ?? null,
        errorMessage: null,
        createdAt: new Date('2026-07-09T00:00:00.000Z'),
        updatedAt: new Date('2026-07-09T00:00:00.000Z'),
      })),
    },
    orderSyncOrder: {
      create: vi.fn(async ({ data }) => {
        orderCreates.push(data);
        return {
          id: `order-${orderCreates.length}`,
          batchId: data.batchId as string,
          userId: data.userId as string,
          provider: data.provider as OrderIntegrationProvider,
          integrationAccountId: (data.integrationAccountId as string | null) ?? null,
          excloadOrderNo: data.excloadOrderNo as string,
          mallOrderNo: data.mallOrderNo as string,
          mallOrderId: (data.mallOrderId as string | null) ?? null,
          mallLineItemIds: data.mallLineItemIds ?? null,
          receiverName: (data.receiverName as string | null) ?? null,
          receiverPhone: (data.receiverPhone as string | null) ?? null,
          receiverAddress: (data.receiverAddress as string | null) ?? null,
          productSummary: (data.productSummary as string | null) ?? null,
          quantity: (data.quantity as number | null) ?? null,
          deliveryMemo: (data.deliveryMemo as string | null) ?? null,
          orderedAt: (data.orderedAt as Date | null) ?? null,
          orderStatus: (data.orderStatus as string | null) ?? null,
          rawPayloadJson: data.rawPayloadJson ?? null,
          normalizedPayloadJson: data.normalizedPayloadJson ?? null,
          trackingNumber: (data.trackingNumber as string | null) ?? null,
          carrierCode: null,
          shippedAt: null,
          transmissionStatus: 'NONE',
          createdAt: new Date('2026-07-09T00:00:00.000Z'),
          updatedAt: new Date('2026-07-09T00:00:00.000Z'),
        };
      }),
    },
  };

  return { tx, orderCreates };
}

function buildSnapshots(count = 2) {
  return buildOrderSyncSnapshots({
    userId: 'user-a',
    provider: 'SMARTSTORE',
    accountId: 'acc-1',
    fetchedAt: '2026-07-09T00:00:00.000Z',
    rows: Array.from({ length: count }, (_, index) => ({
      주문번호: `ORD-${index + 1}`,
      상품주문번호: `PO-${index + 1}`,
      받는사람: `수취인${index + 1}`,
      받는사람전화1: `010-1111-222${index}`,
      받는사람주소1: `서울시 테스트구 ${index + 1}`,
      상품명: `상품${index + 1}`,
      수량: '1',
      주문상태: index === 1 ? '취소완료' : '결제완료',
      결제일시: '2026-07-09 10:00:00',
      배송메시지: '문 앞',
    })),
  });
}

describe('buildExcloadOrderNoRange', () => {
  it('returns consecutive EXC numbers', () => {
    expect(
      buildExcloadOrderNoRange({ dateKey: '20260709', startSequence: 1, count: 3 }),
    ).toEqual([
      'EXC-20260709-000001',
      'EXC-20260709-000002',
      'EXC-20260709-000003',
    ]);
  });
});

describe('reserveExcloadOrderNos', () => {
  let sequenceStore: Map<string, number>;

  beforeEach(() => {
    sequenceStore = createSequenceStore();
  });

  it('starts from 1 when dateKey sequence does not exist', async () => {
    const { tx } = createMockTransactionClient(sequenceStore);

    const numbers = await reserveExcloadOrderNos(tx, {
      dateKey: '20260709',
      count: 3,
    });

    expect(numbers).toEqual([
      'EXC-20260709-000001',
      'EXC-20260709-000002',
      'EXC-20260709-000003',
    ]);
  });

  it('continues from the next number when dateKey sequence already exists', async () => {
    const { tx } = createMockTransactionClient(sequenceStore);
    sequenceStore.set('20260709', 5);

    const numbers = await reserveExcloadOrderNos(tx, {
      dateKey: '20260709',
      count: 2,
    });

    expect(numbers).toEqual(['EXC-20260709-000006', 'EXC-20260709-000007']);
  });
});

describe('persistOrderSyncBatch', () => {
  let sequenceStore: Map<string, number>;

  beforeEach(() => {
    sequenceStore = createSequenceStore();
  });

  it('persists one batch and multiple orders with DB-issued EXC numbers', async () => {
    const { tx, orderCreates } = createMockTransactionClient(sequenceStore);
    const client = {
      $transaction: async <T>(fn: (innerTx: OrderSyncPersistTransactionClient) => Promise<T>) =>
        fn(tx),
    };

    const snapshots = buildSnapshots(2);
    const result = await persistOrderSyncBatch(client, {
      userId: 'user-a',
      provider: OrderIntegrationProvider.SMARTSTORE,
      integrationAccountId: 'acc-1',
      fetchedAt: '2026-07-09T00:00:00.000Z',
      snapshots,
    });

    expect(result.batch.orderCount).toBe(2);
    expect(result.orders).toHaveLength(2);
    expect(result.excloadOrderNos).toEqual([
      'EXC-20260709-000001',
      'EXC-20260709-000002',
    ]);
    expect(result.orders[0]?.excloadOrderNo).toBe('EXC-20260709-000001');
    expect(result.orders[1]?.excloadOrderNo).toBe('EXC-20260709-000002');
    expect(orderCreates[0]?.userId).toBe('user-a');
    expect(orderCreates[0]?.provider).toBe('SMARTSTORE');
    expect(orderCreates[0]?.integrationAccountId).toBe('acc-1');
    expect(orderCreates[0]?.mallLineItemIds).toEqual(['PO-1']);
    expect(orderCreates[0]?.normalizedPayloadJson).toEqual({
      mallLineItemIds: ['PO-1'],
    });
  });

  it('ignores temporary snapshot excloadOrderNo and uses DB sequence values', async () => {
    const { tx } = createMockTransactionClient(sequenceStore);
    const client = {
      $transaction: async <T>(fn: (innerTx: OrderSyncPersistTransactionClient) => Promise<T>) =>
        fn(tx),
    };

    const snapshots = buildSnapshots(1).map((snapshot) => ({
      ...snapshot,
      excloadOrderNo: 'EXC-TEST-999999',
    }));

    const result = await persistOrderSyncBatch(client, {
      userId: 'user-a',
      provider: OrderIntegrationProvider.SMARTSTORE,
      integrationAccountId: 'acc-1',
      fetchedAt: '2026-07-09T00:00:00.000Z',
      snapshots,
    });

    expect(result.orders[0]?.excloadOrderNo).toBe('EXC-20260709-000001');
    expect(result.orders[0]?.excloadOrderNo).not.toBe('EXC-TEST-999999');
  });

  it('creates an empty batch when snapshots are empty', async () => {
    const { tx } = createMockTransactionClient(sequenceStore);
    const client = {
      $transaction: async <T>(fn: (innerTx: OrderSyncPersistTransactionClient) => Promise<T>) =>
        fn(tx),
    };

    const result = await persistOrderSyncBatch(client, {
      userId: 'user-a',
      provider: OrderIntegrationProvider.SMARTSTORE,
      integrationAccountId: 'acc-1',
      fetchedAt: '2026-07-09T00:00:00.000Z',
      snapshots: [],
    });

    expect(result.batch.orderCount).toBe(0);
    expect(result.orders).toEqual([]);
    expect(result.excloadOrderNos).toEqual([]);
    expect(tx.excloadOrderNoSequence.upsert).not.toHaveBeenCalled();
  });
});
