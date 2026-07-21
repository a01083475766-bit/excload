/**
 * Mock transmit orchestration (DI). No Prisma singleton / route / fetch / decrypt.
 */

import type {
  OrderIntegrationProvider,
  OrderSyncTransmissionStatus,
  ShipmentUploadBatchStatus,
  ShipmentUserConfirmationStatus,
} from '@prisma/client';

import { SHIPMENT_UPLOAD_BATCH_READY_STATUS } from '@/app/lib/order-integration/shipments/refresh-shipment-upload-batch-ready-status';
import {
  evaluateShipmentTransmissionEligibility,
  type TransmissionEligibilityBatchInput,
  type TransmissionEligibilityMatchInput,
  type TransmissionEligibilityOrderInput,
} from '@/app/lib/order-integration/transmission/eligibility';
import {
  evaluateMockTransmitGuard,
  type MockTransmitGuardEnvInput,
  type MockTransmitGuardResult,
} from '@/app/lib/order-integration/transmission/mock-transmit-guard';
import type { ParsedTransmitMockBody } from '@/app/lib/order-integration/transmission/parse-transmit-mock-body';
import type {
  PersistedShipmentTransmissionResult,
  RunPersistedShipmentTransmissionInput,
} from '@/app/lib/order-integration/transmission/persisted-executor';
import type {
  ShipmentTransmissionAdapter,
  ShipmentTransmissionCandidate,
} from '@/app/lib/order-integration/transmission/types';

export type MockTransmitSkipReasonCode =
  | 'MATCH_NOT_FOUND'
  | 'MATCH_NOT_READY_FOR_EXECUTION'
  | 'MATCH_ALREADY_SENT'
  | 'MATCH_UNKNOWN_REQUIRES_RECONCILIATION'
  | 'BATCH_NOT_READY'
  | NonNullable<
      ReturnType<typeof evaluateShipmentTransmissionEligibility>['reasonCode']
    >;

export type MockTransmitMatchResult = {
  matchId: string;
  /** 예약·완료된 Attempt id. 스킵/미예약이면 null. B(상태 확인)용. */
  attemptId: string | null;
  attempted: boolean;
  previousStatus: string | null;
  nextStatus: string | null;
  success: boolean;
  retryable: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  providerRequestId: string | null;
  requiresRetryPreparation: boolean;
};

export type MockTransmitServiceSummary = {
  requestedCount: number;
  evaluatedCount: number;
  attemptedCount: number;
  successCount: number;
  failureCount: number;
  unknownCount: number;
  skippedCount: number;
  retryableFailureCount: number;
  duplicateMatchIdCount: number;
  missingMatchIdCount: number;
};

export type MockTransmitServiceSuccessBody = {
  mock: true;
  batchId: string;
  summary: MockTransmitServiceSummary;
  results: MockTransmitMatchResult[];
};

export type MockTransmitServiceFailure = {
  ok: false;
  status: 403 | 404 | 409 | 500;
  reasonCode: string;
  safeMessage: string;
};

export type MockTransmitServiceSuccess = {
  ok: true;
  body: MockTransmitServiceSuccessBody;
};

export type MockTransmitServiceResult = MockTransmitServiceFailure | MockTransmitServiceSuccess;

export type MockTransmitBatchRecord = {
  id: string;
  userId: string;
  provider: OrderIntegrationProvider | null;
  integrationAccountId: string | null;
  status: ShipmentUploadBatchStatus;
  originalFileName: string;
};

export type MockTransmitMatchRecord = {
  id: string;
  userId: string;
  uploadBatchId: string;
  provider: OrderIntegrationProvider | null;
  integrationAccountId: string | null;
  userConfirmationStatus: ShipmentUserConfirmationStatus;
  transmissionStatus: OrderSyncTransmissionStatus;
  orderSyncOrderId: string | null;
  finalTrackingNumber: string | null;
  finalCarrierCode: string | null;
  finalCarrierName: string | null;
  uploadRow: {
    trackingNumber: string;
    carrierCode: string | null;
    carrierName: string | null;
  };
  orderSyncOrder: {
    id: string;
    userId: string;
    provider: OrderIntegrationProvider;
    integrationAccountId: string | null;
    mallOrderNo: string;
    excloadOrderNo: string;
    mallLineItemIds: unknown;
  } | null;
};

