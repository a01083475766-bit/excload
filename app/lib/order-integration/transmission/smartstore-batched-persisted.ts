import {
  buildShipmentTransmissionFingerprint,
  SHIPMENT_TRANSMISSION_FINGERPRINT_VERSION,
} from '@/app/lib/order-integration/transmission/fingerprint';
import type { ClearTransmittedOrderPiiClient } from '@/app/lib/order-integration/snapshots/clear-transmitted-order-pii';
import { clearTransmittedOrderPiiIfComplete } from '@/app/lib/order-integration/snapshots/clear-transmitted-order-pii';
import {
  completeTransmissionAttemptFailure,
  completeTransmissionAttemptSuccess,
  completeTransmissionAttemptUnknown,
  completeTransmissionAttemptWithoutExternalDispatch,
  createShipmentTransmissionExecutionToken,
  markTransmissionAttemptDispatched,
  reserveTransmissionAttempt,
  SHIPMENT_TRANSMISSION_LEASE_MS,
  type ShipmentTransmissionPersistClient,
  type ShipmentTransmissionPersistResult,
} from '@/app/lib/order-integration/transmission/repository';
import type {
  PersistedShipmentPiiClearInfo,
  PersistedShipmentTransmissionResult,
} from '@/app/lib/order-integration/transmission/persisted-executor';
import { toSafePiiClearFailureCode } from '@/app/lib/order-integration/transmission/persisted-executor';
import type {
  ShipmentTransmissionAdapter,
  ShipmentTransmissionCandidate,
  ShipmentTransmissionItemResultSummary,
} from '@/app/lib/order-integration/transmission/types';

export type SmartstoreBatchedPersistEntry = {
  candidate: ShipmentTransmissionCandidate;
  priorItemResults: ShipmentTransmissionItemResultSummary[];
};

export type SmartstoreBatchedPersistMatchResult = PersistedShipmentTransmissionResult & {
  matchId: string;
};

/**
 * SMARTSTORE 전용: Match별 lease/attempt를 먼저 확보한 뒤,
 * 계정 단위 배치 dispatch 결과를 각 Match attempt로 재연결한다.
 *
 * markTransmissionAttemptDispatched(dispatchedAt)는
 * 해당 Match의 productOrderId가 실제 네이버 POST 본문에 포함된 뒤에만 호출한다.
 */
