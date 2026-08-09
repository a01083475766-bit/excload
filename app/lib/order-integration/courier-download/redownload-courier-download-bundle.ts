/**
 * 택배양식 Bundle → OrderSyncOrder 스냅샷 기반 재다운로드 행.
 * PII가 삭제됐거나 주문이 없으면 해당 행은 제외하고 사유를 반환한다.
 */

import type { PrismaClient } from '@prisma/client';

import { buildCourierExportRowFromSnapshot } from '@/app/lib/order-integration/snapshots/build-order-preview-display';
import type { OrderSyncOrderSnapshotForPersist } from '@/app/lib/order-integration/snapshots/types';

export type CourierDownloadRedownloadClient = Pick<PrismaClient, 'courierDownloadBundle'>;

export type BuildCourierDownloadRedownloadResult =
  | {
      ok: true;
      bundleId: string;
      fileStem: string;
      rows: Record<string, string>[];
      exportedCount: number;
      skippedPiiCleared: number;
      skippedMissingOrder: number;
    }
  | { ok: false; reason: 'NOT_FOUND' | 'NO_EXPORTABLE_ROWS'; message: string };

function asTrimmed(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function formatFileStem(createdAt: Date, rowCount: number): string {
  const y = createdAt.getFullYear();
  const m = String(createdAt.getMonth() + 1).padStart(2, '0');
  const d = String(createdAt.getDate()).padStart(2, '0');
  const hh = String(createdAt.getHours()).padStart(2, '0');
  const mi = String(createdAt.getMinutes()).padStart(2, '0');
  return `엑클로드주문연동_${y}${m}${d}_${hh}${mi}_${rowCount}건`;
}

function toExportSnapshot(order: {
  provider: OrderSyncOrderSnapshotForPersist['provider'];
  integrationAccountId: string | null;
  excloadOrderNo: string;
  mallOrderNo: string;
  receiverName: string | null;
  receiverPhone: string | null;
  receiverAddress: string | null;
  productSummary: string | null;
  quantity: number;
  deliveryMemo: string | null;
  trackingNumber: string | null;
}): OrderSyncOrderSnapshotForPersist {
  return {
    userId: '',
    provider: order.provider,
    accountId: order.integrationAccountId,
    fetchedAt: '',
    excloadOrderNo: order.excloadOrderNo,
    mallOrderNo: order.mallOrderNo,
    receiverName: order.receiverName ?? '',
    receiverPhone: order.receiverPhone ?? '',
    receiverAddress: order.receiverAddress ?? '',
    productSummary: order.productSummary ?? '',
    quantity: order.quantity ?? 1,
    deliveryMemo: order.deliveryMemo,
    trackingNumber: order.trackingNumber,
    normalizedPayloadJson: {},
  };
}

export async function buildCourierDownloadRedownloadRows(
  client: CourierDownloadRedownloadClient,
  input: { userId: string; bundleId: string; now?: Date },
): Promise<BuildCourierDownloadRedownloadResult> {
  const userId = input.userId.trim();
  const bundleId = input.bundleId.trim();
  if (!userId || !bundleId) {
    return { ok: false, reason: 'NOT_FOUND', message: '다운로드 기록을 찾을 수 없습니다.' };
  }

  const now = input.now ?? new Date();
  const bundle = await client.courierDownloadBundle.findFirst({
    where: {
      id: bundleId,
      userId,
      expiresAt: { gte: now },
    },
    select: {
      id: true,
      createdAt: true,
      rowCount: true,
      workItems: {
        select: {
          mallOrderNo: true,
          orderSyncOrder: {
            select: {
              provider: true,
              integrationAccountId: true,
              excloadOrderNo: true,
              mallOrderNo: true,
              receiverName: true,
              receiverPhone: true,
              receiverAddress: true,
              productSummary: true,
              quantity: true,
              deliveryMemo: true,
              trackingNumber: true,
              piiClearedAt: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!bundle) {
    return { ok: false, reason: 'NOT_FOUND', message: '다운로드 기록을 찾을 수 없거나 만료되었습니다.' };
  }

  const rows: Record<string, string>[] = [];
  let skippedPiiCleared = 0;
  let skippedMissingOrder = 0;

  for (const item of bundle.workItems) {
    const order = item.orderSyncOrder;
    if (!order) {
      skippedMissingOrder += 1;
      continue;
    }
    if (order.piiClearedAt != null) {
      skippedPiiCleared += 1;
      continue;
    }
    if (!asTrimmed(order.receiverName) && !asTrimmed(order.receiverAddress)) {
      skippedPiiCleared += 1;
      continue;
    }

    const exportRow = buildCourierExportRowFromSnapshot(toExportSnapshot(order), {
      includeExcloadOrderNoInExport: true,
    });
    exportRow['주문번호'] = asTrimmed(order.mallOrderNo) || asTrimmed(item.mallOrderNo);
    rows.push(exportRow);
  }

  if (rows.length === 0) {
    return {
      ok: false,
      reason: 'NO_EXPORTABLE_ROWS',
      message:
        skippedPiiCleared > 0
          ? '보관된 수취인 정보가 없어 다시 받을 수 없습니다. 주문을 다시 조회한 뒤 택배양식을 새로 다운로드해 주세요.'
          : '다시 받을 주문 데이터가 없습니다.',
    };
  }

  return {
    ok: true,
    bundleId: bundle.id,
    fileStem: formatFileStem(bundle.createdAt, rows.length),
    rows,
    exportedCount: rows.length,
    skippedPiiCleared,
    skippedMissingOrder,
  };
}
