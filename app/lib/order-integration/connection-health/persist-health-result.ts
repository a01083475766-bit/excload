import { OrderIntegrationAccountStatus, Prisma } from '@prisma/client';
import { prisma } from '@/app/lib/prisma';
import { worsensConnection } from './error-categories';
import type {
  ConnectionHealthResult,
  ConnectionOperationResult,
  HealthErrorCategory,
  HealthFieldsPatch,
  HealthStatus,
  PreviousHealthState,
} from './types';

/** Soft failures only degrade the visible health status after this many consecutive results. */
export const FAILURE_DEGRADE_THRESHOLD = 3;

function isSoftFailure(status: ConnectionHealthResult['status']): boolean {
  return status === 'TEMPORARY_ERROR' || status === 'UNKNOWN';
}

/** Pure health-state transition. The caller is responsible for serializing DB access. */
export function computeHealthFields(
  previous: PreviousHealthState,
  result: ConnectionHealthResult,
): HealthFieldsPatch {
  const checkedAt = result.checkedAt;

  if (result.status === 'HEALTHY') {
    return {
      lastCheckedAt: checkedAt,
      healthStatus: 'HEALTHY',
      lastSuccessAt: checkedAt,
      lastErrorCategory: null,
      lastErrorCode: null,
      consecutiveFailureCount: 0,
    };
  }

  // A request validation error says nothing about the external account connection.
  if (!worsensConnection(result.status)) {
    return { lastCheckedAt: checkedAt };
  }

  const count = (previous.consecutiveFailureCount ?? 0) + 1;
  const base: HealthFieldsPatch = {
    lastCheckedAt: checkedAt,
    lastFailureAt: checkedAt,
    lastErrorCategory: result.status as HealthErrorCategory,
    lastErrorCode: result.rawCode ?? null,
    consecutiveFailureCount: count,
  };

  if (isSoftFailure(result.status) && count < FAILURE_DEGRADE_THRESHOLD) {
    return base;
  }

  return { ...base, healthStatus: result.status };
}

export type EffectiveHealth = {
  healthStatus: HealthStatus | null;
  lastErrorCategory: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastCheckedAt: string | null;
  consecutiveFailureCount: number;
  /** Internal result only. Never include this flag or sequence values in the public DTO. */
  staleIgnored: boolean;
};

export type ConnectionOperationRecordInput = {
  accountId: string;
  userId: string;
  operationSequence: bigint;
  result: ConnectionOperationResult;
};

export const USER_MESSAGE_MAX = 500;
export const DIAGNOSTIC_MESSAGE_MAX = 200;

const SENSITIVE_FIELD_NAMES =
  'authorization|access[_-]?token|refresh[_-]?token|client[_-]?(?:id|secret)|secret(?:[_-]?key)?|access[_-]?key|private[_-]?key|partner[_-]?key|user[_-]?key|system[_-]?key|mall[_-]?key|api(?:[_-]?auth)?[_-]?key|openapikey|authentication[_-]?key|signature|토큰|시크릿|서명|인증키|사용자키';

function sanitizeMessage(value: string | null | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;

  let sanitized = value
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/gi, '[REDACTED]')
    .replace(
      new RegExp(`<(${SENSITIVE_FIELD_NAMES})[^>]*>[\\s\\S]*?<\\/\\1>`, 'gi'),
      '$1=[REDACTED]',
    )
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(
      /(["']?authorization["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\r\n]+)/gi,
      '$1[REDACTED]',
    )
    .replace(
      new RegExp(
        `(["']?(?:${SENSITIVE_FIELD_NAMES})["']?\\s*[:=]\\s*)(?:"[^"]*"|'[^']*'|[^\\s,;&}]+)`,
        'gi',
      ),
      '$1[REDACTED]',
    )
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, (match) => {
      return `${match.split(/\s/, 1)[0]} [REDACTED]`;
    })
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/^\s*(?:at\s+|Caused by:|Traceback \(most recent call last\):|File\s+["']).*$/gim, ' ')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b/g, '[REDACTED_PHONE]')
    .replace(/\b\d{6}[ -]?\d{7}\b/g, '[REDACTED_ID]')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!sanitized) return undefined;
  if (sanitized.length > maxLength) {
    sanitized = `${sanitized.slice(0, Math.max(0, maxLength - 1))}…`;
  }
  return sanitized;
}

export function sanitizeUserFacingErrorMessage(value: string | null | undefined): string | undefined {
  return sanitizeMessage(value, USER_MESSAGE_MAX);
}

export function sanitizeDiagnosticErrorMessage(value: string | null | undefined): string | undefined {
  return sanitizeMessage(value, DIAGNOSTIC_MESSAGE_MAX);
}

