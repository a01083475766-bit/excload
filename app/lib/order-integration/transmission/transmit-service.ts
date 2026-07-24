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
import type { ClearTransmittedOrderPiiClient } from '@/app/lib/order-integration/snapshots/clear-transmitted-order-pii';
import { runPersistedShipmentTransmission } from '@/app/lib/order-integration/transmission/persisted-executor';
import type { PriorSmartstoreItemResultsLoader } from '@/app/lib/order-integration/transmission/load-prior-smartstore-item-results';
import { runPersistedSmartstoreBatchedTransmission } from '@/app/lib/order-integration/transmission/smartstore-batched-persisted';
import type { ShipmentTransmissionPersistClient } from '@/app/lib/order-integration/transmission/repository';
import type {
  ShipmentTransmissionAdapter,
  ShipmentTransmissionCandidate,
} from '@/app/lib/order-integration/transmission/types';
import { evaluateLiveTransmitCandidateAllowlist } from '@/app/lib/order-integration/transmission/live-transmit-guard';
import type { PrepareShipmentMatchForTransmitResult } from '@/app/lib/order-integration/transmission/read-repository';

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
  /** Live allowlists — empty → block all external transmits when enabled */
  allowedProviders: ReadonlyArray<string>;
  allowedIntegrationAccountIds: ReadonlyArray<string>;
  readRepository: MockTransmitReadRepository;
  persistClient: ShipmentTransmissionPersistClient;
  resolveAdapter: (input: { provider: OrderIntegrationProvider }) => ShipmentTransmissionAdapter;
  runPersisted?: RunPersistedShipmentTransmissionFn;
  prepareFailedRetry?: (input: { matchId: string }) => Promise<boolean>;
  /** eligibility candidate의 provider/account를 Match에 안전하게 맞추고 READY로 준비 */
  prepareForTransmit?: (input: {
    matchId: string;
    provider: OrderIntegrationProvider;
    integrationAccountId: string;
  }) => Promise<boolean | PrepareShipmentMatchForTransmitResult>;
  /** 실전송 성공 후 주문 단위 PII 정리. mock 경로에는 주입하지 않음. */
  piiClearClient?: ClearTransmittedOrderPiiClient;
  /** SMARTSTORE 재처리 시 이전 productOrderId 성공 이력 로드 */
  loadPriorSmartstoreItemResults?: PriorSmartstoreItemResultsLoader;
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

