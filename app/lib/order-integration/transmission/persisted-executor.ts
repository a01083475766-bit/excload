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
  createShipmentTransmissionExecutionToken,
  markTransmissionAttemptDispatched,
  reserveTransmissionAttempt,
  SHIPMENT_TRANSMISSION_LEASE_MS,
  type ShipmentTransmissionPersistClient,
  type ShipmentTransmissionPersistResult,
} from '@/app/lib/order-integration/transmission/repository';
import type {
  ShipmentTransmissionAdapter,
  ShipmentTransmissionAdapterOutcomeKind,
  ShipmentTransmissionAdapterResult,
  ShipmentTransmissionCandidate,
} from '@/app/lib/order-integration/transmission/types';

export type PersistedShipmentPiiClearStatus =
  | 'cleared'
  | 'skipped_incomplete'
  | 'failed';

export type PersistedShipmentPiiClearInfo = {
  status: PersistedShipmentPiiClearStatus;
  /** Prisma code / Error.name 등 — 메시지·PII·몰 주문번호 없음 */
  failureCode?: string;
};

export type PersistedShipmentTransmissionResult = {
  success: boolean;
  adapterCalled: boolean;
  candidate: ShipmentTransmissionCandidate;
  reserve: ShipmentTransmissionPersistResult;
  dispatch: ShipmentTransmissionPersistResult | null;
  complete: ShipmentTransmissionPersistResult | null;
  adapterResult: ShipmentTransmissionAdapterResult | null;
  outcomeKind: ShipmentTransmissionAdapterOutcomeKind | null;
  /** 전송 성공 persist 이후 PII 정리 결과(실패해도 success에 영향 없음) */
  piiClear?: PersistedShipmentPiiClearInfo;
};

export type RunPersistedShipmentTransmissionInput = {
  userId: string;
  candidate: ShipmentTransmissionCandidate;
  adapter: ShipmentTransmissionAdapter;
  persistClient: ShipmentTransmissionPersistClient;
  now?: Date;
  leaseMs?: number;
  executionTokenFactory?: () => string;
  /** 전송 성공 후 연관 PII 정리(업로드 행·후보 JSON). 미주입 시 생략(cron 보완). */
  piiClearClient?: ClearTransmittedOrderPiiClient;
};

function resolveOutcomeKind(
  result: ShipmentTransmissionAdapterResult,
): ShipmentTransmissionAdapterOutcomeKind {
  if (result.outcomeKind) return result.outcomeKind;
  return result.success ? 'success' : 'failure';
}

/** 로그·결과용 — 원본 메시지/PII/몰 주문번호 제외 */
export function toSafePiiClearFailureCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === 'string' && code.trim()) return code.trim().slice(0, 64);
  }
  if (error instanceof Error && error.name.trim()) {
    return error.name.trim().slice(0, 64);
  }
  return 'PII_CLEAR_FAILED';
}

function logSafePiiClearFailure(input: {
  failureCode: string;
  userId: string;
  orderSyncOrderId: string;
  matchId: string;
  attemptId: string | null;
}): void {
  console.error('[ShipmentTransmissionPiiClear]', {
    code: 'PII_CLEAR_FAILED',
    failureCode: input.failureCode,
    userId: input.userId,
    orderSyncOrderId: input.orderSyncOrderId,
    matchId: input.matchId,
    attemptId: input.attemptId,
  });
}

/**
 * lease 예약 → dispatch → adapter(TX 밖) → complete.
 * 실 DB·네트워크 없이 mock client/adapter로 검증 가능.
 */
