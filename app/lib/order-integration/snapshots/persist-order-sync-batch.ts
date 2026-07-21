import { formatExcloadOrderNoDateKey } from '@/app/lib/order-integration/snapshots/excload-order-no';
import { computeOrderSyncSnapshotExpiresAt } from '@/app/lib/order-integration/snapshots/order-sync-snapshot-retention';
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

function normalizeLineIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean).sort();
}

export function buildSnapshotDedupeKey(input: {
  mallOrderNo: string;
  mallLineItemIds?: unknown;
}): string {
  const lineIds = normalizeLineIds(input.mallLineItemIds);
  return `${input.mallOrderNo.trim()}::${lineIds.join('|')}`;
}

function mapSnapshotFieldsForWrite(
  snapshot: OrderSyncOrderSnapshotForPersist,
  downloadedAt: Date,
  expiresAt: Date,
) {
  return {
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
    lastCourierDownloadAt: downloadedAt,
    expiresAt,
    // 재다운로드 시 매칭용 PII를 다시 채우므로 삭제 표시 해제
    piiClearedAt: null,
  };
}

/**
 * snapshot DTO 배열을 OrderSyncBatch / OrderSyncOrder로 저장합니다.
 * 동일 주문키는 insert 스킵이 아니라 upsert(필드·expiresAt 갱신)합니다.
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
  const expiresAt = computeOrderSyncSnapshotExpiresAt(fetchedAt);
  const snapshots = [...input.snapshots];

  return client.$transaction(async (tx) => {
    const seenInThisBatch = new Set<string>();
    const uniqueSnapshots: OrderSyncOrderSnapshotForPersist[] = [];
    for (const snapshot of snapshots) {
      const key = buildSnapshotDedupeKey({
        mallOrderNo: snapshot.mallOrderNo,
        mallLineItemIds: snapshot.mallLineItemIds,
      });
      if (seenInThisBatch.has(key)) continue;
      seenInThisBatch.add(key);
      uniqueSnapshots.push(snapshot);
    }

    const mallOrderNos = [
      ...new Set(uniqueSnapshots.map((s) => s.mallOrderNo.trim()).filter(Boolean)),
    ];
    const existingRows =
      mallOrderNos.length > 0 && tx.orderSyncOrder.findMany
        ? await tx.orderSyncOrder.findMany({
            where: {
              userId: input.userId,
              provider: input.provider,
              integrationAccountId: input.integrationAccountId ?? null,
              mallOrderNo: { in: mallOrderNos },
            },
            select: {
              id: true,
              mallOrderNo: true,
              mallLineItemIds: true,
              excloadOrderNo: true,
              transmissionStatus: true,
              piiClearedAt: true,
            },
          })
        : [];

    const existingByKey = new Map(
      existingRows.map((row) => [
        buildSnapshotDedupeKey({
          mallOrderNo: row.mallOrderNo,
          mallLineItemIds: row.mallLineItemIds,
        }),
        row,
      ]),
    );

    const toCreate: OrderSyncOrderSnapshotForPersist[] = [];
    const toUpdate: Array<{
      id: string;
      excloadOrderNo: string;
      snapshot: OrderSyncOrderSnapshotForPersist;
      lockPii: boolean;
    }> = [];

    for (const snapshot of uniqueSnapshots) {
      const key = buildSnapshotDedupeKey({
        mallOrderNo: snapshot.mallOrderNo,
        mallLineItemIds: snapshot.mallLineItemIds,
      });
      const existing = existingByKey.get(key);
      if (existing) {
        const status = String(existing.transmissionStatus ?? 'NONE');
        const lockPii =
          status === 'SENT' ||
          status === 'PROCESSING' ||
          existing.piiClearedAt != null;
        toUpdate.push({
          id: existing.id!,
          excloadOrderNo: existing.excloadOrderNo!,
          snapshot,
          lockPii,
        });
      } else {
        toCreate.push(snapshot);
      }
    }

    const dateKey = formatExcloadOrderNoDateKey(fetchedAt);
    const excloadOrderNos =
      toCreate.length > 0
        ? await reserveExcloadOrderNos(tx, { dateKey, count: toCreate.length })
        : [];

    const batch = await tx.orderSyncBatch.create({
      data: {
        userId: input.userId,
        provider: input.provider,
        integrationAccountId: input.integrationAccountId ?? null,
        sourceType: input.sourceType ?? 'API',
        fetchedAt,
        orderCount: toCreate.length + toUpdate.length,
        status: 'ACTIVE',
        memo: input.memo ?? null,
        errorMessage: null,
      },
    });

    const orders = [];
    const issuedExcloadOrderNos: string[] = [];

    for (const item of toUpdate) {
      if (!tx.orderSyncOrder.update) {
        throw new Error('orderSyncOrder.update is required for snapshot upsert');
      }
      const data = item.lockPii
        ? {
            // 전송 완료·PII 삭제된 주문: TTL만 연장, PII·전송상태 복원 금지
            lastCourierDownloadAt: fetchedAt,
            expiresAt,
            batchId: batch.id,
          }
        : {
            ...mapSnapshotFieldsForWrite(item.snapshot, fetchedAt, expiresAt),
            batchId: batch.id,
            integrationAccountId: input.integrationAccountId ?? item.snapshot.accountId ?? null,
          };
      const order = await tx.orderSyncOrder.update({
        where: { id: item.id },
        data,
      });
      orders.push(order);
      issuedExcloadOrderNos.push(item.excloadOrderNo);
    }

    for (let index = 0; index < toCreate.length; index++) {
      const snapshot = toCreate[index]!;
      const excloadOrderNo = excloadOrderNos[index]!;
      const order = await tx.orderSyncOrder.create({
        data: {
          batchId: batch.id,
          userId: input.userId,
          provider: input.provider,
          integrationAccountId: input.integrationAccountId ?? snapshot.accountId ?? null,
          excloadOrderNo,
          ...mapSnapshotFieldsForWrite(snapshot, fetchedAt, expiresAt),
          transmissionStatus: 'NONE' as const,
        },
      });
      orders.push(order);
      issuedExcloadOrderNos.push(excloadOrderNo);
    }

    return {
      batch,
      orders,
      excloadOrderNos: issuedExcloadOrderNos,
    };
  });
}