function toResultFromPersisted(input: {
  matchId: string;
  rowStatus: string | null;
  persisted: Awaited<ReturnType<typeof runPersistedShipmentTransmission>>;
}): MockTransmitMatchResult {
  const alreadyDispatched =
    input.persisted.success &&
    input.persisted.adapterResult?.errorCode === 'ALREADY_DISPATCHED';
  return toResult({
    matchId: input.matchId,
    attemptId: input.persisted.complete?.attemptId ?? input.persisted.reserve.attemptId ?? null,
    attempted: input.persisted.adapterCalled,
    previousStatus: input.persisted.reserve.previousStatus ?? input.rowStatus,
    nextStatus:
      input.persisted.complete?.nextStatus ??
      input.persisted.reserve.nextStatus ??
      input.rowStatus,
    success: input.persisted.success,
    errorCode: input.persisted.success
      ? alreadyDispatched
        ? 'ALREADY_DISPATCHED'
        : null
      : (input.persisted.adapterResult?.errorCode ??
        input.persisted.complete?.reasonCode ??
        input.persisted.reserve.reasonCode),
    errorMessage: input.persisted.success
      ? alreadyDispatched
        ? (input.persisted.adapterResult?.errorMessage ??
          '이미 동일 송장정보로 발송 처리된 주문입니다.')
        : null
      : (input.persisted.adapterResult?.errorMessage ??
        input.persisted.complete?.reasonMessage ??
        input.persisted.reserve.reasonMessage ??
        'Transmission failed.'),
    retryable: input.persisted.adapterResult?.retryable ?? false,
    providerRequestId: input.persisted.adapterResult?.providerRequestId ?? null,
  });
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

  if (
    deps.allowedProviders.length === 0 ||
    deps.allowedIntegrationAccountIds.length === 0
  ) {
    return {
      ok: false,
      status: 403,
      reasonCode: 'LIVE_ALLOWLIST_NOT_CONFIGURED',
      safeMessage:
        'Live shipment transmission allowlist is not configured. No external request was sent.',
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
  const resultByMatchId = new Map<string, MockTransmitMatchResult>();
  const runPersisted = deps.runPersisted ?? runPersistedShipmentTransmission;

  type SmartstorePending = {
    matchId: string;
    rowStatus: string | null;
    candidate: ShipmentTransmissionCandidate;
  };
  const smartstoreByAccount = new Map<string, SmartstorePending[]>();

  for (const matchId of matchIds) {
    const row = byId.get(matchId);
    if (!row) {
      resultByMatchId.set(
        matchId,
        toResult({
          matchId,
          attempted: false,
          previousStatus: null,
          nextStatus: null,
          success: false,
          errorCode: 'MATCH_NOT_FOUND',
          errorMessage: 'Match not found.',
        }),
      );
      continue;
    }

    if (row.transmissionStatus === 'FAILED' && input.parsedBody.retryFailed) {
      const prepared = await deps.prepareFailedRetry?.({ matchId });
      if (!prepared) {
        resultByMatchId.set(
          matchId,
          toResult({
            matchId,
            attempted: false,
            previousStatus: 'FAILED',
            nextStatus: 'FAILED',
            success: false,
            errorCode: 'RETRY_PREPARE_FAILED',
            errorMessage: 'Failed match could not be prepared for retry.',
            requiresRetryPreparation: true,
          }),
        );
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
      resultByMatchId.set(
        matchId,
        toResult({
          matchId,
          attempted: false,
          previousStatus: row.transmissionStatus,
          nextStatus: row.transmissionStatus,
          success: false,
          errorCode: eligibility.reasonCode ?? 'NOT_ELIGIBLE',
          errorMessage: eligibility.reasonMessage ?? 'Not eligible.',
        }),
      );
      continue;
    }

    const candidateGate = evaluateLiveTransmitCandidateAllowlist({
      allowedProviders: deps.allowedProviders,
      allowedAccountIds: deps.allowedIntegrationAccountIds,
      provider: eligibility.candidate.provider,
      integrationAccountId: eligibility.candidate.integrationAccountId,
    });
    if (!candidateGate.allowed) {
      resultByMatchId.set(
        matchId,
        toResult({
          matchId,
          attempted: false,
          previousStatus: row.transmissionStatus,
          nextStatus: row.transmissionStatus,
          success: false,
          errorCode: candidateGate.reasonCode,
          errorMessage: candidateGate.safeMessage,
        }),
      );
      continue;
    }

    if (row.transmissionStatus === 'NONE' || row.transmissionStatus === 'READY') {
      const prepared = await deps.prepareForTransmit?.({
        matchId,
        provider: eligibility.candidate.provider,
        integrationAccountId: eligibility.candidate.integrationAccountId,
      });
      const prepareOk =
        prepared == null
          ? true
          : typeof prepared === 'boolean'
            ? prepared
            : prepared.ok;
      if (deps.prepareForTransmit && !prepareOk) {
        resultByMatchId.set(
          matchId,
          toResult({
            matchId,
            attempted: false,
            previousStatus: row.transmissionStatus,
            nextStatus: row.transmissionStatus,
            success: false,
            errorCode: 'TRANSMIT_PREPARE_FAILED',
            errorMessage: '전송 예약(provider/account/READY) 준비에 실패했습니다.',
          }),
        );
        continue;
      }
      row.transmissionStatus = 'READY';
      row.provider = eligibility.candidate.provider;
      row.integrationAccountId = eligibility.candidate.integrationAccountId;
    }

    const adapter = deps.resolveAdapter({ provider: eligibility.candidate.provider });
    const useSmartstoreBatch =
      eligibility.candidate.provider === 'SMARTSTORE' &&
      typeof adapter.transmitAccountBatch === 'function';

    if (useSmartstoreBatch) {
      const accountId = eligibility.candidate.integrationAccountId;
      const list = smartstoreByAccount.get(accountId) ?? [];
      list.push({
        matchId,
        rowStatus: row.transmissionStatus,
        candidate: eligibility.candidate,
      });
      smartstoreByAccount.set(accountId, list);
      continue;
    }

    const persisted = await runPersisted({
      userId: input.userId,
      candidate: eligibility.candidate,
      adapter,
      persistClient: deps.persistClient,
      piiClearClient: deps.piiClearClient,
    });
    resultByMatchId.set(
      matchId,
      toResultFromPersisted({
        matchId,
        rowStatus: row.transmissionStatus,
        persisted,
      }),
    );
  }

  for (const [accountId, pending] of smartstoreByAccount) {
    const adapter = deps.resolveAdapter({ provider: 'SMARTSTORE' });
    const matchIdsForAccount = pending.map((row) => row.matchId);
    const priorByMatch =
      (await deps.loadPriorSmartstoreItemResults?.({
        userId: input.userId,
        matchIds: matchIdsForAccount,
        integrationAccountId: accountId,
      })) ?? new Map();

    const batched = await runPersistedSmartstoreBatchedTransmission({
      userId: input.userId,
      integrationAccountId: accountId,
      entries: pending.map((row) => ({
        candidate: row.candidate,
        priorItemResults: priorByMatch.get(row.matchId) ?? [],
      })),
      adapter,
      persistClient: deps.persistClient,
      piiClearClient: deps.piiClearClient,
    });

    const byMatch = new Map(batched.map((row) => [row.matchId, row]));
    for (const row of pending) {
      const persisted = byMatch.get(row.matchId);
      if (!persisted) {
        resultByMatchId.set(
          row.matchId,
          toResult({
            matchId: row.matchId,
            attempted: false,
            previousStatus: row.rowStatus,
            nextStatus: row.rowStatus,
            success: false,
            errorCode: 'BATCH_RESULT_MISSING',
            errorMessage: '배치 전송 결과를 연결하지 못했습니다.',
          }),
        );
        continue;
      }
      resultByMatchId.set(
        row.matchId,
        toResultFromPersisted({
          matchId: row.matchId,
          rowStatus: row.rowStatus,
          persisted,
        }),
      );
    }
  }

  const results = matchIds.map(
    (matchId) =>
      resultByMatchId.get(matchId) ??
      toResult({
        matchId,
        attempted: false,
        previousStatus: null,
        nextStatus: null,
        success: false,
        errorCode: 'RESULT_MISSING',
        errorMessage: 'Transmission result missing.',
      }),
  );

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
