import type { OrderIntegrationProvider } from '@prisma/client';

import { SHIPMENT_UPLOAD_BATCH_READY_STATUS } from '@/app/lib/order-integration/shipments/refresh-shipment-upload-batch-ready-status';
import {
  evaluateShipmentTransmissionEligibility,
  type TransmissionEligibilityBatchInput,
} from '@/app/lib/order-integration/transmission/eligibility';
import type { TransmitDryRunBody } from '@/app/lib/order-integration/transmission/parse-transmit-dry-run-body';
import type { RunPersistedShipmentTransmissionFn } from '@/app/lib/order-integration/transmission/mock-transmit-service';
import {
  type MockTransmitMatchResult,
  type MockTransmitReadRepository,
} from '@/app/lib/order-integration/transmission/mock-transmit-service';
import { runPersistedShipmentTransmission } from '@/app/lib/order-integration/transmission/persisted-executor';
import type { ShipmentTransmissionPersistClient } from '@/app/lib/order-integration/transmission/repository';
import type { ShipmentTransmissionAdapter } from '@/app/lib/order-integration/transmission/types';

export type ShipmentTransmitServiceResult =
  | { ok: false; status: 403 | 404 | 409 | 500; reasonCode: string; safeMessage: string }
  | {
      ok: true;
      body: {
        mock: false;
        batchId: string;
        summary: {
          requestedCount: number;
          attemptedCount: number;
          successCount: number;
          failureCount: number;
          skippedCount: number;
        };
        results: MockTransmitMatchResult[];
      };
    };

export type ShipmentTransmitServiceDeps = {
  enabled: boolean;
  readRepository: MockTransmitReadRepository;
  persistClient: ShipmentTransmissionPersistClient;
  resolveAdapter: (input: { provider: OrderIntegrationProvider }) => ShipmentTransmissionAdapter;
  runPersisted?: RunPersistedShipmentTransmissionFn;
  prepareFailedRetry?: (input: { matchId: string }) => Promise<boolean>;
};

function toResult(input: {
  matchId: string;
  attemptId?: string | null;
  attempted: boolean;
  previousStatus: string | null;
  nextStatus: string | null;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  retryable?: boolean;
  providerRequestId?: string | null;
  requiresRetryPreparation?: boolean;
}): MockTransmitMatchResult {
  return {
    matchId: input.matchId,
    attemptId: input.attemptId ?? null,
    attempted: input.attempted,
    previousStatus: input.previousStatus,
    nextStatus: input.nextStatus,
    success: input.success,
    retryable: input.retryable ?? false,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    providerRequestId: input.providerRequestId ?? null,
    requiresRetryPreparation: input.requiresRetryPreparation ?? false,
  };
}