/** Read-only DI contract — Prisma impl deferred to D-6h-c */
export type MockTransmitReadRepository = {
  findBatchForMockTransmit(input: {
    batchId: string;
    userId: string;
  }): Promise<MockTransmitBatchRecord | null>;
  findMatchesForMockTransmit(input: {
    batchId: string;
    userId: string;
    matchIds: string[];
  }): Promise<MockTransmitMatchRecord[]>;
  /**
   * Optional non-decrypting credential marker for linked account.
   * If omitted and batch.integrationAccountId is set, service treats as blocked
   * unless resolveCredentialConfigured returns false explicitly.
   */
  resolveCredentialConfigured?(input: {
    userId: string;
    integrationAccountId: string;
  }): Promise<boolean>;
};

export type RunPersistedShipmentTransmissionFn = (
  input: RunPersistedShipmentTransmissionInput,
) => Promise<PersistedShipmentTransmissionResult>;

export type EvaluateMockTransmitGuardFn = typeof evaluateMockTransmitGuard;

export type MockTransmitServiceDeps = {
  env: MockTransmitGuardEnvInput;
  readRepository: MockTransmitReadRepository;
  resolveAdapter: (input: {
    provider: OrderIntegrationProvider;
  }) => ShipmentTransmissionAdapter;
  persistClient: RunPersistedShipmentTransmissionInput['persistClient'];
  runPersisted: RunPersistedShipmentTransmissionFn;
  evaluateGuard?: EvaluateMockTransmitGuardFn;
  now?: Date;
};

export type RunMockTransmitServiceInput = {
  userId: string;
  batchId: string;
  parsedBody: ParsedTransmitMockBody;
};

function skippedResult(
  matchId: string,
  errorCode: string,
  errorMessage: string,
  previousStatus: string | null = null,
): MockTransmitMatchResult {
  return {
    matchId,
    attemptId: null,
    attempted: false,
    previousStatus,
    nextStatus: previousStatus,
    success: false,
    retryable: false,
    errorCode,
    errorMessage,
    providerRequestId: null,
    requiresRetryPreparation: false,
  };
}

function mapSkipReason(
  status: OrderSyncTransmissionStatus,
  eligibilityCode: string | null,
): { code: string; message: string } {
  if (status === 'SENT' || eligibilityCode === 'ALREADY_SENT') {
    return {
      code: 'MATCH_ALREADY_SENT',
      message: 'Already sent matches cannot be mock-transmitted.',
    };
  }
  if (status === 'UNKNOWN') {
    return {
      code: 'MATCH_UNKNOWN_REQUIRES_RECONCILIATION',
      message: 'Unknown matches require reconciliation before transmit.',
    };
  }
  if (status === 'NONE' || status === 'FAILED') {
    return {
      code: 'MATCH_NOT_READY_FOR_EXECUTION',
      message: 'Only READY matches can be mock-transmitted.',
    };
  }
  if (eligibilityCode) {
    return {
      code: eligibilityCode,
      message: 'Match is not eligible for mock transmit.',
    };
  }
  return {
    code: 'MATCH_NOT_READY_FOR_EXECUTION',
    message: 'Only READY matches can be mock-transmitted.',
  };
}

function toEligibilityMatch(row: MockTransmitMatchRecord): TransmissionEligibilityMatchInput {
  return {
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
    uploadRow: {
      trackingNumber: row.uploadRow.trackingNumber,
      carrierCode: row.uploadRow.carrierCode,
      carrierName: row.uploadRow.carrierName,
    },
  };
}

function toEligibilityOrder(
  row: MockTransmitMatchRecord['orderSyncOrder'],
): TransmissionEligibilityOrderInput | null {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    integrationAccountId: row.integrationAccountId,
    mallOrderNo: row.mallOrderNo,
    excloadOrderNo: row.excloadOrderNo,
    mallLineItemIds: row.mallLineItemIds,
  };
}