export async function runPersistedShipmentTransmission(
  input: RunPersistedShipmentTransmissionInput,
): Promise<PersistedShipmentTransmissionResult> {
  const now = input.now ?? new Date();
  const leaseMs = input.leaseMs ?? SHIPMENT_TRANSMISSION_LEASE_MS;
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const executionToken = createShipmentTransmissionExecutionToken(
    input.executionTokenFactory,
  );

  // adapter는 DI로 주입됨. transmit 없으면 lease/Attempt를 만들지 않음.
  if (typeof input.adapter?.transmit !== 'function') {
    return {
      success: false,
      adapterCalled: false,
      candidate: input.candidate,
      reserve: {
        success: false,
        reasonCode: 'PERSISTENCE_ERROR',
        shipmentMatchId: input.candidate.matchId,
        attemptId: null,
        attemptNo: null,
        executionToken: null,
        previousStatus: null,
        nextStatus: null,
        reasonMessage: 'ADAPTER_NOT_REGISTERED',
      },
      dispatch: null,
      complete: null,
      adapterResult: null,
      outcomeKind: null,
    };
  }

  const fingerprint = buildShipmentTransmissionFingerprint({
    fingerprintVersion: SHIPMENT_TRANSMISSION_FINGERPRINT_VERSION,
    userId: input.userId,
    provider: input.candidate.provider,
    integrationAccountId: input.candidate.integrationAccountId,
    shipmentMatchId: input.candidate.matchId,
    orderSyncOrderId: input.candidate.orderSyncOrderId,
    mallOrderNo: input.candidate.mallOrderNo,
    mallLineItemIds: input.candidate.mallLineItemIds,
    trackingNumber: input.candidate.trackingNumber,
    courierCode: input.candidate.courierCode,
    courierName: input.candidate.courierName,
  });

  const reserve = await reserveTransmissionAttempt(input.persistClient, {
    userId: input.userId,
    candidate: input.candidate,
    payloadFingerprint: fingerprint,
    fingerprintVersion: SHIPMENT_TRANSMISSION_FINGERPRINT_VERSION,
    executionToken,
    now,
    leaseExpiresAt,
  });

  if (!reserve.success || !reserve.attemptId) {
    return {
      success: false,
      adapterCalled: false,
      candidate: input.candidate,
      reserve,
      dispatch: null,
      complete: null,
      adapterResult: null,
      outcomeKind: null,
    };
  }

  const dispatch = await markTransmissionAttemptDispatched(input.persistClient, {
    userId: input.userId,
    shipmentMatchId: input.candidate.matchId,
    attemptId: reserve.attemptId,
    executionToken,
    now,
  });

  if (!dispatch.success) {
    return {
      success: false,
      adapterCalled: false,
      candidate: input.candidate,
      reserve,
      dispatch,
      complete: null,
      adapterResult: null,
      outcomeKind: null,
    };
  }

  let adapterResult: ShipmentTransmissionAdapterResult;
  try {
    adapterResult = await input.adapter.transmit(input.candidate);
  } catch (error) {
    // dispatch 이후 throw → 외부 접수 여부 불명 → UNKNOWN
    const message = error instanceof Error ? error.message : 'adapter threw';
    const complete = await completeTransmissionAttemptUnknown(input.persistClient, {
      userId: input.userId,
      shipmentMatchId: input.candidate.matchId,
      attemptId: reserve.attemptId,
      executionToken,
      now,
      errorCode: 'ADAPTER_EXECUTION_ERROR',
      errorMessage: message,
      providerRequestId: null,
      responseSummary: {
        providerStatusCode: 'ADAPTER_THROW',
        message: 'adapter threw after dispatch',
      },
    });
    return {
      success: false,
      adapterCalled: true,
      candidate: input.candidate,
      reserve,
      dispatch,
      complete,
      adapterResult: null,
      outcomeKind: 'unknown',
    };
  }

  const outcomeKind = resolveOutcomeKind(adapterResult);
  const completeBase = {
    userId: input.userId,
    shipmentMatchId: input.candidate.matchId,
    attemptId: reserve.attemptId,
    executionToken,
    now,
  };

  let complete: ShipmentTransmissionPersistResult;
  let piiClear: PersistedShipmentPiiClearInfo | undefined;
  if (outcomeKind === 'success') {
    complete = await completeTransmissionAttemptSuccess(input.persistClient, {
      ...completeBase,
      providerRequestId: adapterResult.providerRequestId,
      responseSummary: adapterResult.responseSummary,
    });
    if (
      complete.success &&
      input.piiClearClient &&
      input.candidate.orderSyncOrderId
    ) {
      try {
        const clearResult = await clearTransmittedOrderPiiIfComplete(input.piiClearClient, {
          userId: input.userId,
          orderSyncOrderId: input.candidate.orderSyncOrderId,
          now,
        });
        piiClear = {
          status: clearResult.skippedIncomplete ? 'skipped_incomplete' : 'cleared',
        };
      } catch (error) {
        const failureCode = toSafePiiClearFailureCode(error);
        logSafePiiClearFailure({
          failureCode,
          userId: input.userId,
          orderSyncOrderId: input.candidate.orderSyncOrderId,
          matchId: input.candidate.matchId,
          attemptId: reserve.attemptId,
        });
        piiClear = { status: 'failed', failureCode };
      }
    }
  } else if (outcomeKind === 'unknown') {
    complete = await completeTransmissionAttemptUnknown(input.persistClient, {
      ...completeBase,
      errorCode: adapterResult.errorCode,
      errorMessage: adapterResult.errorMessage,
      providerRequestId: adapterResult.providerRequestId,
      responseSummary: adapterResult.responseSummary,
    });
  } else {
    complete = await completeTransmissionAttemptFailure(input.persistClient, {
      ...completeBase,
      errorCode: adapterResult.errorCode,
      errorMessage: adapterResult.errorMessage,
      retryable: adapterResult.retryable,
      providerRequestId: adapterResult.providerRequestId,
      responseSummary: adapterResult.responseSummary,
    });
  }

  return {
    success: complete.success && outcomeKind === 'success',
    adapterCalled: true,
    candidate: input.candidate,
    reserve,
    dispatch,
    complete,
    adapterResult,
    outcomeKind,
    piiClear,
  };
}