export async function runPersistedSmartstoreBatchedTransmission(input: {
  userId: string;
  integrationAccountId: string;
  entries: SmartstoreBatchedPersistEntry[];
  adapter: ShipmentTransmissionAdapter;
  persistClient: ShipmentTransmissionPersistClient;
  now?: Date;
  leaseMs?: number;
  executionTokenFactory?: () => string;
  piiClearClient?: ClearTransmittedOrderPiiClient;
}): Promise<SmartstoreBatchedPersistMatchResult[]> {
  if (typeof input.adapter.transmitAccountBatch !== 'function') {
    throw new Error('SMARTSTORE_BATCH_ADAPTER_REQUIRED');
  }

  const now = input.now ?? new Date();
  const leaseMs = input.leaseMs ?? SHIPMENT_TRANSMISSION_LEASE_MS;
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);

  type Reserved = {
    entry: SmartstoreBatchedPersistEntry;
    reserve: ShipmentTransmissionPersistResult;
    executionToken: string;
  };

  const reserved: Reserved[] = [];
  const earlyResults: SmartstoreBatchedPersistMatchResult[] = [];

  for (const entry of input.entries) {
    const executionToken = createShipmentTransmissionExecutionToken(
      input.executionTokenFactory,
    );
    const fingerprint = buildShipmentTransmissionFingerprint({
      fingerprintVersion: SHIPMENT_TRANSMISSION_FINGERPRINT_VERSION,
      userId: input.userId,
      provider: entry.candidate.provider,
      integrationAccountId: entry.candidate.integrationAccountId,
      shipmentMatchId: entry.candidate.matchId,
      orderSyncOrderId: entry.candidate.orderSyncOrderId,
      mallOrderNo: entry.candidate.mallOrderNo,
      mallLineItemIds: entry.candidate.mallLineItemIds,
      trackingNumber: entry.candidate.trackingNumber,
      courierCode: entry.candidate.courierCode,
      courierName: entry.candidate.courierName,
    });

    const reserve = await reserveTransmissionAttempt(input.persistClient, {
      userId: input.userId,
      candidate: entry.candidate,
      payloadFingerprint: fingerprint,
      fingerprintVersion: SHIPMENT_TRANSMISSION_FINGERPRINT_VERSION,
      executionToken,
      now,
      leaseExpiresAt,
    });

    if (!reserve.success || !reserve.attemptId) {
      earlyResults.push({
        matchId: entry.candidate.matchId,
        success: false,
        adapterCalled: false,
        candidate: entry.candidate,
        reserve,
        dispatch: null,
        complete: null,
        adapterResult: null,
        outcomeKind: null,
      });
      continue;
    }

    reserved.push({ entry, reserve, executionToken });
  }

  if (reserved.length === 0) {
    return earlyResults;
  }

  let batchOutcomes;
  try {
    batchOutcomes = await input.adapter.transmitAccountBatch!({
      integrationAccountId: input.integrationAccountId,
      entries: reserved.map((row) => ({
        candidate: row.entry.candidate,
        priorItemResults: row.entry.priorItemResults,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'adapter threw';
    const failed: SmartstoreBatchedPersistMatchResult[] = [];
    for (const row of reserved) {
      // 배치 자체가 throw면 어느 Match가 POST됐는지 불명 → dispatched 없이 failure로 닫지 말고
      // mark 후 unknown으로 닫아 재처리 안전을 유지한다.
      const dispatch = await markTransmissionAttemptDispatched(input.persistClient, {
        userId: input.userId,
        shipmentMatchId: row.entry.candidate.matchId,
        attemptId: row.reserve.attemptId!,
        executionToken: row.executionToken,
        now,
      });
      const complete = dispatch.success
        ? await completeTransmissionAttemptUnknown(input.persistClient, {
            userId: input.userId,
            shipmentMatchId: row.entry.candidate.matchId,
            attemptId: row.reserve.attemptId!,
            executionToken: row.executionToken,
            now,
            errorCode: 'ADAPTER_EXECUTION_ERROR',
            errorMessage: message,
            providerRequestId: null,
            responseSummary: {
              providerStatusCode: 'ADAPTER_THROW',
              message: 'adapter threw during account batch',
            },
          })
        : null;
      failed.push({
        matchId: row.entry.candidate.matchId,
        success: false,
        adapterCalled: true,
        candidate: row.entry.candidate,
        reserve: row.reserve,
        dispatch,
        complete,
        adapterResult: null,
        outcomeKind: 'unknown',
      });
    }
    return [...earlyResults, ...failed];
  }

  const outcomeByMatchId = new Map(
    batchOutcomes.map((row) => {
      const withFlag = row as typeof row & { externallyPosted?: boolean };
      return [row.matchId, withFlag] as const;
    }),
  );
  const completed: SmartstoreBatchedPersistMatchResult[] = [];

  for (const row of reserved) {
    const matchId = row.entry.candidate.matchId;
    const outcome = outcomeByMatchId.get(matchId);
    if (!outcome) {
      const complete = await completeTransmissionAttemptWithoutExternalDispatch(
        input.persistClient,
        {
          userId: input.userId,
          shipmentMatchId: matchId,
          attemptId: row.reserve.attemptId!,
          executionToken: row.executionToken,
          now,
          outcome: 'failure',
          errorCode: 'BATCH_OUTCOME_MISSING',
          errorMessage: '배치 결과를 연결하지 못했습니다.',
          responseSummary: { providerStatusCode: 'BATCH_OUTCOME_MISSING' },
        },
      );
      completed.push({
        matchId,
        success: false,
        adapterCalled: true,
        candidate: row.entry.candidate,
        reserve: row.reserve,
        dispatch: null,
        complete,
        adapterResult: null,
        outcomeKind: 'failure',
      });
      continue;
    }

    const adapterResult = {
      success: outcome.success,
      provider: 'SMARTSTORE' as const,
      matchId,
      providerRequestId: outcome.providerRequestId,
      errorCode: outcome.errorCode,
      errorMessage: outcome.errorMessage,
      retryable: outcome.retryable,
      responseSummary: outcome.responseSummary,
      outcomeKind: outcome.outcomeKind,
    };

    const completeBase = {
      userId: input.userId,
      shipmentMatchId: matchId,
      attemptId: row.reserve.attemptId!,
      executionToken: row.executionToken,
      now,
    };

    const externallyPosted = outcome.externallyPosted === true;
    let dispatch: ShipmentTransmissionPersistResult | null = null;
    let complete: ShipmentTransmissionPersistResult;
    let piiClear: PersistedShipmentPiiClearInfo | undefined;

    if (!externallyPosted) {
      // 실제 POST 없음 → dispatchedAt 남기지 않음
      const withoutDispatchOutcome =
        outcome.outcomeKind === 'success' ? 'success' : 'failure';
      complete = await completeTransmissionAttemptWithoutExternalDispatch(
        input.persistClient,
        {
          ...completeBase,
          outcome: withoutDispatchOutcome,
          errorCode: outcome.errorCode,
          errorMessage: outcome.errorMessage,
          responseSummary: outcome.responseSummary,
        },
      );
      completed.push({
        matchId,
        success: complete.success && outcome.outcomeKind === 'success',
        adapterCalled: true,
        candidate: row.entry.candidate,
        reserve: row.reserve,
        dispatch: null,
        complete,
        adapterResult,
        outcomeKind: outcome.outcomeKind === 'success' ? 'success' : 'failure',
        piiClear,
      });

      if (
        complete.success &&
        outcome.outcomeKind === 'success' &&
        input.piiClearClient &&
        row.entry.candidate.orderSyncOrderId
      ) {
        try {
          const clearResult = await clearTransmittedOrderPiiIfComplete(input.piiClearClient, {
            userId: input.userId,
            orderSyncOrderId: row.entry.candidate.orderSyncOrderId,
            now,
          });
          piiClear = {
            status: clearResult.skippedIncomplete ? 'skipped_incomplete' : 'cleared',
          };
          completed[completed.length - 1]!.piiClear = piiClear;
        } catch (error) {
          completed[completed.length - 1]!.piiClear = {
            status: 'failed',
            failureCode: toSafePiiClearFailureCode(error),
          };
        }
      }
      continue;
    }

    dispatch = await markTransmissionAttemptDispatched(input.persistClient, {
      ...completeBase,
      now,
    });
    if (!dispatch.success) {
      completed.push({
        matchId,
        success: false,
        adapterCalled: true,
        candidate: row.entry.candidate,
        reserve: row.reserve,
        dispatch,
        complete: null,
        adapterResult,
        outcomeKind: 'unknown',
      });
      continue;
    }

    if (outcome.outcomeKind === 'success') {
      complete = await completeTransmissionAttemptSuccess(input.persistClient, {
        ...completeBase,
        providerRequestId: outcome.providerRequestId,
        responseSummary: outcome.responseSummary,
      });
      if (
        complete.success &&
        input.piiClearClient &&
        row.entry.candidate.orderSyncOrderId
      ) {
        try {
          const clearResult = await clearTransmittedOrderPiiIfComplete(input.piiClearClient, {
            userId: input.userId,
            orderSyncOrderId: row.entry.candidate.orderSyncOrderId,
            now,
          });
          piiClear = {
            status: clearResult.skippedIncomplete ? 'skipped_incomplete' : 'cleared',
          };
        } catch (error) {
          piiClear = {
            status: 'failed',
            failureCode: toSafePiiClearFailureCode(error),
          };
        }
      }
    } else if (outcome.outcomeKind === 'unknown') {
      complete = await completeTransmissionAttemptUnknown(input.persistClient, {
        ...completeBase,
        errorCode: outcome.errorCode,
        errorMessage: outcome.errorMessage,
        providerRequestId: outcome.providerRequestId,
        responseSummary: outcome.responseSummary,
      });
    } else {
      complete = await completeTransmissionAttemptFailure(input.persistClient, {
        ...completeBase,
        errorCode: outcome.errorCode,
        errorMessage: outcome.errorMessage,
        retryable: outcome.retryable,
        providerRequestId: outcome.providerRequestId,
        responseSummary: outcome.responseSummary,
      });
    }

    completed.push({
      matchId,
      success: complete.success && outcome.outcomeKind === 'success',
      adapterCalled: true,
      candidate: row.entry.candidate,
      reserve: row.reserve,
      dispatch,
      complete,
      adapterResult,
      outcomeKind: outcome.outcomeKind,
      piiClear,
    });
  }

  return [...earlyResults, ...completed];
}
