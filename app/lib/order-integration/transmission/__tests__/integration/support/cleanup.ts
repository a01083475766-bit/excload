import type { PrismaClient } from '@prisma/client';

import {
  buildCleanupDeletePlans,
  formatCleanupCountReport,
  type CleanupCountReport,
  type ShipmentTransmissionItIds,
} from '@/app/lib/order-integration/transmission/__tests__/integration/support/cleanup-plans';
import { isItEmail } from '@/app/lib/order-integration/transmission/__tests__/integration/support/ids';
import { assertIntegrationMutationAllowed } from '@/app/lib/order-integration/transmission/__tests__/integration/support/mutation-gate';

export type CleanupResult = {
  ok: boolean;
  counts: CleanupCountReport[];
  summary: string;
  errorCode?: string;
};

/**
 * Deletes only IDs tracked for this run. FK-safe order.
 * Outputs counts only — never row contents / URLs.
 */
export async function cleanupShipmentTransmissionItIds(
  prisma: PrismaClient,
  ids: ShipmentTransmissionItIds,
): Promise<CleanupResult> {
  try {
    assertIntegrationMutationAllowed();
  } catch {
    return {
      ok: false,
      counts: [],
      summary: '',
      errorCode: 'MUTATION_GATE_BLOCKED',
    };
  }

  if (ids.userId && ids.userEmail && !isItEmail(ids.userEmail)) {
    return {
      ok: false,
      counts: [],
      summary: '',
      errorCode: 'USER_EMAIL_PREFIX_MISMATCH',
    };
  }

  const plans = buildCleanupDeletePlans(ids);
  const counts: CleanupCountReport[] = [];

  try {
    for (const plan of plans) {
      const deleted = await deleteByPlan(prisma, plan.table, plan.where);
      counts.push({ table: plan.table, deleted });
    }
    return {
      ok: true,
      counts,
      summary: formatCleanupCountReport(counts),
    };
  } catch {
    return {
      ok: false,
      counts,
      summary: formatCleanupCountReport(counts),
      errorCode: 'CLEANUP_FAILED',
    };
  }
}

async function deleteByPlan(
  prisma: PrismaClient,
  table: string,
  where: Record<string, unknown>,
): Promise<number> {
  switch (table) {
    case 'shipmentTransmissionAttempt':
      return (await prisma.shipmentTransmissionAttempt.deleteMany({ where })).count;
    case 'shipmentMatch':
      return (await prisma.shipmentMatch.deleteMany({ where })).count;
    case 'shipmentUploadRow':
      return (await prisma.shipmentUploadRow.deleteMany({ where })).count;
    case 'shipmentUploadBatch':
      return (await prisma.shipmentUploadBatch.deleteMany({ where })).count;
    case 'orderSyncOrder':
      return (await prisma.orderSyncOrder.deleteMany({ where })).count;
    case 'orderSyncBatch':
      return (await prisma.orderSyncBatch.deleteMany({ where })).count;
    case 'orderIntegrationAccount':
      return (await prisma.orderIntegrationAccount.deleteMany({ where })).count;
    case 'user':
      return (await prisma.user.deleteMany({ where })).count;
    default:
      throw new Error(`unknown cleanup table: ${table}`);
  }
}

/** Collect attempt IDs created for tracked matches (for ID-scoped cleanup). */
export async function trackAttemptsForMatches(
  prisma: PrismaClient,
  ids: ShipmentTransmissionItIds,
): Promise<void> {
  if (!ids.userId || ids.matchIds.length === 0) return;
  const rows = await prisma.shipmentTransmissionAttempt.findMany({
    where: {
      userId: ids.userId,
      shipmentMatchId: { in: ids.matchIds },
    },
    select: { id: true },
  });
  for (const row of rows) {
    if (!ids.attemptIds.includes(row.id)) {
      ids.attemptIds.push(row.id);
    }
  }
}