export async function runShipmentTransmitService(
  deps: ShipmentTransmitServiceDeps,
  input: { userId: string; batchId: string; parsedBody: TransmitDryRunBody },
): Promise<ShipmentTransmitServiceResult> {
  if (!deps.enabled) {
    return {
      ok: false,
      status: 403,
      reasonCode: 'NOT_CONFIGURED',
      safeMessage: 'Real shipment transmission is disabled. No external request was sent.',
    };
  }

  const batch = await deps.readRepository.findBatchForMockTransmit({
    batchId: input.batchId,
    userId: input.userId,
  });
  if (!batch) {
    return { ok: false, status: 404, reasonCode: 'BATCH_NOT_FOUND', safeMessage: 'Batch not found.' };
  }
  if (batch.status !== SHIPMENT_UPLOAD_BATCH_READY_STATUS) {
    return {
      ok: false,
      status: 409,
      reasonCode: 'BATCH_NOT_READY',
      safeMessage: 'Only READY upload batches can be transmitted.',
    };
  }

  const matchIds = input.parsedBody.matchIds ?? [];
  const matches = await deps.readRepository.findMatchesForMockTransmit({
    batchId: input.batchId,
    userId: input.userId,
    matchIds,
  });
  const byId = new Map(matches.map((row) => [row.id, row]));
  const batchInput: TransmissionEligibilityBatchInput = {
    id: batch.id,
    userId: batch.userId,
    provider: batch.provider,
    integrationAccountId: batch.integrationAccountId,
    status: batch.status,
  };
  const results: MockTransmitMatchResult[] = [];
  const runPersisted = deps.runPersisted ?? runPersistedShipmentTransmission;

  for (const matchId of matchIds) {
    const row = byId.get(matchId);
    if (!row) {
      results.push(toResult({ matchId, attempted: false, previousStatus: null, nextStatus: null, success: false, errorCode: 'MATCH_NOT_FOUND', errorMessage: 'Match not found.' }));
      continue;
    }

    if (row.transmissionStatus === 'FAILED' && input.parsedBody.retryFailed) {
      const prepared = await deps.prepareFailedRetry?.({ matchId });
      if (!prepared) {
        results.push(toResult({ matchId, attempted: false, previousStatus: 'FAILED', nextStatus: 'FAILED', success: false, errorCode: 'RETRY_PREPARE_FAILED', errorMessage: 'Failed match could not be prepared for retry.', requiresRetryPreparation: true }));
        continue;
      }
      row.transmissionStatus = 'READY';
    }

    const eligibility = evaluateShipmentTransmissionEligibility({
      batch: batchInput,
      match: {
        id: row.id,
        userId: row.userId,
        uploadBatchId: row.uploadBatchId,
        orderSyncOrderId: row.orderSyncOrderId,
        provider: row.provider,
        integrationAccountId: row.integrationAccountId,
        userConfirmationStatus: row.userConfirmationStatus,
        transmissionStatus: row.transmissionStatus,
        finalTrackingNumber: row.finalTrackingNumber,
        finalCarrierCode: row.finalCarrierCode,
        finalCarrierName: row.finalCarrierName,
        uploadRow: row.uploadRow,
      },
      order: row.orderSyncOrder
        ? {
            id: row.orderSyncOrder.id,
            userId: row.orderSyncOrder.userId,
            provider: row.orderSyncOrder.provider,
            integrationAccountId: row.orderSyncOrder.integrationAccountId,
            mallOrderNo: row.orderSyncOrder.mallOrderNo,
            excloadOrderNo: row.orderSyncOrder.excloadOrderNo,
            mallLineItemIds: row.orderSyncOrder.mallLineItemIds,
          }
        : null,
      options: { retryFailed: input.parsedBody.retryFailed },
    });
    if (!eligibility.eligible || !eligibility.candidate) {
      results.push(toResult({ matchId, attempted: false, previousStatus: row.transmissionStatus, nextStatus: row.transmissionStatus, success: false, errorCode: eligibility.reasonCode ?? 'NOT_ELIGIBLE', errorMessage: eligibility.reasonMessage ?? 'Not eligible.' }));
      continue;
    }

    const adapter = deps.resolveAdapter({ provider: eligibility.candidate.provider });
    const persisted = await runPersisted({
      userId: input.userId,
      candidate: eligibility.candidate,
      adapter,
      persistClient: deps.persistClient,
    });
    results.push(toResult({
      matchId,
      attemptId: persisted.complete?.attemptId ?? persisted.reserve.attemptId ?? null,
      attempted: persisted.adapterCalled,
      previousStatus: persisted.reserve.previousStatus ?? row.transmissionStatus,
      nextStatus: persisted.complete?.nextStatus ?? persisted.reserve.nextStatus ?? row.transmissionStatus,
      success: persisted.success,
      errorCode: persisted.success ? null : (persisted.adapterResult?.errorCode ?? persisted.complete?.reasonCode ?? persisted.reserve.reasonCode),
      errorMessage: persisted.success ? null : (persisted.adapterResult?.errorMessage ?? persisted.complete?.reasonMessage ?? persisted.reserve.reasonMessage ?? 'Transmission failed.'),
      retryable: persisted.adapterResult?.retryable ?? false,
      providerRequestId: persisted.adapterResult?.providerRequestId ?? null,
    }));
  }

  const attempted = results.filter((row) => row.attempted);
  return {
    ok: true,
    body: {
      mock: false,
      batchId: input.batchId,
      summary: {
        requestedCount: matchIds.length,
        attemptedCount: attempted.length,
        successCount: attempted.filter((row) => row.success).length,
        failureCount: attempted.filter((row) => !row.success).length,
        skippedCount: results.length - attempted.length,
      },
      results,
    },
  };
}
