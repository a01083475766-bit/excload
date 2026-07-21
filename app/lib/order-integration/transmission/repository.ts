import type {
  OrderIntegrationProvider,
  OrderSyncTransmissionStatus,
  ShipmentTransmissionAttemptStatus,
} from '@prisma/client';

import {
  normalizeFingerprintTrackingNumber,
  SHIPMENT_TRANSMISSION_FINGERPRINT_VERSION,
} from '@/app/lib/order-integration/transmission/fingerprint';
import { summarizeOrderSyncTransmissionStatus } from '@/app/lib/order-integration/transmission/order-status-summary';
import { classifyPrismaPersistFailure } from '@/app/lib/order-integration/transmission/prisma-persist-error';
import type {
  ShipmentTransmissionCandidate,
  ShipmentTransmissionResponseSummary,
} from '@/app/lib/order-integration/transmission/types';

/** 기본 lease 기간 (단일 상수) */
export const SHIPMENT_TRANSMISSION_LEASE_MS = 5 * 60 * 1000;

export const TRANSMISSION_ERROR_MESSAGE_MAX_LENGTH = 500;

export type ShipmentTransmissionPersistReasonCode =
  | 'LEASE_NOT_ACQUIRED'
  | 'MATCH_NOT_READY'
  | 'LEASE_TOKEN_MISMATCH'
  | 'ATTEMPT_NOT_PENDING'
  | 'ATTEMPT_NOT_PROCESSING'
  | 'LEASE_EXPIRED'
  | 'DISPATCH_NOT_ALLOWED'
  | 'ATTEMPT_NUMBER_CONFLICT'
  | 'STALE_PENDING_RECOVERED'
  | 'STALE_PROCESSING_MARKED_UNKNOWN'
  | 'PERSISTENCE_ERROR'
  | 'STALE_RECOVERY_NOT_ALLOWED'
  | 'ORDER_SUMMARY_UPDATED'
  | 'OK';

export type ShipmentTransmissionPersistResult = {
  success: boolean;
  reasonCode: ShipmentTransmissionPersistReasonCode;
  shipmentMatchId: string;
  attemptId: string | null;
  attemptNo: number | null;
  executionToken: string | null;
  previousStatus: OrderSyncTransmissionStatus | ShipmentTransmissionAttemptStatus | null;
  nextStatus: OrderSyncTransmissionStatus | ShipmentTransmissionAttemptStatus | null;
  reasonMessage?: string;
};

export type ShipmentTransmissionAttemptRow = {
  id: string;
  userId: string;
  shipmentMatchId: string;
  orderSyncOrderId: string | null;
  uploadBatchId: string;
  provider: OrderIntegrationProvider;
  integrationAccountId: string | null;
  mallOrderNo: string;
  excloadOrderNo: string;
  mallLineItemIdsJson: unknown;
  trackingNumberNormalized: string;
  courierCode: string | null;
  courierName: string | null;
  payloadFingerprint: string;
  fingerprintVersion: number;
  attemptNo: number;
  status: ShipmentTransmissionAttemptStatus;
  providerRequestId: string | null;
  responseSummaryJson: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  executionToken: string;
  startedAt: Date;
  dispatchedAt: Date | null;
  completedAt: Date | null;
};

export type ShipmentTransmissionMatchRow = {
  id: string;
  userId: string;
  uploadBatchId: string;
  provider: OrderIntegrationProvider | null;
  integrationAccountId: string | null;
  orderSyncOrderId: string | null;
  transmissionStatus: OrderSyncTransmissionStatus;
  transmissionLeaseToken: string | null;
  transmissionLeaseExpiresAt: Date | null;
  lastTransmissionAttemptAt: Date | null;
  transmissionErrorMessage: string | null;
};

