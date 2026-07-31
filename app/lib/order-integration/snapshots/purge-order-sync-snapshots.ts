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
/** SENT PII 루프 상한 — scrubExpiredShipmentUploadPii의 maxBatches와 같은 진행 보장 패턴. */
export const SENT_PII_CLEAR_MAX_BATCHES = 50;

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
  /** SENT PII 루프가 조회한 배치 수(상한 도달 여부 진단용) */
  sentPiiBatchesAttempted: number;
  /** SENT PII 루프 종료 사유 */
  sentPiiStoppedReason: 'complete' | 'max_batches';
};

function buildSentPiiWhere(skipIds: ReadonlyArray<string>): Record<string, unknown> {
  const where: Record<string, unknown> = {
    transmissionStatus: 'SENT',
    piiClearedAt: null,
  };
  if (skipIds.length > 0) {
    where.id = { notIn: [...skipIds] };
  }
  return where;
}

/**
 * 1) expiresAt < now → 연관 Match/UploadRow PII 스크럽 후 OrderSyncOrder hard delete
 *    Match/Attempt.orderSyncOrderId = SetNull (전송 이력 행 유지)
 * 2) SENT + piiClearedAt null → 완전 전송 확인 후 Order+연관 PII 정리
 *    incomplete는 skipIds로 제외해 한 실행 안 재조회·고착을 막고, maxBatches로 종료를 보장한다.
 */
export async function purgeOrderSyncSnapshots(input?: {
  now?: Date;
  client?: PurgeOrderSyncSnapshotsClient;
  sentPiiBatchSize?: number;
  sentPiiMaxBatches?: number;
}): Promise<PurgeOrderSyncSnapshotsResult> {
  const now = input?.now ?? new Date();
  const client = (input?.client ?? prisma) as PurgeOrderSyncSnapshotsClient;
  const sentPiiBatchSize = input?.sentPiiBatchSize ?? PII_CLEAR_BATCH;
  const sentPiiMaxBatches = input?.sentPiiMaxBatches ?? SENT_PII_CLEAR_MAX_BATCHES;
  let deletedExpiredOrders = 0;
  let clearedSentPiiOrders = 0;
  let clearedUploadRows = 0;
  let clearedMatches = 0;
  let clearedAttempts = 0;
  let scrubbedExpiredMatches = 0;
  let scrubbedExpiredUploadRows = 0;
  let sentPiiBatchesAttempted = 0;
  let sentPiiStoppedReason: PurgeOrderSyncSnapshotsResult['sentPiiStoppedReason'] = 'complete';

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

  const skipIds: string[] = [];
  for (;;) {
    if (sentPiiBatchesAttempted >= sentPiiMaxBatches) {
      sentPiiStoppedReason = 'max_batches';
      break;
    }

    const targets = await client.orderSyncOrder.findMany({
      where: buildSentPiiWhere(skipIds),
      select: { id: true, userId: true },
      take: sentPiiBatchSize,
      orderBy: { updatedAt: 'asc' },
    });
    if (targets.length === 0) {
      sentPiiStoppedReason = 'complete';
      break;
    }

    sentPiiBatchesAttempted += 1;

    for (const target of targets) {
      if (!target.userId) {
        // userId 없으면 clear 불가 — 같은 실행에서 재조회하지 않도록 skip
        skipIds.push(target.id);
        continue;
      }
      const result = await clearTransmittedOrderPiiIfComplete(client, {
        userId: target.userId,
        orderSyncOrderId: target.id,
        now,
      });
      if (result.skippedIncomplete) {
        skipIds.push(target.id);
        continue;
      }
      if (result.clearedOrder) clearedSentPiiOrders += 1;
      clearedUploadRows += result.clearedUploadRows;
      clearedMatches += result.clearedMatches;
      clearedAttempts += result.clearedAttempts;
    }

    if (targets.length < sentPiiBatchSize) {
      sentPiiStoppedReason = 'complete';
      break;
    }
  }

  return {
    deletedExpiredOrders,
    clearedSentPiiOrders,
    clearedUploadRows,
    clearedMatches,
    clearedAttempts,
    scrubbedExpiredMatches,
    scrubbedExpiredUploadRows,
    sentPiiBatchesAttempted,
    sentPiiStoppedReason,
  };
}
