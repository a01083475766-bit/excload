/**
 * Pure orchestration helpers for integration scenario lifecycle (unit-testable).
 * DB I/O is injected — no Prisma import here.
 */

import type { CleanupResult } from '@/app/lib/order-integration/transmission/__tests__/integration/support/cleanup';
import type {
  CleanupRegistry,
  RegistryEntry,
} from '@/app/lib/order-integration/transmission/__tests__/integration/support/cleanup-registry';
import { hasAnyTrackedIds } from '@/app/lib/order-integration/transmission/__tests__/integration/support/cleanup-registry';
import type { ShipmentTransmissionItIds } from '@/app/lib/order-integration/transmission/__tests__/integration/support/cleanup-plans';

export type CleanupFn = (ids: ShipmentTransmissionItIds) => Promise<CleanupResult>;
export type TrackAttemptsFn = (ids: ShipmentTransmissionItIds) => Promise<void>;
export type DisconnectFn = () => Promise<void>;

export async function runTrackedCleanup(input: {
  entry: RegistryEntry;
  trackAttempts: TrackAttemptsFn;
  cleanup: CleanupFn;
  disconnect: DisconnectFn;
}): Promise<{ cleanupOk: boolean; disconnectOk: boolean; deletedTotal: number }> {
  const { entry } = input;
  entry.flags.cleanupStarted = true;
  let cleanupOk = false;
  let disconnectOk = false;
  let deletedTotal = 0;

  try {
    if (hasAnyTrackedIds(entry.ids)) {
      await input.trackAttempts(entry.ids);
      const result = await input.cleanup(entry.ids);
      deletedTotal = result.deletedTotal;
      cleanupOk = result.ok && !hasAnyTrackedIds(entry.ids);
      if (!result.ok) {
        entry.flags.cleanupErrorCode = result.errorCode ?? 'CLEANUP_FAILED';
      } else if (hasAnyTrackedIds(entry.ids)) {
        entry.flags.cleanupErrorCode = 'CLEANUP_IDS_REMAIN';
        cleanupOk = false;
      } else {
        entry.flags.cleanupCompleted = true;
        entry.flags.cleanupDeletedCount += deletedTotal;
        entry.flags.cleanupErrorCode = null;
      }
    } else {
      cleanupOk = true;
      entry.flags.cleanupCompleted = true;
    }
  } catch {
    entry.flags.cleanupErrorCode = 'CLEANUP_THREW';
    cleanupOk = false;
  } finally {
    try {
      await input.disconnect();
      disconnectOk = true;
      entry.flags.disconnectCompleted = true;
    } catch {
      disconnectOk = false;
      entry.flags.cleanupErrorCode = entry.flags.cleanupErrorCode ?? 'DISCONNECT_FAILED';
    }
  }

  return { cleanupOk, disconnectOk, deletedTotal };
}

export async function cleanupPendingRegistryEntries(input: {
  registry: CleanupRegistry;
  createCleanupClient: () => {
    trackAttempts: TrackAttemptsFn;
    cleanup: CleanupFn;
    disconnect: DisconnectFn;
  };
}): Promise<{
  cleanupPass: boolean;
  disconnectPass: boolean;
  deletedTotal: number;
  errorCode: string | null;
}> {
  let deletedTotal = 0;
  let cleanupPass = true;
  let disconnectPass = true;
  let errorCode: string | null = null;

  const pending = input.registry.listPending();
  for (const entry of pending) {
    const client = input.createCleanupClient();
    const result = await runTrackedCleanup({
      entry,
      trackAttempts: client.trackAttempts,
      cleanup: client.cleanup,
      disconnect: client.disconnect,
    });
    deletedTotal += result.deletedTotal;
    if (!result.cleanupOk) {
      cleanupPass = false;
      errorCode = entry.flags.cleanupErrorCode ?? 'CLEANUP_FAIL';
      input.registry.abortSuite(errorCode);
    } else {
      input.registry.markFullyCleaned(entry.key);
    }
    if (!result.disconnectOk) {
      disconnectPass = false;
      errorCode = errorCode ?? 'DISCONNECT_FAIL';
    }
  }

  if (input.registry.hasPending()) {
    cleanupPass = false;
    errorCode = errorCode ?? 'REGISTRY_PENDING';
    input.registry.abortSuite(errorCode);
  }

  return { cleanupPass, disconnectPass, deletedTotal, errorCode };
}
