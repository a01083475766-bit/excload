import type { PrismaClient, ShipmentTransmissionAttemptStatus } from '@prisma/client';

import {
  parseSmartstoreItemResultsFromSummary,
} from '@/app/lib/smartstore/smartstore-batch-dispatch';
import type { ShipmentTransmissionItemResultSummary } from '@/app/lib/order-integration/transmission/types';

export type PriorSmartstoreItemResultsLoader = (input: {
  userId: string;
  matchIds: readonly string[];
  /** 있으면 동일 계정 완료 attempt의 성공 itemResults도 합친다 */
  integrationAccountId?: string;
}) => Promise<Map<string, ShipmentTransmissionItemResultSummary[]>>;

/**
 * loader가 실제로 쓰는 Prisma 표면만 노출.
 * - PrismaClient는 구조적으로 호환 (delegate에 findMany 포함)
 * - hand-rolled findMany(select: Record<string, boolean>)는 Prisma 반환 타입과 충돌하므로 사용하지 않음
 */
export type PriorSmartstoreItemResultsPrismaClient = {
  shipmentTransmissionAttempt: {
    findMany: PrismaClient['shipmentTransmissionAttempt']['findMany'];
  };
};

const PRIOR_ATTEMPT_STATUSES: ShipmentTransmissionAttemptStatus[] = [
  'SUCCESS',
  'FAILED',
  'UNKNOWN',
];

export type PriorSmartstoreAttemptSummaryRow = {
  shipmentMatchId: string;
  attemptNo: number;
  responseSummaryJson: unknown;
};

function collectSuccessItems(
  rows: ReadonlyArray<PriorSmartstoreAttemptSummaryRow>,
): {
  byMatch: Map<string, ShipmentTransmissionItemResultSummary[]>;
  accountSuccess: ShipmentTransmissionItemResultSummary[];
} {
  const byMatch = new Map<string, ShipmentTransmissionItemResultSummary[]>();
  const accountSuccess: ShipmentTransmissionItemResultSummary[] = [];
  const successSeen = new Set<string>();
  const matchSeen = new Set<string>();

  for (const row of rows) {
    const items = parseSmartstoreItemResultsFromSummary(row.responseSummaryJson);
    if (!matchSeen.has(row.shipmentMatchId) && items.length > 0) {
      matchSeen.add(row.shipmentMatchId);
      byMatch.set(row.shipmentMatchId, items);
    }
    for (const item of items) {
      if (item.status !== 'SUCCESS' && item.status !== 'ALREADY_DISPATCHED') continue;
      const key = `${item.productOrderId}|${item.shipmentFingerprint}`;
      if (successSeen.has(key)) continue;
      successSeen.add(key);
      accountSuccess.push(item);
    }
  }
  return { byMatch, accountSuccess };
}

/**
 * Prisma(또는 동일 delegate를 가진 client)에서 Match/계정 범위의 이전 itemResults를 읽는다.
 * PENDING/PROCESSING은 제외한다.
 */
export function createPrismaPriorSmartstoreItemResultsLoader(
  client: PriorSmartstoreItemResultsPrismaClient,
): PriorSmartstoreItemResultsLoader {
  return async ({ userId, matchIds, integrationAccountId }) => {
    const out = new Map<string, ShipmentTransmissionItemResultSummary[]>();
    if (matchIds.length === 0) return out;

    const where = integrationAccountId
      ? {
          userId,
          integrationAccountId,
          status: { in: PRIOR_ATTEMPT_STATUSES },
        }
      : {
          userId,
          shipmentMatchId: { in: [...matchIds] },
          status: { in: PRIOR_ATTEMPT_STATUSES },
        };

    const rows = await client.shipmentTransmissionAttempt.findMany({
      where,
      orderBy: [{ attemptNo: 'desc' }],
      select: {
        shipmentMatchId: true,
        attemptNo: true,
        responseSummaryJson: true,
      },
    });

    const { byMatch, accountSuccess } = collectSuccessItems(rows);
    for (const matchId of matchIds) {
      const own = byMatch.get(matchId) ?? [];
      const merged = [...own];
      const seen = new Set(
        own.map((item) => `${item.productOrderId}|${item.shipmentFingerprint}|${item.status}`),
      );
      for (const item of accountSuccess) {
        const key = `${item.productOrderId}|${item.shipmentFingerprint}|${item.status}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }
      if (merged.length > 0) out.set(matchId, merged);
    }
    return out;
  };
}
