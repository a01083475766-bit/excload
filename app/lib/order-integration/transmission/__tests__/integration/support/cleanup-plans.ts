/**
 * Tracked IDs for one integration run. Cleanup uses only these IDs.
 */

export type ShipmentTransmissionItIds = {
  runId: string;
  userId: string | null;
  userEmail: string | null;
  accountId: string | null;
  orderBatchIds: string[];
  orderIds: string[];
  uploadBatchIds: string[];
  uploadRowIds: string[];
  matchIds: string[];
  attemptIds: string[];
};

export function createEmptyItIds(runId: string): ShipmentTransmissionItIds {
  return {
    runId,
    userId: null,
    userEmail: null,
    accountId: null,
    orderBatchIds: [],
    orderIds: [],
    uploadBatchIds: [],
    uploadRowIds: [],
    matchIds: [],
    attemptIds: [],
  };
}

/**
 * Build Prisma deleteMany where clauses from tracked IDs.
 * Never returns empty where objects.
 */
export function buildCleanupDeletePlans(ids: ShipmentTransmissionItIds): Array<{
  table: string;
  where: Record<string, unknown>;
}> {
  const plans: Array<{ table: string; where: Record<string, unknown> }> = [];

  if (ids.attemptIds.length > 0) {
    plans.push({
      table: 'shipmentTransmissionAttempt',
      where: { id: { in: [...ids.attemptIds] } },
    });
  } else if (ids.matchIds.length > 0 && ids.userId) {
    plans.push({
      table: 'shipmentTransmissionAttempt',
      where: {
        userId: ids.userId,
        shipmentMatchId: { in: [...ids.matchIds] },
      },
    });
  }

  if (ids.matchIds.length > 0) {
    plans.push({
      table: 'shipmentMatch',
      where: { id: { in: [...ids.matchIds] } },
    });
  }
  if (ids.uploadRowIds.length > 0) {
    plans.push({
      table: 'shipmentUploadRow',
      where: { id: { in: [...ids.uploadRowIds] } },
    });
  }
  if (ids.uploadBatchIds.length > 0) {
    plans.push({
      table: 'shipmentUploadBatch',
      where: { id: { in: [...ids.uploadBatchIds] } },
    });
  }
  if (ids.orderIds.length > 0) {
    plans.push({
      table: 'orderSyncOrder',
      where: { id: { in: [...ids.orderIds] } },
    });
  }
  if (ids.orderBatchIds.length > 0) {
    plans.push({
      table: 'orderSyncBatch',
      where: { id: { in: [...ids.orderBatchIds] } },
    });
  }
  if (ids.accountId) {
    plans.push({
      table: 'orderIntegrationAccount',
      where: { id: ids.accountId },
    });
  }
  if (ids.userId && ids.userEmail) {
    plans.push({
      table: 'user',
      where: { id: ids.userId, email: ids.userEmail },
    });
  }

  for (const plan of plans) {
    assertCleanupWhereNotEmpty(plan.where);
  }
  return plans;
}

export function assertCleanupWhereNotEmpty(where: Record<string, unknown>): void {
  const keys = Object.keys(where);
  if (keys.length === 0) {
    throw new Error('cleanup where must not be empty');
  }
}

export type CleanupCountReport = {
  table: string;
  deleted: number;
};

export function formatCleanupCountReport(counts: CleanupCountReport[]): string {
  return counts.map((c) => `${c.table}:${c.deleted}`).join(' ');
}
