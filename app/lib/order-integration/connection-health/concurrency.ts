import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/app/lib/prisma';

export const CONNECTION_HEALTH_LEASE_TTL_MS = 45_000;
export const AUTOMATIC_HEALTH_CHECK_FRESH_MS = 10 * 60_000;
export const MANUAL_HEALTH_CHECK_THROTTLE_MS = 30_000;

export type ConnectionHealthOperationSource =
  | 'health_check'
  | 'connection_test'
  | 'fetch_orders'
  | 'transport'
  | 'save_validation';

export type ConnectionHealthCheckMode = 'automatic' | 'manual';

export type BeginConnectionHealthOperationResult =
  | { started: true; operationSequence: bigint }
  | { started: false; reason: 'NOT_FOUND' | 'INACTIVE' };

export type ClaimConnectionHealthCheckResult =
  | { claimed: true; leaseToken: string; operationSequence: bigint }
  | {
      claimed: false;
      reason: 'NOT_FOUND' | 'INACTIVE' | 'CACHED' | 'THROTTLED' | 'IN_PROGRESS';
    };

type BeginOperationRow = {
  outcome: 'STARTED' | 'NOT_FOUND' | 'INACTIVE';
  operationSequence: bigint | null;
  source: ConnectionHealthOperationSource;
};

type ClaimHealthCheckRow = {
  outcome: 'CLAIMED' | 'NOT_FOUND' | 'INACTIVE' | 'CACHED' | 'THROTTLED' | 'IN_PROGRESS';
  operationSequence: bigint | null;
};

/**
 * 계정 단위 연결 상태 작업 순번을 원자적으로 발급한다.
 * reason 값은 서버 내부 제어용이며 API 응답에 그대로 전달하면 안 된다.
 */
export async function beginConnectionHealthOperation(input: {
  accountId: string;
  userId: string;
  source: ConnectionHealthOperationSource;
}): Promise<BeginConnectionHealthOperationResult> {
  // Saved direct-integration accounts use INACTIVE as "pending verification" and have no
  // separate activation endpoint. Only the explicit read-only connection test may verify
  // such an account; automatic checks and operational traffic remain blocked.
  const canVerifyInactive = input.source === 'connection_test';
  const query = Prisma.sql`
    WITH target AS MATERIALIZED (
      SELECT account."id", account."status"
      FROM "OrderIntegrationAccount" AS account
      WHERE account."id" = ${input.accountId}
        AND account."userId" = ${input.userId}
      FOR UPDATE
    ), updated AS (
      UPDATE "OrderIntegrationAccount" AS account
      SET "healthOperationSequence" = account."healthOperationSequence" + 1
      FROM target
      WHERE account."id" = target."id"
        AND (
          target."status"::text <> 'INACTIVE'
          OR ${canVerifyInactive}
        )
      RETURNING account."healthOperationSequence" AS "operationSequence"
    )
    SELECT
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'NOT_FOUND'
        WHEN EXISTS (SELECT 1 FROM updated) THEN 'STARTED'
        ELSE 'INACTIVE'
      END AS "outcome",
      (SELECT "operationSequence" FROM updated) AS "operationSequence",
      ${input.source}::text AS "source"
  `;
  const rows = await prisma.$queryRaw<BeginOperationRow[]>(query);
  const row = rows[0];

  if (row?.outcome === 'STARTED' && row.operationSequence != null) {
    return { started: true, operationSequence: row.operationSequence };
  }
  return {
    started: false,
    reason: row?.outcome === 'INACTIVE' ? 'INACTIVE' : 'NOT_FOUND',
  };
}

/**
 * 연결 확인 lease와 작업 순번을 한 UPDATE에서 함께 획득한다.
 * - automatic: 최근 10분 결과가 있으면 CACHED
 * - manual: 최근 30초 결과가 있으면 THROTTLED
 * - 유효한 45초 lease가 있으면 IN_PROGRESS
 * 모든 시간 판정은 애플리케이션 시계가 아닌 DB NOW()를 사용한다.
 */
export async function claimConnectionHealthCheck(input: {
  accountId: string;
  userId: string;
  mode: ConnectionHealthCheckMode;
}): Promise<ClaimConnectionHealthCheckResult> {
  const leaseToken = randomUUID();
  const freshnessMs =
    input.mode === 'automatic'
      ? AUTOMATIC_HEALTH_CHECK_FRESH_MS
      : MANUAL_HEALTH_CHECK_THROTTLE_MS;
  const freshReason = input.mode === 'automatic' ? 'CACHED' : 'THROTTLED';

  const query = Prisma.sql`
    WITH target AS MATERIALIZED (
      SELECT
        account."id",
        account."status",
        account."lastCheckedAt",
        account."healthCheckLeaseUntil"
      FROM "OrderIntegrationAccount" AS account
      WHERE account."id" = ${input.accountId}
        AND account."userId" = ${input.userId}
      FOR UPDATE
    ), updated AS (
      UPDATE "OrderIntegrationAccount" AS account
      SET
        "healthCheckLeaseToken" = ${leaseToken},
        "healthCheckLeaseUntil" = NOW() + (${CONNECTION_HEALTH_LEASE_TTL_MS} * INTERVAL '1 millisecond'),
        "healthOperationSequence" = account."healthOperationSequence" + 1
      FROM target
      WHERE account."id" = target."id"
        AND target."status"::text <> 'INACTIVE'
        AND (
          target."healthCheckLeaseUntil" IS NULL
          OR target."healthCheckLeaseUntil" <= NOW()
        )
        AND (
          target."lastCheckedAt" IS NULL
          OR target."lastCheckedAt" <= NOW() - (${freshnessMs} * INTERVAL '1 millisecond')
        )
      RETURNING account."healthOperationSequence" AS "operationSequence"
    )
    SELECT
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'NOT_FOUND'
        WHEN (SELECT "status"::text FROM target) = 'INACTIVE' THEN 'INACTIVE'
        WHEN EXISTS (SELECT 1 FROM updated) THEN 'CLAIMED'
        WHEN (SELECT "healthCheckLeaseUntil" FROM target) > NOW() THEN 'IN_PROGRESS'
        ELSE ${freshReason}::text
      END AS "outcome",
      (SELECT "operationSequence" FROM updated) AS "operationSequence"
  `;
  const rows = await prisma.$queryRaw<ClaimHealthCheckRow[]>(query);
  const row = rows[0];

  if (row?.outcome === 'CLAIMED' && row.operationSequence != null) {
    return { claimed: true, leaseToken, operationSequence: row.operationSequence };
  }

  const reason = row?.outcome;
  if (
    reason === 'INACTIVE' ||
    reason === 'CACHED' ||
    reason === 'THROTTLED' ||
    reason === 'IN_PROGRESS'
  ) {
    return { claimed: false, reason };
  }
  return { claimed: false, reason: 'NOT_FOUND' };
}

/** 정확히 일치하는 소유자·lease 토큰만 해제한다. 만료되거나 교체된 다른 lease는 건드리지 않는다. */
export async function releaseConnectionHealthCheckLease(input: {
  accountId: string;
  userId: string;
  leaseToken: string;
}): Promise<boolean> {
  const query = Prisma.sql`
    UPDATE "OrderIntegrationAccount"
    SET
      "healthCheckLeaseToken" = NULL,
      "healthCheckLeaseUntil" = NULL
    WHERE "id" = ${input.accountId}
      AND "userId" = ${input.userId}
      AND "healthCheckLeaseToken" = ${input.leaseToken}
  `;
  const affectedRows = await prisma.$executeRaw(query);
  return affectedRows > 0;
}