function mapPersistedToResult(
  matchId: string,
  previousStatus: string | null,
  persisted: PersistedShipmentTransmissionResult,
): MockTransmitMatchResult {
  const complete = persisted.complete;
  const reserve = persisted.reserve;
  const outcomeKind = persisted.outcomeKind;
  const adapter = persisted.adapterResult;

  const attemptId = complete?.attemptId ?? reserve.attemptId ?? null;

  if (!persisted.adapterCalled) {
    return {
      matchId,
      attemptId,
      attempted: false,
      previousStatus: reserve.previousStatus ?? previousStatus,
      nextStatus: reserve.nextStatus ?? reserve.previousStatus ?? previousStatus,
      success: false,
      retryable: false,
      errorCode: reserve.reasonCode ?? 'RESERVE_FAILED',
      errorMessage: reserve.reasonMessage ?? 'Unable to reserve transmission attempt.',
      providerRequestId: null,
      requiresRetryPreparation: false,
    };
  }

  const nextStatus = complete?.nextStatus ?? null;
  const success = outcomeKind === 'success' && Boolean(complete?.success);
  const retryable = adapter?.retryable === true && outcomeKind === 'failure';

  return {
    matchId,
    attemptId,
    attempted: true,
    previousStatus: reserve.previousStatus ?? previousStatus,
    nextStatus,
    success,
    retryable,
    errorCode: success
      ? null
      : (adapter?.errorCode ?? complete?.reasonCode ?? 'TRANSMIT_FAILED'),
    errorMessage: success
      ? null
      : (adapter?.errorMessage ?? complete?.reasonMessage ?? 'Mock transmit failed.'),
    providerRequestId: adapter?.providerRequestId ?? null,
    requiresRetryPreparation: false,
  };
}

function summarize(results: MockTransmitMatchResult[], parsed: ParsedTransmitMockBody, missing: number): MockTransmitServiceSummary {
  let successCount = 0;
  let failureCount = 0;
  let unknownCount = 0;
  let skippedCount = 0;
  let retryableFailureCount = 0;
  let attemptedCount = 0;

  for (const row of results) {
    if (!row.attempted) {
      skippedCount += 1;
      continue;
    }
    attemptedCount += 1;
    if (row.success) {
      successCount += 1;
      continue;
    }
    if (row.errorCode === 'MOCK_UNKNOWN_RESULT' || row.nextStatus === 'UNKNOWN') {
      unknownCount += 1;
      continue;
    }
    failureCount += 1;
    if (row.retryable) retryableFailureCount += 1;
  }

  return {
    requestedCount: parsed.requestedCount,
    evaluatedCount: results.length,
    attemptedCount,
    successCount,
    failureCount,
    unknownCount,
    skippedCount,
    retryableFailureCount,
    duplicateMatchIdCount: parsed.duplicateMatchIdCount,
    missingMatchIdCount: missing,
  };
}

/**
 * Orchestrate mock transmit for explicit matchIds.
 * Production / feature / allowlist checked before any DB read.
 */