/** DI용 Prisma-like transaction client (실 DB 연결 없음 — 테스트 mock) */
export type ShipmentTransmissionPersistTx = {
  shipmentMatch: {
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
    findFirst: (args: {
      where: Record<string, unknown>;
      select?: Record<string, boolean>;
    }) => Promise<ShipmentTransmissionMatchRow | null>;
    findMany: (args: {
      where: Record<string, unknown>;
      select?: Record<string, boolean>;
    }) => Promise<Array<{ transmissionStatus: OrderSyncTransmissionStatus }>>;
  };
  shipmentTransmissionAttempt: {
    create: (args: { data: Record<string, unknown> }) => Promise<ShipmentTransmissionAttemptRow>;
    findFirst: (args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'>;
      select?: Record<string, boolean>;
    }) => Promise<ShipmentTransmissionAttemptRow | null>;
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
  orderSyncOrder: {
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
};

export type ShipmentTransmissionPersistClient = {
  $transaction: <T>(fn: (tx: ShipmentTransmissionPersistTx) => Promise<T>) => Promise<T>;
};

export function createShipmentTransmissionExecutionToken(
  factory: () => string = () => crypto.randomUUID(),
): string {
  return factory();
}

export function sanitizeTransmissionErrorMessage(message: string | null | undefined): string | null {
  if (message == null) return null;
  let text = String(message)
    .replace(/Bearer\s+\S+/gi, '[REDACTED]')
    .replace(/Authorization:\s*\S+/gi, '[REDACTED]')
    .replace(/(api[_-]?key|secret|password|token)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
    // 수취인 PII 라벨·값 (실패 Attempt responseSummaryJson 방어)
    .replace(
      /(?:receiver(?:Name|Phone|Address)|수취인(?:명)?|연락처|주소)\s*[:=：]\s*.+$/gi,
      '[REDACTED_PII]',
    )
    .replace(/\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/g, '[REDACTED_PHONE]')
    .replace(/\b\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4}\b/g, '[REDACTED_PHONE]')
    .replace(/\b\d{10,16}\b/g, '[REDACTED_NUMBER]')
    .replace(/\r?\n/g, ' ')
    .trim();
  if (!text) return null;
  if (text.length > TRANSMISSION_ERROR_MESSAGE_MAX_LENGTH) {
    text = text.slice(0, TRANSMISSION_ERROR_MESSAGE_MAX_LENGTH);
  }
  return text;
}

/** Prisma Json 저장 전 allowlist 복사 */
export function toPersistedResponseSummaryJson(
  summary: ShipmentTransmissionResponseSummary | null | undefined,
): ShipmentTransmissionResponseSummary | null {
  if (!summary || typeof summary !== 'object') return null;
  const out: ShipmentTransmissionResponseSummary = {};
  if ('httpStatus' in summary) out.httpStatus = summary.httpStatus ?? null;
  if ('providerStatusCode' in summary) {
    out.providerStatusCode = summary.providerStatusCode ?? null;
  }
  if ('providerRequestId' in summary) {
    out.providerRequestId = summary.providerRequestId ?? null;
  }
  if ('message' in summary) {
    const msg = sanitizeTransmissionErrorMessage(summary.message ?? null);
    out.message = msg;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export class TransmissionPersistRollbackError extends Error {
  readonly result: ShipmentTransmissionPersistResult;

  constructor(result: ShipmentTransmissionPersistResult) {
    super(result.reasonCode);
    this.name = 'TransmissionPersistRollbackError';
    this.result = result;
  }
}

async function withPersistTransaction(
  client: ShipmentTransmissionPersistClient,
  fn: (tx: ShipmentTransmissionPersistTx) => Promise<ShipmentTransmissionPersistResult>,
): Promise<ShipmentTransmissionPersistResult> {
  try {
    return await client.$transaction(fn);
  } catch (error) {
    if (error instanceof TransmissionPersistRollbackError) {
      return error.result;
    }
    const classified = classifyPrismaPersistFailure(error);
    return failResult({
      reasonCode: classified.reasonCode,
      shipmentMatchId: '',
      attemptId: null,
      attemptNo: null,
      executionToken: null,
      previousStatus: null,
      nextStatus: null,
      reasonMessage: classified.safeMessage,
    });
  }
}

function failResult(
  partial: Omit<ShipmentTransmissionPersistResult, 'success'> & { success?: false },
): ShipmentTransmissionPersistResult {
  return { success: false, ...partial };
}

function okResult(
  partial: Omit<ShipmentTransmissionPersistResult, 'success' | 'reasonCode'> & {
    reasonCode?: ShipmentTransmissionPersistReasonCode;
  },
): ShipmentTransmissionPersistResult {
  return { success: true, reasonCode: 'OK', ...partial };
}

async function refreshOrderSummaryInTx(
  tx: ShipmentTransmissionPersistTx,
  input: { userId: string; orderSyncOrderId: string | null },
): Promise<void> {
  if (!input.orderSyncOrderId) return;
  const matches = await tx.shipmentMatch.findMany({
    where: {
      userId: input.userId,
      orderSyncOrderId: input.orderSyncOrderId,
    },
    select: { transmissionStatus: true },
  });
  const summary = summarizeOrderSyncTransmissionStatus(
    matches.map((m) => m.transmissionStatus),
  );
  const updated = await tx.orderSyncOrder.updateMany({
    where: { id: input.orderSyncOrderId, userId: input.userId },
    data: { transmissionStatus: summary },
  });
  if (updated.count !== 1) {
    throw new Error('ORDER_SUMMARY_UPDATE_FAILED');
  }
}

export type ReserveTransmissionAttemptInput = {
  userId: string;
  candidate: ShipmentTransmissionCandidate;
  payloadFingerprint: string;
  fingerprintVersion?: number;
  executionToken: string;
  now: Date;
  leaseExpiresAt: Date;
};

export async function reserveTransmissionAttempt(
  client: ShipmentTransmissionPersistClient,
  input: ReserveTransmissionAttemptInput,
): Promise<ShipmentTransmissionPersistResult> {
  const { userId, candidate, executionToken, now, leaseExpiresAt } = input;
  const fingerprintVersion =
    input.fingerprintVersion ?? SHIPMENT_TRANSMISSION_FINGERPRINT_VERSION;

  try {
    return await client.$transaction(async (tx) => {
      const updated = await tx.shipmentMatch.updateMany({
        where: {
          id: candidate.matchId,
          userId,
          uploadBatchId: candidate.uploadBatchId,
          provider: candidate.provider,
          integrationAccountId: candidate.integrationAccountId,
          transmissionStatus: 'READY',
          OR: [
            { transmissionLeaseExpiresAt: null },
            { transmissionLeaseExpiresAt: { lt: now } },
          ],
        },
        data: {
          transmissionStatus: 'PROCESSING',
          transmissionLeaseToken: executionToken,
          transmissionLeaseExpiresAt: leaseExpiresAt,
          lastTransmissionAttemptAt: now,
          transmissionErrorMessage: null,
        },
      });

      if (updated.count !== 1) {
        const current = await tx.shipmentMatch.findFirst({
          where: { id: candidate.matchId, userId },
        });
        if (!current) {
          return failResult({
            reasonCode: 'LEASE_NOT_ACQUIRED',
            shipmentMatchId: candidate.matchId,
            attemptId: null,
            attemptNo: null,
            executionToken: null,
            previousStatus: null,
            nextStatus: null,
            reasonMessage: '매칭을 찾을 수 없습니다.',
          });
        }
        if (current.transmissionStatus !== 'READY') {
          return failResult({
            reasonCode: 'MATCH_NOT_READY',
            shipmentMatchId: candidate.matchId,
            attemptId: null,
            attemptNo: null,
            executionToken: null,
            previousStatus: current.transmissionStatus,
            nextStatus: current.transmissionStatus,
            reasonMessage: `transmissionStatus=${current.transmissionStatus} 에서는 예약할 수 없습니다.`,
          });
        }
        return failResult({
          reasonCode: 'LEASE_NOT_ACQUIRED',
          shipmentMatchId: candidate.matchId,
          attemptId: null,
          attemptNo: null,
          executionToken: null,
          previousStatus: current.transmissionStatus,
          nextStatus: current.transmissionStatus,
          reasonMessage: 'lease를 획득하지 못했습니다.',
        });
      }

      // lease 획득 성공 후에만 attemptNo 조회·생성 (동일 TX)
      const latest = await tx.shipmentTransmissionAttempt.findFirst({
        where: { shipmentMatchId: candidate.matchId },
        orderBy: { attemptNo: 'desc' },
      });
      const attemptNo = (latest?.attemptNo ?? 0) + 1;

      const attempt = await tx.shipmentTransmissionAttempt.create({
        data: {
          userId,
          shipmentMatchId: candidate.matchId,
          orderSyncOrderId: candidate.orderSyncOrderId,
          uploadBatchId: candidate.uploadBatchId,
          provider: candidate.provider,
          integrationAccountId: candidate.integrationAccountId,
          mallOrderNo: candidate.mallOrderNo,
          excloadOrderNo: candidate.excloadOrderNo,
          mallLineItemIdsJson: candidate.mallLineItemIds,
          trackingNumberNormalized: normalizeFingerprintTrackingNumber(candidate.trackingNumber),
          courierCode: candidate.courierCode,
          courierName: candidate.courierName,
          payloadFingerprint: input.payloadFingerprint,
          fingerprintVersion,
          attemptNo,
          status: 'PENDING',
          providerRequestId: null,
          responseSummaryJson: null,
          errorCode: null,
          errorMessage: null,
          retryable: false,
          executionToken,
          startedAt: now,
          dispatchedAt: null,
          completedAt: null,
        },
      });

      return okResult({
        shipmentMatchId: candidate.matchId,
        attemptId: attempt.id,
        attemptNo: attempt.attemptNo,
        executionToken,
        previousStatus: 'READY',
        nextStatus: 'PROCESSING',
      });
    });
  } catch (error) {
    if (error instanceof TransmissionPersistRollbackError) {
      return error.result;
    }
    const classified = classifyPrismaPersistFailure(error);
    return failResult({
      reasonCode: classified.reasonCode,
      shipmentMatchId: candidate.matchId,
      attemptId: null,
      attemptNo: null,
      executionToken: null,
      previousStatus: null,
      nextStatus: null,
      reasonMessage: classified.safeMessage,
    });
  }
}

export type MarkDispatchedInput = {
  userId: string;
  shipmentMatchId: string;
  attemptId: string;
  executionToken: string;
  now: Date;
};

export async function markTransmissionAttemptDispatched(
  client: ShipmentTransmissionPersistClient,
  input: MarkDispatchedInput,
): Promise<ShipmentTransmissionPersistResult> {
  const { userId, shipmentMatchId, attemptId, executionToken, now } = input;

  return client.$transaction(async (tx) => {
    const match = await tx.shipmentMatch.findFirst({
      where: { id: shipmentMatchId, userId },
    });
    const attempt = await tx.shipmentTransmissionAttempt.findFirst({
      where: { id: attemptId, shipmentMatchId, userId },
    });

    if (!match || !attempt) {
      return failResult({
        reasonCode: 'DISPATCH_NOT_ALLOWED',
        shipmentMatchId,
        attemptId,
        attemptNo: attempt?.attemptNo ?? null,
        executionToken: null,
        previousStatus: attempt?.status ?? null,
        nextStatus: attempt?.status ?? null,
        reasonMessage: 'match 또는 attempt를 찾을 수 없습니다.',
      });
    }

    if (attempt.executionToken !== executionToken || match.transmissionLeaseToken !== executionToken) {
      return failResult({
        reasonCode: 'LEASE_TOKEN_MISMATCH',
        shipmentMatchId,
        attemptId,
        attemptNo: attempt.attemptNo,
        executionToken: null,
        previousStatus: attempt.status,
        nextStatus: attempt.status,
      });
    }

    if (match.transmissionStatus !== 'PROCESSING') {
      return failResult({
        reasonCode: 'DISPATCH_NOT_ALLOWED',
        shipmentMatchId,
        attemptId,
        attemptNo: attempt.attemptNo,
        executionToken,
        previousStatus: match.transmissionStatus,
        nextStatus: match.transmissionStatus,
      });
    }

    if (
      match.transmissionLeaseExpiresAt &&
      match.transmissionLeaseExpiresAt.getTime() < now.getTime()
    ) {
      return failResult({
        reasonCode: 'LEASE_EXPIRED',
        shipmentMatchId,
        attemptId,
        attemptNo: attempt.attemptNo,
        executionToken,
        previousStatus: attempt.status,
        nextStatus: attempt.status,
      });
    }

    if (attempt.status !== 'PENDING') {
      return failResult({
        reasonCode: 'ATTEMPT_NOT_PENDING',
        shipmentMatchId,
        attemptId,
        attemptNo: attempt.attemptNo,
        executionToken,
        previousStatus: attempt.status,
        nextStatus: attempt.status,
      });
    }

    const updated = await tx.shipmentTransmissionAttempt.updateMany({
      where: {
        id: attemptId,
        userId,
        shipmentMatchId,
        status: 'PENDING',
        executionToken,
        dispatchedAt: null,
      },
      data: {
        status: 'PROCESSING',
        dispatchedAt: now,
      },
    });

    if (updated.count !== 1) {
      return failResult({
        reasonCode: 'DISPATCH_NOT_ALLOWED',
        shipmentMatchId,
        attemptId,
        attemptNo: attempt.attemptNo,
        executionToken,
        previousStatus: attempt.status,
        nextStatus: attempt.status,
      });
    }

    return okResult({
      shipmentMatchId,
      attemptId,
      attemptNo: attempt.attemptNo,
      executionToken,
      previousStatus: 'PENDING',
      nextStatus: 'PROCESSING',
    });
  });
}

type CompleteBaseInput = {
  userId: string;
  shipmentMatchId: string;
  attemptId: string;
  executionToken: string;
  now: Date;
};

async function assertProcessingLease(
  tx: ShipmentTransmissionPersistTx,
  input: CompleteBaseInput,
): Promise<
  | { ok: true; match: ShipmentTransmissionMatchRow; attempt: ShipmentTransmissionAttemptRow }
  | { ok: false; result: ShipmentTransmissionPersistResult }
> {
  const match = await tx.shipmentMatch.findFirst({
    where: { id: input.shipmentMatchId, userId: input.userId },
  });
  const attempt = await tx.shipmentTransmissionAttempt.findFirst({
    where: {
      id: input.attemptId,
      shipmentMatchId: input.shipmentMatchId,
      userId: input.userId,
    },
  });

  if (!match || !attempt) {
    return {
      ok: false,
      result: failResult({
        reasonCode: 'PERSISTENCE_ERROR',
        shipmentMatchId: input.shipmentMatchId,
        attemptId: input.attemptId,
        attemptNo: null,
        executionToken: null,
        previousStatus: null,
        nextStatus: null,
        reasonMessage: 'match 또는 attempt를 찾을 수 없습니다.',
      }),
    };
  }

  if (attempt.executionToken !== input.executionToken || match.transmissionLeaseToken !== input.executionToken) {
    return {
      ok: false,
      result: failResult({
        reasonCode: 'LEASE_TOKEN_MISMATCH',
        shipmentMatchId: input.shipmentMatchId,
        attemptId: input.attemptId,
        attemptNo: attempt.attemptNo,
        executionToken: null,
        previousStatus: attempt.status,
        nextStatus: attempt.status,
      }),
    };
  }

  if (match.transmissionStatus !== 'PROCESSING' || attempt.status !== 'PROCESSING') {
    return {
      ok: false,
      result: failResult({
        reasonCode: 'ATTEMPT_NOT_PROCESSING',
        shipmentMatchId: input.shipmentMatchId,
        attemptId: input.attemptId,
        attemptNo: attempt.attemptNo,
        executionToken: input.executionToken,
        previousStatus: attempt.status,
        nextStatus: attempt.status,
      }),
    };
  }

  return { ok: true, match, attempt };
}

export async function completeTransmissionAttemptSuccess(
  client: ShipmentTransmissionPersistClient,
  input: CompleteBaseInput & {
    providerRequestId: string | null;
    responseSummary: ShipmentTransmissionResponseSummary | null;
  },
): Promise<ShipmentTransmissionPersistResult> {
  return withPersistTransaction(client, async (tx) => {
    const gate = await assertProcessingLease(tx, input);
    if (!gate.ok) return gate.result;

    const summaryJson = toPersistedResponseSummaryJson(input.responseSummary);
    const attemptUpdated = await tx.shipmentTransmissionAttempt.updateMany({
      where: {
        id: input.attemptId,
        userId: input.userId,
        status: 'PROCESSING',
        executionToken: input.executionToken,
      },
      data: {
        status: 'SUCCESS',
        providerRequestId: input.providerRequestId,
        responseSummaryJson: summaryJson,
        errorCode: null,
        errorMessage: null,
        retryable: false,
        completedAt: input.now,
      },
    });
    if (attemptUpdated.count !== 1) {
      return failResult({
        reasonCode: 'ATTEMPT_NOT_PROCESSING',
        shipmentMatchId: input.shipmentMatchId,
        attemptId: input.attemptId,
        attemptNo: gate.attempt.attemptNo,
        executionToken: input.executionToken,
        previousStatus: gate.attempt.status,
        nextStatus: gate.attempt.status,
      });
    }

    const matchUpdated = await tx.shipmentMatch.updateMany({
      where: {
        id: input.shipmentMatchId,
        userId: input.userId,
        transmissionStatus: 'PROCESSING',
        transmissionLeaseToken: input.executionToken,
      },
      data: {
        transmissionStatus: 'SENT',
        transmissionErrorMessage: null,
        transmissionLeaseToken: null,
        transmissionLeaseExpiresAt: null,
      },
    });
    if (matchUpdated.count !== 1) {
      throw new TransmissionPersistRollbackError(
        failResult({
          reasonCode: 'LEASE_TOKEN_MISMATCH',
          shipmentMatchId: input.shipmentMatchId,
          attemptId: input.attemptId,
          attemptNo: gate.attempt.attemptNo,
          executionToken: input.executionToken,
          previousStatus: gate.attempt.status,
          nextStatus: gate.attempt.status,
          reasonMessage: 'Match 조건부 갱신 실패 — Attempt 결과 rollback',
        }),
      );
    }

    await refreshOrderSummaryInTx(tx, {
      userId: input.userId,
      orderSyncOrderId: gate.match.orderSyncOrderId,
    });

    return okResult({
      shipmentMatchId: input.shipmentMatchId,
      attemptId: input.attemptId,
      attemptNo: gate.attempt.attemptNo,
      executionToken: input.executionToken,
      previousStatus: 'PROCESSING',
      nextStatus: 'SENT',
    });
  });
}

export async function completeTransmissionAttemptFailure(
  client: ShipmentTransmissionPersistClient,
  input: CompleteBaseInput & {
    errorCode: string | null;
    errorMessage: string | null;
    retryable: boolean;
    providerRequestId?: string | null;
    responseSummary: ShipmentTransmissionResponseSummary | null;
  },
): Promise<ShipmentTransmissionPersistResult> {
  return withPersistTransaction(client, async (tx) => {
    const gate = await assertProcessingLease(tx, input);
    if (!gate.ok) return gate.result;

    const safeMessage = sanitizeTransmissionErrorMessage(input.errorMessage);
    const summaryJson = toPersistedResponseSummaryJson(input.responseSummary);

    const attemptUpdated = await tx.shipmentTransmissionAttempt.updateMany({
      where: {
        id: input.attemptId,
        userId: input.userId,
        status: 'PROCESSING',
        executionToken: input.executionToken,
      },
      data: {
        status: 'FAILED',
        errorCode: input.errorCode,
        errorMessage: safeMessage,
        retryable: input.retryable,
        providerRequestId: input.providerRequestId ?? null,
        responseSummaryJson: summaryJson,
        completedAt: input.now,
      },
    });
    if (attemptUpdated.count !== 1) {
      return failResult({
        reasonCode: 'ATTEMPT_NOT_PROCESSING',
        shipmentMatchId: input.shipmentMatchId,
        attemptId: input.attemptId,
        attemptNo: gate.attempt.attemptNo,
        executionToken: input.executionToken,
        previousStatus: gate.attempt.status,
        nextStatus: gate.attempt.status,
      });
    }

    const matchUpdated = await tx.shipmentMatch.updateMany({
      where: {
        id: input.shipmentMatchId,
        userId: input.userId,
        transmissionStatus: 'PROCESSING',
        transmissionLeaseToken: input.executionToken,
      },
      data: {
        transmissionStatus: 'FAILED',
        transmissionErrorMessage: safeMessage,
        transmissionLeaseToken: null,
        transmissionLeaseExpiresAt: null,
      },
    });
    if (matchUpdated.count !== 1) {
      throw new TransmissionPersistRollbackError(
        failResult({
          reasonCode: 'LEASE_TOKEN_MISMATCH',
          shipmentMatchId: input.shipmentMatchId,
          attemptId: input.attemptId,
          attemptNo: gate.attempt.attemptNo,
          executionToken: input.executionToken,
          previousStatus: gate.attempt.status,
          nextStatus: gate.attempt.status,
          reasonMessage: 'Match 조건부 갱신 실패 — Attempt 결과 rollback',
        }),
      );
    }

    await refreshOrderSummaryInTx(tx, {
      userId: input.userId,
      orderSyncOrderId: gate.match.orderSyncOrderId,
    });

    return okResult({
      shipmentMatchId: input.shipmentMatchId,
      attemptId: input.attemptId,
      attemptNo: gate.attempt.attemptNo,
      executionToken: input.executionToken,
      previousStatus: 'PROCESSING',
      nextStatus: 'FAILED',
    });
  });
}

export async function completeTransmissionAttemptUnknown(
  client: ShipmentTransmissionPersistClient,
  input: CompleteBaseInput & {
    errorCode: string | null;
    errorMessage: string | null;
    providerRequestId?: string | null;
    responseSummary?: ShipmentTransmissionResponseSummary | null;
  },
): Promise<ShipmentTransmissionPersistResult> {
  return withPersistTransaction(client, async (tx) => {
    const gate = await assertProcessingLease(tx, input);
    if (!gate.ok) return gate.result;

    const safeMessage = sanitizeTransmissionErrorMessage(input.errorMessage);
    const summaryJson = toPersistedResponseSummaryJson(input.responseSummary ?? null);

    const attemptUpdated = await tx.shipmentTransmissionAttempt.updateMany({
      where: {
        id: input.attemptId,
        userId: input.userId,
        status: 'PROCESSING',
        executionToken: input.executionToken,
      },
      data: {
        status: 'UNKNOWN',
        errorCode: input.errorCode,
        errorMessage: safeMessage,
        retryable: false,
        providerRequestId: input.providerRequestId ?? null,
        responseSummaryJson: summaryJson,
        completedAt: input.now,
      },
    });
    if (attemptUpdated.count !== 1) {
      return failResult({
        reasonCode: 'ATTEMPT_NOT_PROCESSING',
        shipmentMatchId: input.shipmentMatchId,
        attemptId: input.attemptId,
        attemptNo: gate.attempt.attemptNo,
        executionToken: input.executionToken,
        previousStatus: gate.attempt.status,
        nextStatus: gate.attempt.status,
      });
    }

    const matchUpdated = await tx.shipmentMatch.updateMany({
      where: {
        id: input.shipmentMatchId,
        userId: input.userId,
        transmissionStatus: 'PROCESSING',
        transmissionLeaseToken: input.executionToken,
      },
      data: {
        transmissionStatus: 'UNKNOWN',
        transmissionErrorMessage: safeMessage,
        transmissionLeaseToken: null,
        transmissionLeaseExpiresAt: null,
      },
    });
    if (matchUpdated.count !== 1) {
      throw new TransmissionPersistRollbackError(
        failResult({
          reasonCode: 'LEASE_TOKEN_MISMATCH',
          shipmentMatchId: input.shipmentMatchId,
          attemptId: input.attemptId,
          attemptNo: gate.attempt.attemptNo,
          executionToken: input.executionToken,
          previousStatus: gate.attempt.status,
          nextStatus: gate.attempt.status,
          reasonMessage: 'Match 조건부 갱신 실패 — Attempt 결과 rollback',
        }),
      );
    }

    await refreshOrderSummaryInTx(tx, {
      userId: input.userId,
      orderSyncOrderId: gate.match.orderSyncOrderId,
    });

    return okResult({
      shipmentMatchId: input.shipmentMatchId,
      attemptId: input.attemptId,
      attemptNo: gate.attempt.attemptNo,
      executionToken: input.executionToken,
      previousStatus: 'PROCESSING',
      nextStatus: 'UNKNOWN',
    });
  });
}

export type RecoverStaleInput = {
  userId: string;
  shipmentMatchId: string;
  attemptId: string;
  executionToken: string;
  now: Date;
};

export async function recoverStalePendingAttempt(
  client: ShipmentTransmissionPersistClient,
  input: RecoverStaleInput,
): Promise<ShipmentTransmissionPersistResult> {
  return withPersistTransaction(client, async (tx) => {
    const match = await tx.shipmentMatch.findFirst({
      where: { id: input.shipmentMatchId, userId: input.userId },
    });
    const attempt = await tx.shipmentTransmissionAttempt.findFirst({
      where: {
        id: input.attemptId,
        shipmentMatchId: input.shipmentMatchId,
        userId: input.userId,
      },
    });

    if (!match || !attempt) {
      return failResult({
        reasonCode: 'STALE_RECOVERY_NOT_ALLOWED',
        shipmentMatchId: input.shipmentMatchId,
        attemptId: input.attemptId,
        attemptNo: null,
        executionToken: null,
        previousStatus: null,
        nextStatus: null,
      });
    }

    if (attempt.executionToken !== input.executionToken || match.transmissionLeaseToken !== input.executionToken) {
      return failResult({
        reasonCode: 'LEASE_TOKEN_MISMATCH',
        shipmentMatchId: input.shipmentMatchId,
        attemptId: input.attemptId,
        attemptNo: attempt.attemptNo,
        executionToken: null,
        previousStatus: attempt.status,
        nextStatus: attempt.status,
      });
    }

    if (
      attempt.status !== 'PENDING' ||
      attempt.dispatchedAt != null ||
      match.transmissionStatus !== 'PROCESSING' ||
      !match.transmissionLeaseExpiresAt ||
      match.transmissionLeaseExpiresAt.getTime() >= input.now.getTime()
    ) {
      return failResult({
        reasonCode: 'STALE_RECOVERY_NOT_ALLOWED',
        shipmentMatchId: input.shipmentMatchId,
        attemptId: input.attemptId,
        attemptNo: attempt.attemptNo,
        executionToken: input.executionToken,
        previousStatus: attempt.status,
        nextStatus: attempt.status,
      });
    }

    const attemptUpdated = await tx.shipmentTransmissionAttempt.updateMany({
      where: {
        id: input.attemptId,
        status: 'PENDING',
        executionToken: input.executionToken,
        dispatchedAt: null,
      },
      data: {
        status: 'CANCELLED',
        completedAt: input.now,
        errorCode: 'STALE_PENDING_RECOVERED',
        errorMessage: sanitizeTransmissionErrorMessage('stale PENDING recovered'),
        retryable: false,
      },
    });
    if (attemptUpdated.count !== 1) {
      return failResult({
        reasonCode: 'STALE_RECOVERY_NOT_ALLOWED',
        shipmentMatchId: input.shipmentMatchId,
        attemptId: input.attemptId,
        attemptNo: attempt.attemptNo,
        executionToken: input.executionToken,
        previousStatus: attempt.status,
        nextStatus: attempt.status,
      });
    }

    const matchUpdated = await tx.shipmentMatch.updateMany({
      where: {
        id: input.shipmentMatchId,
        userId: input.userId,
        transmissionStatus: 'PROCESSING',
        transmissionLeaseToken: input.executionToken,
      },
      data: {
        transmissionStatus: 'READY',
        transmissionLeaseToken: null,
        transmissionLeaseExpiresAt: null,
        transmissionErrorMessage: null,
      },
    });
    if (matchUpdated.count !== 1) {
      throw new TransmissionPersistRollbackError(
        failResult({
          reasonCode: 'STALE_RECOVERY_NOT_ALLOWED',
          shipmentMatchId: input.shipmentMatchId,
          attemptId: input.attemptId,
          attemptNo: attempt.attemptNo,
          executionToken: input.executionToken,
          previousStatus: attempt.status,
          nextStatus: attempt.status,
          reasonMessage: 'Match 조건부 갱신 실패 — Attempt 결과 rollback',
        }),
      );
    }

    await refreshOrderSummaryInTx(tx, {
      userId: input.userId,
      orderSyncOrderId: match.orderSyncOrderId,
    });

    return okResult({
      reasonCode: 'STALE_PENDING_RECOVERED',
      shipmentMatchId: input.shipmentMatchId,
      attemptId: input.attemptId,
      attemptNo: attempt.attemptNo,
      executionToken: input.executionToken,
      previousStatus: 'PENDING',
      nextStatus: 'CANCELLED',
    });
  });
}

export async function recoverStaleProcessingAttempt(
  client: ShipmentTransmissionPersistClient,
  input: RecoverStaleInput,
): Promise<ShipmentTransmissionPersistResult> {
  return withPersistTransaction(client, async (tx) => {
    const match = await tx.shipmentMatch.findFirst({
      where: { id: input.shipmentMatchId, userId: input.userId },
    });
    const attempt = await tx.shipmentTransmissionAttempt.findFirst({
      where: {
        id: input.attemptId,
        shipmentMatchId: input.shipmentMatchId,
        userId: input.userId,
      },
    });

    if (!match || !attempt) {
      return failResult({
        reasonCode: 'STALE_RECOVERY_NOT_ALLOWED',
        shipmentMatchId: input.shipmentMatchId,
        attemptId: input.attemptId,
        attemptNo: null,
        executionToken: null,
        previousStatus: null,
        nextStatus: null,
      });
    }

    if (attempt.executionToken !== input.executionToken || match.transmissionLeaseToken !== input.executionToken) {
      return failResult({
        reasonCode: 'LEASE_TOKEN_MISMATCH',
        shipmentMatchId: input.shipmentMatchId,
        attemptId: input.attemptId,
        attemptNo: attempt.attemptNo,
        executionToken: null,
        previousStatus: attempt.status,
        nextStatus: attempt.status,
      });
    }

    if (
      attempt.status !== 'PROCESSING' ||
      attempt.dispatchedAt == null ||
      match.transmissionStatus !== 'PROCESSING' ||
      !match.transmissionLeaseExpiresAt ||
      match.transmissionLeaseExpiresAt.getTime() >= input.now.getTime()
    ) {
      return failResult({
        reasonCode: 'STALE_RECOVERY_NOT_ALLOWED',
        shipmentMatchId: input.shipmentMatchId,
        attemptId: input.attemptId,
        attemptNo: attempt.attemptNo,
        executionToken: input.executionToken,
        previousStatus: attempt.status,
        nextStatus: attempt.status,
      });
    }

    const attemptUpdated = await tx.shipmentTransmissionAttempt.updateMany({
      where: {
        id: input.attemptId,
        status: 'PROCESSING',
        executionToken: input.executionToken,
      },
      data: {
        status: 'UNKNOWN',
        completedAt: input.now,
        retryable: false,
        errorCode: 'STALE_PROCESSING_MARKED_UNKNOWN',
        errorMessage: sanitizeTransmissionErrorMessage('stale PROCESSING marked UNKNOWN'),
      },
    });
    if (attemptUpdated.count !== 1) {
      return failResult({
        reasonCode: 'STALE_RECOVERY_NOT_ALLOWED',
        shipmentMatchId: input.shipmentMatchId,
        attemptId: input.attemptId,
        attemptNo: attempt.attemptNo,
        executionToken: input.executionToken,
        previousStatus: attempt.status,
        nextStatus: attempt.status,
      });
    }

    const matchUpdated = await tx.shipmentMatch.updateMany({
      where: {
        id: input.shipmentMatchId,
        userId: input.userId,
        transmissionStatus: 'PROCESSING',
        transmissionLeaseToken: input.executionToken,
      },
      data: {
        transmissionStatus: 'UNKNOWN',
        transmissionLeaseToken: null,
        transmissionLeaseExpiresAt: null,
        transmissionErrorMessage: sanitizeTransmissionErrorMessage(
          'stale PROCESSING marked UNKNOWN',
        ),
      },
    });
    if (matchUpdated.count !== 1) {
      throw new TransmissionPersistRollbackError(
        failResult({
          reasonCode: 'STALE_RECOVERY_NOT_ALLOWED',
          shipmentMatchId: input.shipmentMatchId,
          attemptId: input.attemptId,
          attemptNo: attempt.attemptNo,
          executionToken: input.executionToken,
          previousStatus: attempt.status,
          nextStatus: attempt.status,
          reasonMessage: 'Match 조건부 갱신 실패 — Attempt 결과 rollback',
        }),
      );
    }

    await refreshOrderSummaryInTx(tx, {
      userId: input.userId,
      orderSyncOrderId: match.orderSyncOrderId,
    });

    return okResult({
      reasonCode: 'STALE_PROCESSING_MARKED_UNKNOWN',
      shipmentMatchId: input.shipmentMatchId,
      attemptId: input.attemptId,
      attemptNo: attempt.attemptNo,
      executionToken: input.executionToken,
      previousStatus: 'PROCESSING',
      nextStatus: 'UNKNOWN',
    });
  });
}

export async function refreshOrderTransmissionSummary(
  client: ShipmentTransmissionPersistClient,
  input: { userId: string; orderSyncOrderId: string },
): Promise<ShipmentTransmissionPersistResult> {
  return client.$transaction(async (tx) => {
    await refreshOrderSummaryInTx(tx, {
      userId: input.userId,
      orderSyncOrderId: input.orderSyncOrderId,
    });
    return okResult({
      reasonCode: 'ORDER_SUMMARY_UPDATED',
      shipmentMatchId: '',
      attemptId: null,
      attemptNo: null,
      executionToken: null,
      previousStatus: null,
      nextStatus: null,
    });
  });
}
