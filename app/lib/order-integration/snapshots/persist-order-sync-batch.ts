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

function normalizeLineIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean).sort();
}

function buildSnapshotDedupeKey(input: {
  mallOrderNo: string;
  mallLineItemIds?: unknown;
}): string {
  const lineIds = normalizeLineIds(input.mallLineItemIds);
  return `${input.mallOrderNo.trim()}::${lineIds.join('|')}`;
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
  const snapshots = [...input.snapshots];

  return client.$transaction(async (tx) => {
    const mallOrderNos = [...new Set(snapshots.map((s) => s.mallOrderNo.trim()).filter(Boolean))];
    const existingRows =
      mallOrderNos.length > 0 && tx.orderSyncOrder.findMany
        ? await tx.orderSyncOrder.findMany({
            where: {
              userId: input.userId,
              provider: input.provider,
              integrationAccountId: input.integrationAccountId ?? null,
              mallOrderNo: { in: mallOrderNos },
            },
            select: { mallOrderNo: true, mallLineItemIds: true },
          })
        : [];
    const existingKeys = new Set(
      existingRows.map((row) =>
        buildSnapshotDedupeKey({
          mallOrderNo: row.mallOrderNo,
          mallLineItemIds: row.mallLineItemIds,
        }),
      ),
    );
    const seenInThisBatch = new Set<string>();
    const dedupedSnapshots = snapshots.filter((snapshot) => {
      const key = buildSnapshotDedupeKey({
        mallOrderNo: snapshot.mallOrderNo,
        mallLineItemIds: snapshot.mallLineItemIds,
      });
      if (existingKeys.has(key) || seenInThisBatch.has(key)) return false;
      seenInThisBatch.add(key);
      return true;
    });
    const dedupedOrderCount = dedupedSnapshots.length;
    const dateKey = formatExcloadOrderNoDateKey(fetchedAt);
    const excloadOrderNos =
      dedupedOrderCount > 0
        ? await reserveExcloadOrderNos(tx, { dateKey, count: dedupedOrderCount })
        : [];

    const batch = await tx.orderSyncBatch.create({
      data: {
        userId: input.userId,
        provider: input.provider,
        integrationAccountId: input.integrationAccountId ?? null,
        sourceType: input.sourceType ?? 'API',
        fetchedAt,
        orderCount: dedupedOrderCount,
        status: 'ACTIVE',
        memo: input.memo ?? null,
        errorMessage: null,
      },
    });

    const orders = [];
    for (let index = 0; index < dedupedSnapshots.length; index++) {
      const snapshot = dedupedSnapshots[index]!;
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
