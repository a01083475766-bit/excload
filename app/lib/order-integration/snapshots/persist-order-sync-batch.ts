import { formatExcloadOrderNoDateKey } from '@/app/lib/order-integration/snapshots/excload-order-no';
import { reserveExcloadOrderNos } from '@/app/lib/order-integration/snapshots/reserve-excload-order-nos';
import type {
  OrderSyncOrderSnapshotForPersist,
  OrderSyncPersistPrismaClient,
  PersistOrderSyncBatchInput,
  PersistOrderSyncBatchResult,
} from '@/app/lib/order-integration/snapshots/types';

function parseOrderedAt(value?: string | null): Date | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toFetchedAt(value: Date | string): Date {
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('fetchedAt을 Date로 변환할 수 없습니다.');
  }
  return parsed;
}

function mapSnapshotToOrderCreateData(input: {
  batchId: string;
  snapshot: OrderSyncOrderSnapshotForPersist;
  excloadOrderNo: string;
  userId: string;
  provider: PersistOrderSyncBatchInput['provider'];
  integrationAccountId?: string | null;
}) {
  const { snapshot, batchId, excloadOrderNo, userId, provider, integrationAccountId } = input;

  return {
    batchId,
    userId,
    provider,
    integrationAccountId: integrationAccountId ?? snapshot.accountId ?? null,
    excloadOrderNo,
    mallOrderNo: snapshot.mallOrderNo,
    mallOrderId: snapshot.mallOrderId ?? null,
    mallLineItemIds: snapshot.mallLineItemIds ?? undefined,
    receiverName: snapshot.receiverName,
    receiverPhone: snapshot.receiverPhone,
    receiverAddress: snapshot.receiverAddress,
    productSummary: snapshot.productSummary,
    quantity: snapshot.quantity,
    deliveryMemo: snapshot.deliveryMemo ?? null,
    orderedAt: parseOrderedAt(snapshot.orderedAt),
    orderStatus: snapshot.orderStatus ?? null,
    rawPayloadJson: snapshot.rawPayloadJson ?? undefined,
    normalizedPayloadJson: snapshot.normalizedPayloadJson,
    trackingNumber: snapshot.trackingNumber ?? null,
    transmissionStatus: 'NONE' as const,
  };
}

/**
 * snapshot DTO 배열을 OrderSyncBatch / OrderSyncOrder로 저장합니다.
 *
 * 빈 snapshots 정책:
 * - batch는 생성하고 orderCount=0, orders=[]를 반환합니다.
 * - EXC 번호는 발급하지 않습니다.
 */
export async function persistOrderSyncBatch(
  client: OrderSyncPersistPrismaClient,
  input: PersistOrderSyncBatchInput,
): Promise<PersistOrderSyncBatchResult> {
  const fetchedAt = toFetchedAt(input.fetchedAt);
  const snapshots = input.snapshots;
  const orderCount = snapshots.length;

  return client.$transaction(async (tx) => {
    const dateKey = formatExcloadOrderNoDateKey(fetchedAt);
    const excloadOrderNos =
      orderCount > 0
        ? await reserveExcloadOrderNos(tx, { dateKey, count: orderCount })
        : [];

    const batch = await tx.orderSyncBatch.create({
      data: {
        userId: input.userId,
        provider: input.provider,
        integrationAccountId: input.integrationAccountId ?? null,
        sourceType: input.sourceType ?? 'API',
        fetchedAt,
        orderCount,
        status: 'ACTIVE',
        memo: input.memo ?? null,
        errorMessage: null,
      },
    });

    const orders = [];
    for (let index = 0; index < snapshots.length; index++) {
      const snapshot = snapshots[index]!;
      const order = await tx.orderSyncOrder.create({
        data: mapSnapshotToOrderCreateData({
          batchId: batch.id,
          snapshot,
          excloadOrderNo: excloadOrderNos[index]!,
          userId: input.userId,
          provider: input.provider,
          integrationAccountId: input.integrationAccountId,
        }),
      });
      orders.push(order);
    }

    return {
      batch,
      orders,
      excloadOrderNos,
    };
  });
}