function normalizeOperationResult(
  operation: ConnectionOperationResult,
  checkedAt: Date,
): { healthResult: ConnectionHealthResult; userMessage?: string } {
  if (operation.success) {
    return { healthResult: { status: 'HEALTHY', checkedAt } };
  }

  return {
    healthResult: {
      status: operation.category,
      rawCode: sanitizeDiagnosticErrorMessage(operation.errorCode),
      rawMessage: sanitizeDiagnosticErrorMessage(operation.rawMessage),
      checkedAt,
    },
    userMessage:
      sanitizeUserFacingErrorMessage(operation.userMessage) ??
      '연결 상태를 확인하는 중 오류가 발생했습니다.',
  };
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type LockedAccountRow = {
  id: string;
  healthStatus: string | null;
  lastErrorCategory: string | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastCheckedAt: Date | null;
  consecutiveFailureCount: number;
  healthAppliedOperationSequence: bigint;
};

function effectiveHealth(
  previous: LockedAccountRow,
  patch: HealthFieldsPatch | undefined,
  staleIgnored: boolean,
): EffectiveHealth {
  const has = (key: keyof HealthFieldsPatch) => {
    return patch !== undefined && Object.prototype.hasOwnProperty.call(patch, key);
  };

  return {
    healthStatus:
      ((has('healthStatus') ? patch?.healthStatus : previous.healthStatus) as HealthStatus | null) ?? null,
    lastErrorCategory:
      (has('lastErrorCategory') ? patch?.lastErrorCategory : previous.lastErrorCategory) ?? null,
    lastSuccessAt: toIso(has('lastSuccessAt') ? patch?.lastSuccessAt : previous.lastSuccessAt),
    lastFailureAt: toIso(has('lastFailureAt') ? patch?.lastFailureAt : previous.lastFailureAt),
    lastCheckedAt: toIso(has('lastCheckedAt') ? patch?.lastCheckedAt : previous.lastCheckedAt),
    consecutiveFailureCount:
      (has('consecutiveFailureCount')
        ? patch?.consecutiveFailureCount
        : previous.consecutiveFailureCount) ?? 0,
    staleIgnored,
  };
}

async function releaseOwnLeaseInTransaction(
  tx: Prisma.TransactionClient,
  input: { accountId: string; userId: string; leaseToken?: string },
): Promise<void> {
  if (!input.leaseToken) return;

  await tx.$executeRaw(
    Prisma.sql`
      UPDATE "OrderIntegrationAccount"
      SET "healthCheckLeaseToken" = NULL,
          "healthCheckLeaseUntil" = NULL
      WHERE "id" = ${input.accountId}
        AND "userId" = ${input.userId}
        AND "healthCheckLeaseToken" = ${input.leaseToken}
    `,
  );
}

/**
 * Persists one completed external operation in a short row-locked transaction.
 * The external provider call must already have completed before entering this function.
 */
export async function persistConnectionHealth(input: {
  accountId: string;
  userId: string;
  operationSequence: bigint;
  result: ConnectionOperationResult;
  leaseToken?: string;
  checkedAt?: Date;
  extra?: Prisma.OrderIntegrationAccountUpdateInput;
}): Promise<EffectiveHealth> {
  if (input.operationSequence <= BigInt(0)) {
    throw new Error('A positive connection health operation sequence is required.');
  }

  const normalized = normalizeOperationResult(input.result, input.checkedAt ?? new Date());

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<LockedAccountRow[]>(
      Prisma.sql`
        SELECT
          "id",
          "healthStatus",
          "lastErrorCategory",
          "lastSuccessAt",
          "lastFailureAt",
          "lastCheckedAt",
          "consecutiveFailureCount",
          "healthAppliedOperationSequence"
        FROM "OrderIntegrationAccount"
        WHERE "id" = ${input.accountId}
          AND "userId" = ${input.userId}
        FOR UPDATE
      `,
    );
    const previous = rows[0];

    if (!previous) {
      throw new Error('Connection health account was not found.');
    }

    if (input.operationSequence <= previous.healthAppliedOperationSequence) {
      await releaseOwnLeaseInTransaction(tx, input);
      return effectiveHealth(previous, undefined, true);
    }

    const patch = computeHealthFields(previous, normalized.healthResult);
    const data: Prisma.OrderIntegrationAccountUpdateInput = {
      ...(input.extra ?? {}),
      ...patch,
      healthAppliedOperationSequence: input.operationSequence,
    };

    if (normalized.healthResult.status === 'HEALTHY') {
      data.status = OrderIntegrationAccountStatus.ACTIVE;
      data.lastErrorMessage = null;
    } else if (
      worsensConnection(normalized.healthResult.status) &&
      normalized.userMessage !== undefined
    ) {
      data.lastErrorMessage = normalized.userMessage;
    }

    await tx.orderIntegrationAccount.update({
      where: { id: input.accountId, userId: input.userId },
      data,
    });
    await releaseOwnLeaseInTransaction(tx, input);

    return effectiveHealth(previous, patch, false);
  });
}

export async function recordConnectionTestResult(input: ConnectionOperationRecordInput): Promise<void> {
  const now = new Date();
  await persistConnectionHealth({
    ...input,
    checkedAt: now,
    extra: { lastTestedAt: now },
  });
}

export async function recordConnectionSyncResult(input: ConnectionOperationRecordInput): Promise<void> {
  const now = new Date();
  await persistConnectionHealth({
    ...input,
    checkedAt: now,
    extra: input.result.success ? { lastSyncedAt: now } : undefined,
  });
}