export async function runMockTransmitService(
  deps: MockTransmitServiceDeps,
  input: RunMockTransmitServiceInput,
): Promise<MockTransmitServiceResult> {
  const evaluateGuard = deps.evaluateGuard ?? evaluateMockTransmitGuard;

  const preDb = evaluateGuard({
    env: deps.env,
    authenticatedUserId: input.userId,
  });
  if (!preDb.allowed) {
    return {
      ok: false,
      status: 403,
      reasonCode: preDb.reasonCode ?? 'MOCK_FEATURE_DISABLED',
      safeMessage: preDb.safeMessage,
    };
  }

  let batch: MockTransmitBatchRecord | null;
  try {
    batch = await deps.readRepository.findBatchForMockTransmit({
      batchId: input.batchId,
      userId: input.userId,
    });
  } catch {
    return {
      ok: false,
      status: 500,
      reasonCode: 'MOCK_BATCH_READ_FAILED',
      safeMessage: 'Mock transmit could not load the upload batch.',
    };
  }

  if (!batch) {
    return {
      ok: false,
      status: 404,
      reasonCode: 'BATCH_NOT_FOUND',
      safeMessage: '업로드 배치를 찾을 수 없습니다.',
    };
  }

  let credentialConfigured = false;
  if (batch.integrationAccountId && deps.readRepository.resolveCredentialConfigured) {
    try {
      credentialConfigured = await deps.readRepository.resolveCredentialConfigured({
        userId: input.userId,
        integrationAccountId: batch.integrationAccountId,
      });
    } catch {
      return {
        ok: false,
        status: 500,
        reasonCode: 'MOCK_ACCOUNT_READ_FAILED',
        safeMessage: 'Mock transmit could not verify account markers.',
      };
    }
  }
  // Without resolver: do not infer credential from id alone (IT fixtures use account id + null ciphers).
  // D-6h-c route must wire resolveCredentialConfigured for production safety.

  const postBatch: MockTransmitGuardResult = evaluateGuard({
    env: deps.env,
    authenticatedUserId: input.userId,
    batch: {
      id: batch.id,
      originalFileName: batch.originalFileName,
      integrationAccountId: batch.integrationAccountId,
    },
    credentialConfigured,
  });
  if (!postBatch.allowed) {
    return {
      ok: false,
      status: 403,
      reasonCode: postBatch.reasonCode ?? 'MOCK_TEST_BATCH_REQUIRED',
      safeMessage: postBatch.safeMessage,
    };
  }

  if (batch.status !== SHIPMENT_UPLOAD_BATCH_READY_STATUS) {
    return {
      ok: false,
      status: 409,
      reasonCode: 'BATCH_NOT_READY',
      safeMessage: 'READY 상태의 배치만 mock 송장전송을 실행할 수 있습니다.',
    };
  }

  let matches: MockTransmitMatchRecord[];
  try {
    matches = await deps.readRepository.findMatchesForMockTransmit({
      batchId: input.batchId,
      userId: input.userId,
      matchIds: input.parsedBody.matchIds,
    });
  } catch {
    return {
      ok: false,
      status: 500,
      reasonCode: 'MOCK_MATCH_READ_FAILED',
      safeMessage: 'Mock transmit could not load matches.',
    };
  }

  const byId = new Map(matches.map((m) => [m.id, m]));
  const missingMatchIdCount = input.parsedBody.matchIds.filter((id) => !byId.has(id)).length;

  const batchInput: TransmissionEligibilityBatchInput = {
    id: batch.id,
    userId: batch.userId,
    status: batch.status,
    provider: batch.provider,
    integrationAccountId: batch.integrationAccountId,
  };

  const results: MockTransmitMatchResult[] = [];

  for (const matchId of input.parsedBody.matchIds) {
    const row = byId.get(matchId);
    if (!row) {
      results.push(
        skippedResult(matchId, 'MATCH_NOT_FOUND', '매칭을 찾을 수 없습니다.'),
      );
      continue;
    }

    const eligibility = evaluateShipmentTransmissionEligibility({
      batch: batchInput,
      match: toEligibilityMatch(row),
      order: toEligibilityOrder(row.orderSyncOrder),
      options: { retryFailed: false },
    });

    if (!eligibility.eligible || !eligibility.candidate) {
      const mapped = mapSkipReason(row.transmissionStatus, eligibility.reasonCode);
      results.push(
        skippedResult(
          matchId,
          mapped.code,
          eligibility.reasonMessage ?? mapped.message,
          row.transmissionStatus,
        ),
      );
      continue;
    }

    // Extra READY-only gate (eligibility also allows NONE)
    if (row.transmissionStatus !== 'READY') {
      const mapped = mapSkipReason(row.transmissionStatus, eligibility.reasonCode);
      results.push(
        skippedResult(matchId, mapped.code, mapped.message, row.transmissionStatus),
      );
      continue;
    }

    const candidate: ShipmentTransmissionCandidate = eligibility.candidate;
    if (!batch.provider && !candidate.provider) {
      results.push(
        skippedResult(
          matchId,
          'PROVIDER_MISSING',
          '쇼핑몰(provider) 정보가 없습니다.',
          row.transmissionStatus,
        ),
      );
      continue;
    }

    const adapter = deps.resolveAdapter({ provider: candidate.provider });
    let persisted: PersistedShipmentTransmissionResult;
    try {
      persisted = await deps.runPersisted({
        userId: input.userId,
        candidate,
        adapter,
        persistClient: deps.persistClient,
        now: deps.now,
      });
    } catch {
      results.push({
        matchId,
        attemptId: null,
        attempted: true,
        previousStatus: row.transmissionStatus,
        nextStatus: null,
        success: false,
        retryable: false,
        errorCode: 'MOCK_PERSIST_INFRA_ERROR',
        errorMessage: 'Mock transmit infrastructure error.',
        providerRequestId: null,
        requiresRetryPreparation: false,
      });
      continue;
    }

    results.push(mapPersistedToResult(matchId, row.transmissionStatus, persisted));
  }

  const summary = summarize(results, input.parsedBody, missingMatchIdCount);

  return {
    ok: true,
    body: {
      mock: true,
      batchId: batch.id,
      summary,
      results,
    },
  };
}
