import {
  buildShipmentTransmissionFingerprint,
  SHIPMENT_TRANSMISSION_FINGERPRINT_VERSION,
} from '@/app/lib/order-integration/transmission/fingerprint';
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

export type PersistedShipmentTransmissionResult = {
  success: boolean;
  adapterCalled: boolean;
  candidate: ShipmentTransmissionCandidate;
  reserve: ShipmentTransmissionPersistResult;
  dispatch: ShipmentTransmissionPersistResult | null;
  complete: ShipmentTransmissionPersistResult | null;
  adapterResult: ShipmentTransmissionAdapterResult | null;
  outcomeKind: ShipmentTransmissionAdapterOutcomeKind | null;
};

export type RunPersistedShipmentTransmissionInput = {
  userId: string;
  candidate: ShipmentTransmissionCandidate;
  adapter: ShipmentTransmissionAdapter;
  persistClient: ShipmentTransmissionPersistClient;
  now?: Date;
  leaseMs?: number;
  executionTokenFactory?: () => string;
};

function resolveOutcomeKind(
  result: ShipmentTransmissionAdapterResult,
): ShipmentTransmissionAdapterOutcomeKind {
  if (result.outcomeKind) return result.outcomeKind;
  return result.success ? 'success' : 'failure';
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
  if (outcomeKind === 'success') {
    complete = await completeTransmissionAttemptSuccess(input.persistClient, {
      ...completeBase,
      providerRequestId: adapterResult.providerRequestId,
      responseSummary: adapterResult.responseSummary,
    });
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
  };
}
