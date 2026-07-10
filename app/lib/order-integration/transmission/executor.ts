import { evaluateShipmentTransmissionTransition } from '@/app/lib/order-integration/transmission/state-machine';
import type { ShipmentTransmissionAdapterRegistry } from '@/app/lib/order-integration/transmission/adapter-registry';
import type {
  ShipmentMatchTransmissionStatus,
  ShipmentTransmissionAdapter,
  ShipmentTransmissionBatchExecutionResult,
  ShipmentTransmissionCandidate,
  ShipmentTransmissionExecutionResult,
} from '@/app/lib/order-integration/transmission/types';

export type ShipmentTransmissionExecuteItem = {
  candidate: ShipmentTransmissionCandidate;
  /** ShipmentMatch.transmissionStatus 현재값 */
  previousStatus: ShipmentMatchTransmissionStatus;
};

export type ExecuteShipmentTransmissionOptions = {
  registry: ShipmentTransmissionAdapterRegistry;
};

function buildSkippedResult(input: {
  candidate: ShipmentTransmissionCandidate;
  previousStatus: ShipmentMatchTransmissionStatus;
  errorCode: string;
  errorMessage: string;
}): ShipmentTransmissionExecutionResult {
  return {
    success: false,
    provider: input.candidate.provider,
    matchId: input.candidate.matchId,
    previousStatus: input.previousStatus,
    nextStatus: input.previousStatus,
    adapterCalled: false,
    providerRequestId: null,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    retryable: false,
    responseSummary: null,
  };
}

function canCallAdapter(previousStatus: ShipmentMatchTransmissionStatus): boolean {
  // 실제 전송 호출은 READY에서만 (READY → SENT | FAILED)
  return previousStatus === 'READY';
}

/**
 * 단건 송장전송 실행. DB를 변경하지 않음 — nextStatus 힌트만 반환.
 */
export async function executeShipmentTransmission(
  item: ShipmentTransmissionExecuteItem,
  options: ExecuteShipmentTransmissionOptions,
): Promise<ShipmentTransmissionExecutionResult> {
  const { candidate, previousStatus } = item;
  const { registry } = options;

  if (!canCallAdapter(previousStatus)) {
    return buildSkippedResult({
      candidate,
      previousStatus,
      errorCode: 'TRANSMISSION_NOT_ALLOWED',
      errorMessage: `현재 상태(${previousStatus})에서는 송장전송을 실행할 수 없습니다.`,
    });
  }

  const adapter: ShipmentTransmissionAdapter | null = registry.get(candidate.provider);
  if (!adapter) {
    return buildSkippedResult({
      candidate,
      previousStatus,
      errorCode: 'ADAPTER_NOT_REGISTERED',
      errorMessage: `provider ${candidate.provider} 용 adapter가 등록되지 않았습니다.`,
    });
  }

  let adapterResult;
  try {
    adapterResult = await adapter.transmit(candidate);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'adapter execution threw an unknown error';
    return {
      success: false,
      provider: candidate.provider,
      matchId: candidate.matchId,
      previousStatus,
      nextStatus: 'FAILED',
      adapterCalled: true,
      providerRequestId: null,
      errorCode: 'ADAPTER_EXECUTION_ERROR',
      errorMessage: message,
      retryable: true,
      responseSummary: {
        httpStatus: null,
        providerStatusCode: 'ADAPTER_THROW',
        providerRequestId: null,
        message: 'adapter threw; normalized by executor',
      },
    };
  }

  const nextStatus: ShipmentMatchTransmissionStatus = adapterResult.success
    ? 'SENT'
    : 'FAILED';
  const transition = evaluateShipmentTransmissionTransition(previousStatus, nextStatus);
  if (!transition.ok) {
    return {
      success: false,
      provider: candidate.provider,
      matchId: candidate.matchId,
      previousStatus,
      nextStatus: previousStatus,
      adapterCalled: true,
      providerRequestId: adapterResult.providerRequestId,
      errorCode: 'TRANSMISSION_NOT_ALLOWED',
      errorMessage: transition.reasonMessage,
      retryable: false,
      responseSummary: adapterResult.responseSummary,
    };
  }

  return {
    success: adapterResult.success,
    provider: candidate.provider,
    matchId: candidate.matchId,
    previousStatus,
    nextStatus,
    adapterCalled: true,
    providerRequestId: adapterResult.providerRequestId,
    errorCode: adapterResult.errorCode,
    errorMessage: adapterResult.errorMessage,
    retryable: adapterResult.retryable,
    responseSummary: adapterResult.responseSummary,
  };
}

function summarizeBatch(
  results: ShipmentTransmissionExecutionResult[],
): ShipmentTransmissionBatchExecutionResult {
  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;
  let retryableFailureCount = 0;

  for (const result of results) {
    if (result.success) {
      successCount += 1;
      continue;
    }

    // skipped: 중복 입력 또는 현재 상태상 실행 불가 (adapter 미호출)
    if (
      result.errorCode === 'DUPLICATE_MATCH_ID' ||
      result.errorCode === 'TRANSMISSION_NOT_ALLOWED'
    ) {
      skippedCount += 1;
      continue;
    }

    // failure: adapter 실패·throw·미등록 등
    failureCount += 1;
    if (result.retryable) {
      retryableFailureCount += 1;
    }
  }

  return {
    totalCount: results.length,
    successCount,
    failureCount,
    skippedCount,
    retryableFailureCount,
    results,
  };
}

/**
 * 배치 송장전송. 한 건 실패가 전체를 중단하지 않음.
 * 동일 matchId는 첫 번째만 실행, 이후는 DUPLICATE_MATCH_ID.
 */
export async function executeShipmentTransmissionBatch(
  items: ReadonlyArray<ShipmentTransmissionExecuteItem>,
  options: ExecuteShipmentTransmissionOptions,
): Promise<ShipmentTransmissionBatchExecutionResult> {
  const results: ShipmentTransmissionExecutionResult[] = [];
  const seenMatchIds = new Set<string>();

  for (const item of items) {
    const matchId = item.candidate.matchId;
    if (seenMatchIds.has(matchId)) {
      results.push(
        buildSkippedResult({
          candidate: item.candidate,
          previousStatus: item.previousStatus,
          errorCode: 'DUPLICATE_MATCH_ID',
          errorMessage: `matchId ${matchId} 는 배치에서 이미 실행되었습니다.`,
        }),
      );
      continue;
    }
    seenMatchIds.add(matchId);

    try {
      results.push(await executeShipmentTransmission(item, options));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'unexpected executor error';
      results.push({
        success: false,
        provider: item.candidate.provider,
        matchId,
        previousStatus: item.previousStatus,
        nextStatus: item.previousStatus === 'READY' ? 'FAILED' : item.previousStatus,
        adapterCalled: false,
        providerRequestId: null,
        errorCode: 'ADAPTER_EXECUTION_ERROR',
        errorMessage: message,
        retryable: true,
        responseSummary: null,
      });
    }
  }

  return summarizeBatch(results);
}
