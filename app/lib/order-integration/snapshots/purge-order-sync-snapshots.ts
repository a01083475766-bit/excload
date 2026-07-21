/**
 * 만료 OrderSyncOrder hard delete + 전송완료 주문 PII(연관 포함) 정리.
 */

import { prisma } from '@/app/lib/prisma';
import {
  clearTransmittedOrderPiiIfComplete,
  type ClearTransmittedOrderPiiClient,
} from '@/app/lib/order-integration/snapshots/clear-transmitted-order-pii';
import {
  scrubLinkedShipmentPiiForOrders,
  type ScrubLinkedShipmentPiiClient,
} from '@/app/lib/order-integration/snapshots/scrub-linked-shipment-pii';

const DELETE_BATCH = 200;
const PII_CLEAR_BATCH = 100;

export type PurgeOrderSyncSnapshotsClient = ScrubLinkedShipmentPiiClient &
  ClearTransmittedOrderPiiClient & {
    orderSyncOrder: ClearTransmittedOrderPiiClient['orderSyncOrder'] & {
      findMany: (args: {
        where: Record<string, unknown>;
        select: Record<string, boolean>;
        take?: number;
        orderBy?: Record<string, string>;
      }) => Promise<Array<{ id: string; userId?: string }>>;
      deleteMany: (args: {
        where: Record<string, unknown>;
      }) => Promise<{ count: number }>;
    };
  };

export type PurgeOrderSyncSnapshotsResult = {
  deletedExpiredOrders: number;
  clearedSentPiiOrders: number;
  clearedUploadRows: number;
  clearedMatches: number;
  clearedAttempts: number;
  /** 만료 삭제 직전 연관 Match/UploadRow PII 스크럽 건수 */
  scrubbedExpiredMatches: number;
  scrubbedExpiredUploadRows: number;
};

/**
 * 1) expiresAt < now → 연관 Match/UploadRow PII 스크럽 후 OrderSyncOrder hard delete
 *    Match/Attempt.orderSyncOrderId = SetNull (전송 이력 행 유지)
 * 2) SENT + piiClearedAt null → 완전 전송 확인 후 Order+연관 PII 정리
 */
export async function purgeOrderSyncSnapshots(input?: {
  now?: Date;
  client?: PurgeOrderSyncSnapshotsClient;
}): Promise<PurgeOrderSyncSnapshotsResult> {
  const now = input?.now ?? new Date();
  const client = (input?.client ?? prisma) as PurgeOrderSyncSnapshotsClient;
  let deletedExpiredOrders = 0;
  let clearedSentPiiOrders = 0;
  let clearedUploadRows = 0;
  let clearedMatches = 0;
  let clearedAttempts = 0;
  let scrubbedExpiredMatches = 0;
  let scrubbedExpiredUploadRows = 0;

  for (;;) {
    const expired = await client.orderSyncOrder.findMany({
      where: { expiresAt: { lt: now } },
      select: { id: true },
      take: DELETE_BATCH,
    });
    if (expired.length === 0) break;

    const orderIds = expired.map((row) => row.id);
    const scrubbed = await scrubLinkedShipmentPiiForOrders(client, {
      orderSyncOrderIds: orderIds,
    });
    scrubbedExpiredMatches += scrubbed.clearedMatches;
    scrubbedExpiredUploadRows += scrubbed.clearedUploadRows;

    const deleted = await client.orderSyncOrder.deleteMany({
      where: { id: { in: orderIds } },
    });
    deletedExpiredOrders += deleted.count;
    if (expired.length < DELETE_BATCH) break;
  }

  for (;;) {
    const targets = await client.orderSyncOrder.findMany({
      where: {
        transmissionStatus: 'SENT',
        piiClearedAt: null,
      },
      select: { id: true, userId: true },
      take: PII_CLEAR_BATCH,
      orderBy: { updatedAt: 'asc' },
    });
    if (targets.length === 0) break;

    for (const target of targets) {
      if (!target.userId) continue;
      const result = await clearTransmittedOrderPiiIfComplete(client, {
        userId: target.userId,
        orderSyncOrderId: target.id,
        now,
      });
      if (result.skippedIncomplete) continue;
      if (result.clearedOrder) clearedSentPiiOrders += 1;
      clearedUploadRows += result.clearedUploadRows;
      clearedMatches += result.clearedMatches;
      clearedAttempts += result.clearedAttempts;
    }

    if (targets.length < PII_CLEAR_BATCH) break;
  }

  return {
    deletedExpiredOrders,
    clearedSentPiiOrders,
    clearedUploadRows,
    clearedMatches,
    clearedAttempts,
    scrubbedExpiredMatches,
    scrubbedExpiredUploadRows,
  };
}
