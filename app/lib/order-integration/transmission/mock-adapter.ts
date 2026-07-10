import type {
  ShipmentTransmissionAdapter,
  ShipmentTransmissionAdapterProvider,
  ShipmentTransmissionAdapterResult,
  ShipmentTransmissionCandidate,
  ShipmentTransmissionResponseSummary,
} from '@/app/lib/order-integration/transmission/types';

export type MockShipmentTransmissionOutcome =
  | 'success'
  | 'retryable_failure'
  | 'non_retryable_failure';

export type MockShipmentTransmissionAdapterOptions = {
  provider: ShipmentTransmissionAdapterProvider;
  /** 지정되지 않은 matchId 기본 동작. 기본 success */
  defaultOutcome?: MockShipmentTransmissionOutcome;
  /** matchId별 결과 오버라이드 */
  byMatchId?: Readonly<Record<string, MockShipmentTransmissionOutcome>>;
  /** 결정적 request id. 기본: mock-{provider}-{matchId} */
  requestIdFactory?: (candidate: ShipmentTransmissionCandidate) => string;
};

function buildSummary(
  outcome: MockShipmentTransmissionOutcome,
  providerRequestId: string,
): ShipmentTransmissionResponseSummary {
  if (outcome === 'success') {
    return {
      httpStatus: 200,
      providerStatusCode: 'OK',
      providerRequestId,
      message: 'mock transmission succeeded',
    };
  }
  if (outcome === 'retryable_failure') {
    return {
      httpStatus: 503,
      providerStatusCode: 'TEMPORARY_ERROR',
      providerRequestId,
      message: 'mock retryable failure',
    };
  }
  return {
    httpStatus: 400,
    providerStatusCode: 'INVALID_REQUEST',
    providerRequestId,
    message: 'mock non-retryable failure',
  };
}

function toAdapterResult(
  provider: ShipmentTransmissionAdapterProvider,
  candidate: ShipmentTransmissionCandidate,
  outcome: MockShipmentTransmissionOutcome,
  providerRequestId: string,
): ShipmentTransmissionAdapterResult {
  if (outcome === 'success') {
    return {
      success: true,
      provider,
      matchId: candidate.matchId,
      providerRequestId,
      errorCode: null,
      errorMessage: null,
      retryable: false,
      responseSummary: buildSummary(outcome, providerRequestId),
    };
  }

  if (outcome === 'retryable_failure') {
    return {
      success: false,
      provider,
      matchId: candidate.matchId,
      providerRequestId,
      errorCode: 'MOCK_RETRYABLE_FAILURE',
      errorMessage: 'mock adapter retryable failure',
      retryable: true,
      responseSummary: buildSummary(outcome, providerRequestId),
    };
  }

  return {
    success: false,
    provider,
    matchId: candidate.matchId,
    providerRequestId,
    errorCode: 'MOCK_NON_RETRYABLE_FAILURE',
    errorMessage: 'mock adapter non-retryable failure',
    retryable: false,
    responseSummary: buildSummary(outcome, providerRequestId),
  };
}

/**
 * 네트워크·난수·시계 없이 결정적 결과를 반환하는 mock adapter.
 */
export function createMockShipmentTransmissionAdapter(
  options: MockShipmentTransmissionAdapterOptions,
): ShipmentTransmissionAdapter {
  const defaultOutcome = options.defaultOutcome ?? 'success';
  const byMatchId = options.byMatchId ?? {};
  const requestIdFactory =
    options.requestIdFactory ??
    ((candidate: ShipmentTransmissionCandidate) =>
      `mock-${String(options.provider)}-${candidate.matchId}`);

  return {
    provider: options.provider,
    buildPayload(candidate) {
      return {
        matchId: candidate.matchId,
        mallOrderNo: candidate.mallOrderNo,
        trackingNumber: candidate.trackingNumber,
        courierCode: candidate.courierCode,
        courierName: candidate.courierName,
      };
    },
    async transmit(candidate) {
      const outcome = byMatchId[candidate.matchId] ?? defaultOutcome;
      const providerRequestId = requestIdFactory(candidate);
      return toAdapterResult(options.provider, candidate, outcome, providerRequestId);
    },
  };
}
