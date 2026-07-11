import {
  createEmptyItIds,
  type ShipmentTransmissionItIds,
} from '@/app/lib/order-integration/transmission/__tests__/integration/support/cleanup-plans';

export type ScenarioLifecycleFlags = {
  fixtureCreated: boolean;
  testCompleted: boolean;
  cleanupStarted: boolean;
  cleanupCompleted: boolean;
  disconnectCompleted: boolean;
  cleanupDeletedCount: number;
  cleanupErrorCode: string | null;
};

export function createEmptyLifecycleFlags(): ScenarioLifecycleFlags {
  return {
    fixtureCreated: false,
    testCompleted: false,
    cleanupStarted: false,
    cleanupCompleted: false,
    disconnectCompleted: false,
    cleanupDeletedCount: 0,
    cleanupErrorCode: null,
  };
}

export type RegistryEntry = {
  key: string;
  ids: ShipmentTransmissionItIds;
  flags: ScenarioLifecycleFlags;
};

/**
 * In-memory registry of fixture IDs for one vitest file run.
 * Cleanup must succeed before an entry is removed.
 */
export function createCleanupRegistry() {
  /** @type {Map<string, RegistryEntry>} */
  const entries = new Map<string, RegistryEntry>();
  let suiteAbortReason: string | null = null;

  return {
    register(key: string, ids: ShipmentTransmissionItIds): RegistryEntry {
      const entry: RegistryEntry = {
        key,
        ids,
        flags: createEmptyLifecycleFlags(),
      };
      entries.set(key, entry);
      return entry;
    },

    get(key: string): RegistryEntry | undefined {
      return entries.get(key);
    },

    listPending(): RegistryEntry[] {
      return [...entries.values()].filter((e) => hasAnyTrackedIds(e.ids));
    },

    hasPending(): boolean {
      return this.listPending().length > 0;
    },

    /** Remove entry only after successful cleanup (no remaining tracked IDs). */
    markFullyCleaned(key: string): void {
      const entry = entries.get(key);
      if (!entry) return;
      if (hasAnyTrackedIds(entry.ids)) return;
      entries.delete(key);
    },

    getSuiteAbortReason(): string | null {
      return suiteAbortReason;
    },

    abortSuite(reason: string): void {
      suiteAbortReason = reason;
    },

    /** Snapshot for summary — no ID plaintext. */
    summaryCounts(): { pendingEntries: number; cleanedFlags: number } {
      let cleanedFlags = 0;
      for (const e of entries.values()) {
        if (e.flags.cleanupCompleted) cleanedFlags += 1;
      }
      return {
        pendingEntries: this.listPending().length,
        cleanedFlags,
      };
    },
  };
}

export type CleanupRegistry = ReturnType<typeof createCleanupRegistry>;

export function hasAnyTrackedIds(ids: ShipmentTransmissionItIds): boolean {
  return Boolean(
    ids.userId ||
      ids.accountId ||
      ids.attemptIds.length ||
      ids.matchIds.length ||
      ids.uploadRowIds.length ||
      ids.uploadBatchIds.length ||
      ids.orderIds.length ||
      ids.orderBatchIds.length,
  );
}

/** After successful deletes, clear corresponding tracked fields (idempotent re-cleanup). */
export function clearIdsAfterSuccessfulCleanup(
  ids: ShipmentTransmissionItIds,
  deletedTables: string[],
): void {
  const set = new Set(deletedTables);
  if (set.has('shipmentTransmissionAttempt')) ids.attemptIds = [];
  if (set.has('shipmentMatch')) ids.matchIds = [];
  if (set.has('shipmentUploadRow')) ids.uploadRowIds = [];
  if (set.has('shipmentUploadBatch')) ids.uploadBatchIds = [];
  if (set.has('orderSyncOrder')) ids.orderIds = [];
  if (set.has('orderSyncBatch')) ids.orderBatchIds = [];
  if (set.has('orderIntegrationAccount')) ids.accountId = null;
  if (set.has('user')) {
    ids.userId = null;
    ids.userEmail = null;
  }
}

export function cloneItIds(ids: ShipmentTransmissionItIds): ShipmentTransmissionItIds {
  return {
    runId: ids.runId,
    userId: ids.userId,
    userEmail: ids.userEmail,
    accountId: ids.accountId,
    orderBatchIds: [...ids.orderBatchIds],
    orderIds: [...ids.orderIds],
    uploadBatchIds: [...ids.uploadBatchIds],
    uploadRowIds: [...ids.uploadRowIds],
    matchIds: [...ids.matchIds],
    attemptIds: [...ids.attemptIds],
  };
}

export function resetItIds(ids: ShipmentTransmissionItIds): void {
  const empty = createEmptyItIds(ids.runId);
  Object.assign(ids, empty);
}
