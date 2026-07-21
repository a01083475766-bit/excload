/**
 * 송장 업로드 행·매칭 JSON 독립 14일 PII 정리.
 * OrderSyncOrder 연결 여부와 무관. 행/매칭 메타는 유지하고 JSON·수취인 필드만 DB NULL.
 */

import { Prisma } from '@prisma/client';

import { ORDER_SYNC_SNAPSHOT_TTL_MS } from '@/app/lib/order-integration/snapshots/order-sync-snapshot-retention';
import {
  SHIPMENT_MATCH_PII_CLEAR_DATA,
  SHIPMENT_UPLOAD_ROW_PII_CLEAR_DATA,
} from '@/app/lib/order-integration/snapshots/scrub-linked-shipment-pii';

export const SHIPMENT_UPLOAD_PII_TTL_MS = ORDER_SYNC_SNAPSHOT_TTL_MS;
export const SHIPMENT_UPLOAD_PII_SCRUB_BATCH = 100;
/** 한 cron 실행당 UploadRow / Match 각각 최대 batch 수 (무한 재조회 방지) */
export const SHIPMENT_UPLOAD_PII_SCRUB_MAX_BATCHES = 50;

/** PrismaClient·테스트 mock 공용 (method 문법으로 Prisma delegate 호환) */
export type ScrubExpiredShipmentUploadPiiClient = {
  shipmentUploadRow: {
    findMany(args: {
      where?: Record<string, unknown>;
      select?: Record<string, boolean>;
      take?: number;
      orderBy?: Record<string, string>;
    }): Promise<Array<{ id: string }>>;
    updateMany(args: {
      where?: Record<string, unknown>;
      data?: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  shipmentMatch: {
    findMany(args: {
      where?: Record<string, unknown>;
      select?: Record<string, boolean>;
      take?: number;
      orderBy?: Record<string, string>;
    }): Promise<Array<{ id: string }>>;
    updateMany(args: {
      where?: Record<string, unknown>;
      data?: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
};

export type ScrubExpiredShipmentUploadPiiResult = {
  scrubbedUploadRows: number;
  scrubbedMatches: number;
  batchFailures: number;
  rowBatchesAttempted: number;
  matchBatchesAttempted: number;
  stoppedReason?: 'complete' | 'max_batches' | 'zero_progress' | 'find_error' | 'update_error';
  /** PII 없는 짧은 실패 사유 (디버그용) */
  lastErrorCode?: string;
};

export function computeShipmentUploadPiiCutoff(
  now: Date,
  ttlMs: number = SHIPMENT_UPLOAD_PII_TTL_MS,
): Date {
  return new Date(now.getTime() - ttlMs);
}

/** Prisma Json 필드에 SQL NULL을 넣기 위한 값 (JSON null 아님) */
export function shipmentUploadPiiDbNull(): typeof Prisma.DbNull {
  return Prisma.DbNull;
}

export function buildShipmentUploadRowPiiClearData(): Record<string, unknown> {
  return { ...SHIPMENT_UPLOAD_ROW_PII_CLEAR_DATA };
}

export function buildShipmentMatchPiiClearData(): Record<string, unknown> {
  return { ...SHIPMENT_MATCH_PII_CLEAR_DATA };
}

function uploadRowNeedsScrubWhere(cutoff: Date, excludeIds: ReadonlyArray<string>) {
  return {
    createdAt: { lt: cutoff },
    ...(excludeIds.length > 0 ? { id: { notIn: [...excludeIds] } } : {}),
    OR: [
      { rawRowJson: { not: Prisma.DbNull } },
      { receiverName: { not: null } },
      { receiverPhone: { not: null } },
      { receiverPhoneNormalized: { not: null } },
      { receiverAddress: { not: null } },
      { productText: { not: null } },
    ],
  };
}

function matchNeedsScrubWhere(cutoff: Date, excludeIds: ReadonlyArray<string>) {
  return {
    createdAt: { lt: cutoff },
    ...(excludeIds.length > 0 ? { id: { notIn: [...excludeIds] } } : {}),
    OR: [
      { candidateOrdersJson: { not: Prisma.DbNull } },
      { mismatchFieldsJson: { not: Prisma.DbNull } },
    ],
  };
}

type LoopOutcome = {
  scrubbed: number;
  batchesAttempted: number;
  batchFailures: number;
  stoppedReason: ScrubExpiredShipmentUploadPiiResult['stoppedReason'];
  lastErrorCode?: string;
};

async function scrubIdBatches(input: {
  cutoff: Date;
  batchSize: number;
  maxBatches: number;
  findMany: ScrubExpiredShipmentUploadPiiClient['shipmentUploadRow']['findMany'];
  updateMany: ScrubExpiredShipmentUploadPiiClient['shipmentUploadRow']['updateMany'];
  buildWhere: (cutoff: Date, excludeIds: ReadonlyArray<string>) => Record<string, unknown>;
  buildData: () => Record<string, unknown>;
}): Promise<LoopOutcome> {
  let scrubbed = 0;
  let batchesAttempted = 0;
  let batchFailures = 0;
  let lastErrorCode: string | undefined;
  const skipIds: string[] = [];
  let stoppedReason: ScrubExpiredShipmentUploadPiiResult['stoppedReason'] = 'complete';

  const noteError = (error: unknown) => {
    batchFailures += 1;
    if (error && typeof error === 'object' && 'code' in error) {
      lastErrorCode = String((error as { code?: unknown }).code ?? 'ERR');
    } else if (error instanceof Error) {
      lastErrorCode = error.name || 'Error';
    } else {
      lastErrorCode = 'UNKNOWN';
    }
  };

  for (;;) {
    if (batchesAttempted >= input.maxBatches) {
      stoppedReason = 'max_batches';
      break;
    }

    let rows: Array<{ id: string }> = [];
    try {
      rows = await input.findMany({
        where: input.buildWhere(input.cutoff, skipIds),
        select: { id: true },
        take: input.batchSize,
        orderBy: { createdAt: 'asc' },
      });
    } catch (error) {
      noteError(error);
      stoppedReason = 'find_error';
      break;
    }

    if (rows.length === 0) {
      // 실패 id skip 후 잔여 없음 → 루프 정상 종료. update_error 표기는 유지.
      if (stoppedReason !== 'update_error') stoppedReason = 'complete';
      break;
    }

    batchesAttempted += 1;
    const ids = rows.map((r) => r.id);

    try {
      const updated = await input.updateMany({
        where: { id: { in: ids } },
        data: input.buildData(),
      });
      if (updated.count === 0) {
        skipIds.push(...ids);
        stoppedReason = 'zero_progress';
        batchFailures += 1;
        lastErrorCode = 'ZERO_PROGRESS';
        break;
      }
      scrubbed += updated.count;
    } catch (error) {
      noteError(error);
      skipIds.push(...ids);
      stoppedReason = 'update_error';
      continue;
    }

    if (rows.length < input.batchSize) {
      stoppedReason = 'complete';
      break;
    }
  }

  return { scrubbed, batchesAttempted, batchFailures, stoppedReason, lastErrorCode };
}

/**
 * createdAt 기준 14일 초과 UploadRow / Match PII를 batch로 DB NULL 처리.
 * - batch 실패해도 이미 성공한 update는 유지 (배치별 독립 커밋)
 * - 실패·0건 update id는 skip하여 동일 레코드 무한 재조회 방지
 * - maxBatches로 cron 실행 상한 보장
 */
export async function scrubExpiredShipmentUploadPii(
  client: ScrubExpiredShipmentUploadPiiClient,
  input: {
    now?: Date;
    batchSize?: number;
    maxBatches?: number;
  } = {},
): Promise<ScrubExpiredShipmentUploadPiiResult> {
  const now = input.now ?? new Date();
  const batchSize = input.batchSize ?? SHIPMENT_UPLOAD_PII_SCRUB_BATCH;
  const maxBatches = input.maxBatches ?? SHIPMENT_UPLOAD_PII_SCRUB_MAX_BATCHES;
  const cutoff = computeShipmentUploadPiiCutoff(now);

  const rows = await scrubIdBatches({
    cutoff,
    batchSize,
    maxBatches,
    findMany: client.shipmentUploadRow.findMany,
    updateMany: client.shipmentUploadRow.updateMany,
    buildWhere: uploadRowNeedsScrubWhere,
    buildData: buildShipmentUploadRowPiiClearData,
  });

  const matches = await scrubIdBatches({
    cutoff,
    batchSize,
    maxBatches,
    findMany: client.shipmentMatch.findMany,
    updateMany: client.shipmentMatch.updateMany,
    buildWhere: matchNeedsScrubWhere,
    buildData: buildShipmentMatchPiiClearData,
  });

  const stoppedReason =
    rows.stoppedReason === 'complete' && matches.stoppedReason === 'complete'
      ? 'complete'
      : rows.stoppedReason !== 'complete'
        ? rows.stoppedReason
        : matches.stoppedReason;

  return {
    scrubbedUploadRows: rows.scrubbed,
    scrubbedMatches: matches.scrubbed,
    batchFailures: rows.batchFailures + matches.batchFailures,
    rowBatchesAttempted: rows.batchesAttempted,
    matchBatchesAttempted: matches.batchesAttempted,
    stoppedReason,
    lastErrorCode: matches.lastErrorCode ?? rows.lastErrorCode,
  };
}
