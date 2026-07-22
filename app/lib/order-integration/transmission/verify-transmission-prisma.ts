/**
 * Prisma loader / persist for transmission verify (B / SMARTSTORE-C1).
 */

import type { OrderIntegrationProvider, PrismaClient } from '@prisma/client';

import {
  parseSmartstoreItemResultsFromSummary,
} from '@/app/lib/smartstore/smartstore-batch-dispatch';
import {
  sanitizeTransmissionErrorMessage,
  toPersistedResponseSummaryJson,
} from '@/app/lib/order-integration/transmission/repository';
import type {
  PersistSmartstoreVerificationInput,
  VerifyTransmissionAttemptRecord,
  VerifyTransmissionServiceDeps,
} from '@/app/lib/order-integration/transmission/verify-transmission-status';

type VerifyPrismaClient = Pick<
  PrismaClient,
  'shipmentTransmissionAttempt' | 'orderIntegrationAccount' | 'shipmentMatch'
>;

export function createVerifyTransmissionFindAttempts(
  client: VerifyPrismaClient,
): VerifyTransmissionServiceDeps['findAttempts'] {
  return async ({ userId, batchId, attemptIds }) => {
    const rows = await client.shipmentTransmissionAttempt.findMany({
      where: {
        userId,
        uploadBatchId: batchId,
        id: { in: attemptIds },
      },
      select: {
        id: true,
        userId: true,
        uploadBatchId: true,
        shipmentMatchId: true,
        provider: true,
        integrationAccountId: true,
        status: true,
        mallOrderNo: true,
        mallLineItemIdsJson: true,
        trackingNumberNormalized: true,
        courierCode: true,
        courierName: true,
        dispatchedAt: true,
        responseSummaryJson: true,
        orderSyncOrder: {
          select: {
            mallLineItemIds: true,
            normalizedPayloadJson: true,
          },
        },
      },
    });

    return rows as VerifyTransmissionAttemptRecord[];
  };
}

export function createVerifyTransmissionAccountLoader(
  client: VerifyPrismaClient,
): VerifyTransmissionServiceDeps['loadAccount'] {
  return ({ userId, accountId, provider }) =>
    client.orderIntegrationAccount.findFirst({
      where: {
        id: accountId,
        userId,
        provider: provider as OrderIntegrationProvider,
      },
    });
}

/**
 * 읽기 전용 조회 결과를 Attempt itemResults에 반영.
 * - 기존 SUCCESS 항목 보존은 호출 측 merge 결과 사용
 * - 전부 확인 시에만 UNKNOWN → SENT / SUCCESS 승격
 * - SENT를 불확실로 강등하지 않음
 * - confirm/dispatch 호출 없음
 */
export function createPersistSmartstoreVerification(
  client: VerifyPrismaClient,
): NonNullable<VerifyTransmissionServiceDeps['persistSmartstoreVerification']> {
  return async (input: PersistSmartstoreVerificationInput) => {
    const attempt = await client.shipmentTransmissionAttempt.findFirst({
      where: {
        id: input.attemptId,
        userId: input.userId,
        shipmentMatchId: input.shipmentMatchId,
      },
      select: {
        id: true,
        status: true,
        responseSummaryJson: true,
        errorCode: true,
      },
    });
    if (!attempt) return;

    const priorItems = parseSmartstoreItemResultsFromSummary(attempt.responseSummaryJson);
    const priorSummary =
      attempt.responseSummaryJson &&
      typeof attempt.responseSummaryJson === 'object' &&
      !Array.isArray(attempt.responseSummaryJson)
        ? (attempt.responseSummaryJson as Record<string, unknown>)
        : {};

    const summaryJson = toPersistedResponseSummaryJson({
      httpStatus:
        typeof priorSummary.httpStatus === 'number' ? priorSummary.httpStatus : null,
      providerStatusCode:
        typeof priorSummary.providerStatusCode === 'string'
          ? priorSummary.providerStatusCode
          : input.allConfirmed
            ? 'VERIFIED'
            : attempt.errorCode,
      providerRequestId:
        typeof priorSummary.providerRequestId === 'string'
          ? priorSummary.providerRequestId
          : null,
      message: sanitizeTransmissionErrorMessage(
        input.allConfirmed
          ? '송장 반영 확인 완료'
          : typeof priorSummary.message === 'string'
            ? priorSummary.message
            : null,
      ),
      itemResults: input.itemResults.length > 0 ? input.itemResults : priorItems,
    });

    await client.shipmentTransmissionAttempt.update({
      where: { id: attempt.id },
      data: {
        responseSummaryJson: summaryJson,
        ...(input.allConfirmed && attempt.status === 'UNKNOWN'
          ? {
              status: 'SUCCESS' as const,
              errorCode: null,
              errorMessage: null,
              retryable: false,
              completedAt: input.now,
            }
          : {}),
      },
    });

    if (!input.allConfirmed) return;

    const match = await client.shipmentMatch.findFirst({
      where: { id: input.shipmentMatchId, userId: input.userId },
      select: { id: true, transmissionStatus: true },
    });
    if (!match) return;
    if (match.transmissionStatus === 'SENT') return;
    if (match.transmissionStatus !== 'UNKNOWN' && match.transmissionStatus !== 'FAILED') return;

    await client.shipmentMatch.update({
      where: { id: match.id },
      data: {
        transmissionStatus: 'SENT',
        transmissionErrorMessage: null,
        transmittedAt: input.now,
      },
    });
  };
}
