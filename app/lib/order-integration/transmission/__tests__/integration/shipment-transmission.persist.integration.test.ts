/**
 * Prisma persist — smoke DB integration scenarios (D-6g-e1 write / D-6g-e2 run).
 *
 * Gated by SHIPMENT_TRANSMISSION_IT_RUN=true (wrapper only).
 * Excluded from default vitest via vitest.config.ts.
 *
 * K (TX rollback): not forced here — unique conflict / missing-order paths can leave
 * unstable rows; covered by repository + prisma-persist unit tests.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPrismaShipmentTransmissionPersistClient } from '@/app/lib/order-integration/transmission/prisma-persist-client';
import {
  completeTransmissionAttemptFailure,
  completeTransmissionAttemptSuccess,
  completeTransmissionAttemptUnknown,
  createShipmentTransmissionExecutionToken,
  markTransmissionAttemptDispatched,
  recoverStalePendingAttempt,
  recoverStaleProcessingAttempt,
  reserveTransmissionAttempt,
  SHIPMENT_TRANSMISSION_LEASE_MS,
  TRANSMISSION_ERROR_MESSAGE_MAX_LENGTH,
} from '@/app/lib/order-integration/transmission/repository';
import { buildShipmentTransmissionFingerprint } from '@/app/lib/order-integration/transmission/fingerprint';
import {
  cleanupShipmentTransmissionItIds,
  trackAttemptsForMatches,
} from '@/app/lib/order-integration/transmission/__tests__/integration/support/cleanup';
import { createEmptyItIds } from '@/app/lib/order-integration/transmission/__tests__/integration/support/cleanup-plans';
import {
  createAdditionalReadyMatch,
  createReadyTransmissionFixture,
  type ReadyTransmissionFixture,
} from '@/app/lib/order-integration/transmission/__tests__/integration/support/fixture';
import { createShipmentTransmissionItRunId } from '@/app/lib/order-integration/transmission/__tests__/integration/support/ids';
import { evaluateIntegrationMutationGate } from '@/app/lib/order-integration/transmission/__tests__/integration/support/mutation-gate';
import {
  createIntegrationPrismaClient,
  disconnectIntegrationPrisma,
} from '@/app/lib/order-integration/transmission/__tests__/integration/support/prisma-it-client';
import {
  IT_ATTEMPT_VERIFY_SELECT,
  IT_MATCH_VERIFY_SELECT,
  IT_ORDER_VERIFY_SELECT,
} from '@/app/lib/order-integration/transmission/__tests__/integration/support/verify-select';

const enabled = evaluateIntegrationMutationGate().ok;

describe.skipIf(!enabled)('shipment transmission persist integration (smoke DB)', () => {
  type Ctx = {
    prisma: ReturnType<typeof createIntegrationPrismaClient>;
    persist: ReturnType<typeof createPrismaShipmentTransmissionPersistClient>;
    fx: ReadyTransmissionFixture;
  };

  async function withReadyFixture(
    run: (ctx: Ctx) => Promise<void>,
    slot = 'a',
  ): Promise<void> {
    // Re-check gate inside each test (direct vitest.integration.config bypass still blocked)
    expect(evaluateIntegrationMutationGate().ok).toBe(true);
    const prisma = createIntegrationPrismaClient();
    const persist = createPrismaShipmentTransmissionPersistClient(prisma);
    const ids = createEmptyItIds(createShipmentTransmissionItRunId());
    let cleanupOk = false;
    let cleanupCode: string | undefined;
    try {
      const fx = await createReadyTransmissionFixture(prisma, {
        runId: ids.runId,
        slot,
        ids,
      });
      await run({ prisma, persist, fx });
    } finally {
      try {
        await trackAttemptsForMatches(prisma, ids);
        const cleanup = await cleanupShipmentTransmissionItIds(prisma, ids);
        cleanupOk = cleanup.ok;
        cleanupCode = cleanup.errorCode;
      } finally {
        await disconnectIntegrationPrisma(prisma);
      }
    }
    expect(cleanupOk, `cleanup failed: ${cleanupCode ?? 'unknown'}`).toBe(true);
  }

  function fingerprintFor(fx: ReadyTransmissionFixture): string {
    return buildShipmentTransmissionFingerprint({
      userId: fx.userId,
      provider: fx.candidate.provider,
      integrationAccountId: fx.candidate.integrationAccountId,
      shipmentMatchId: fx.matchId,
      orderSyncOrderId: fx.orderId,
      mallOrderNo: fx.mallOrderNo,
      mallLineItemIds: fx.candidate.mallLineItemIds,
      trackingNumber: fx.trackingNumber,
      courierCode: fx.candidate.courierCode,
      courierName: fx.candidate.courierName,
    });
  }

  function leaseWindow(now: Date) {
    return {
      now,
      leaseExpiresAt: new Date(now.getTime() + SHIPMENT_TRANSMISSION_LEASE_MS),
    };
  }

  beforeAll(() => {
    expect(evaluateIntegrationMutationGate().ok).toBe(true);
  });

  afterAll(() => {
    // disconnect handled per-test; no shared client
  });

  it('A: reserves READY match → PROCESSING + PENDING attemptNo=1 + lease', async () => {
    await withReadyFixture(async ({ prisma, persist, fx }) => {
      const now = new Date('2026-07-11T10:00:00.000Z');
      const token = createShipmentTransmissionExecutionToken(() => 'it-token-a');
      const result = await reserveTransmissionAttempt(persist, {
        userId: fx.userId,
        candidate: fx.candidate,
        payloadFingerprint: fingerprintFor(fx),
        executionToken: token,
        ...leaseWindow(now),
      });
      expect(result.success).toBe(true);
      expect(result.attemptNo).toBe(1);
      expect(result.executionToken).toBe(token);

      const match = await prisma.shipmentMatch.findFirst({
        where: { id: fx.matchId, userId: fx.userId },
        select: IT_MATCH_VERIFY_SELECT,
      });
      expect(match?.transmissionStatus).toBe('PROCESSING');
      expect(match?.transmissionLeaseToken).toBe(token);
      expect(match?.transmissionLeaseExpiresAt).not.toBeNull();

      const attempt = await prisma.shipmentTransmissionAttempt.findFirst({
        where: { id: result.attemptId!, userId: fx.userId },
        select: IT_ATTEMPT_VERIFY_SELECT,
      });
      expect(attempt?.status).toBe('PENDING');
      expect(attempt?.attemptNo).toBe(1);
      expect(attempt?.dispatchedAt).toBeNull();
    });
  });

  it('B: dispatch PENDING → PROCESSING + dispatchedAt', async () => {
    await withReadyFixture(async ({ prisma, persist, fx }) => {
      const now = new Date('2026-07-11T10:01:00.000Z');
      const token = createShipmentTransmissionExecutionToken(() => 'it-token-b');
      const reserved = await reserveTransmissionAttempt(persist, {
        userId: fx.userId,
        candidate: fx.candidate,
        payloadFingerprint: fingerprintFor(fx),
        executionToken: token,
        ...leaseWindow(now),
      });
      expect(reserved.success).toBe(true);

      const dispatched = await markTransmissionAttemptDispatched(persist, {
        userId: fx.userId,
        shipmentMatchId: fx.matchId,
        attemptId: reserved.attemptId!,
        executionToken: token,
        now: new Date(now.getTime() + 1000),
      });
      expect(dispatched.success).toBe(true);

      const attempt = await prisma.shipmentTransmissionAttempt.findFirst({
        where: { id: reserved.attemptId!, userId: fx.userId },
        select: IT_ATTEMPT_VERIFY_SELECT,
      });
      expect(attempt?.status).toBe('PROCESSING');
      expect(attempt?.dispatchedAt).not.toBeNull();

      const match = await prisma.shipmentMatch.findFirst({
        where: { id: fx.matchId, userId: fx.userId },
        select: IT_MATCH_VERIFY_SELECT,
      });
      expect(match?.transmissionStatus).toBe('PROCESSING');
    });
  });

  it('C: success → Attempt SUCCESS, Match/Order SENT, lease cleared', async () => {
    await withReadyFixture(async ({ prisma, persist, fx }) => {
      const now = new Date('2026-07-11T10:02:00.000Z');
      const token = createShipmentTransmissionExecutionToken(() => 'it-token-c');
      const reserved = await reserveTransmissionAttempt(persist, {
        userId: fx.userId,
        candidate: fx.candidate,
        payloadFingerprint: fingerprintFor(fx),
        executionToken: token,
        ...leaseWindow(now),
      });
      await markTransmissionAttemptDispatched(persist, {
        userId: fx.userId,
        shipmentMatchId: fx.matchId,
        attemptId: reserved.attemptId!,
        executionToken: token,
        now: new Date(now.getTime() + 1000),
      });
      const done = await completeTransmissionAttemptSuccess(persist, {
        userId: fx.userId,
        shipmentMatchId: fx.matchId,
        attemptId: reserved.attemptId!,
        executionToken: token,
        now: new Date(now.getTime() + 2000),
        providerRequestId: 'it-req-c',
        responseSummary: { httpStatus: 200, message: 'it-ok' },
      });
      expect(done.success).toBe(true);

      const attempt = await prisma.shipmentTransmissionAttempt.findFirst({
        where: { id: reserved.attemptId!, userId: fx.userId },
        select: IT_ATTEMPT_VERIFY_SELECT,
      });
      expect(attempt?.status).toBe('SUCCESS');
      expect(attempt?.completedAt).not.toBeNull();

      const match = await prisma.shipmentMatch.findFirst({
        where: { id: fx.matchId, userId: fx.userId },
        select: IT_MATCH_VERIFY_SELECT,
      });
      expect(match?.transmissionStatus).toBe('SENT');
      expect(match?.transmissionLeaseToken).toBeNull();

      const order = await prisma.orderSyncOrder.findFirst({
        where: { id: fx.orderId, userId: fx.userId },
        select: IT_ORDER_VERIFY_SELECT,
      });
      expect(order?.transmissionStatus).toBe('SENT');
    });
  });

  it('D: failure → FAILED + retryable + sanitized error length', async () => {
    await withReadyFixture(async ({ prisma, persist, fx }) => {
      const now = new Date('2026-07-11T10:03:00.000Z');
      const token = createShipmentTransmissionExecutionToken(() => 'it-token-d');
      const reserved = await reserveTransmissionAttempt(persist, {
        userId: fx.userId,
        candidate: fx.candidate,
        payloadFingerprint: fingerprintFor(fx),
        executionToken: token,
        ...leaseWindow(now),
      });
      await markTransmissionAttemptDispatched(persist, {
        userId: fx.userId,
        shipmentMatchId: fx.matchId,
        attemptId: reserved.attemptId!,
        executionToken: token,
        now: new Date(now.getTime() + 1000),
      });
      const longMsg = `token=FAKE_IT_NOT_A_REAL_SECRET ${'x'.repeat(600)}`;
      const done = await completeTransmissionAttemptFailure(persist, {
        userId: fx.userId,
        shipmentMatchId: fx.matchId,
        attemptId: reserved.attemptId!,
        executionToken: token,
        now: new Date(now.getTime() + 2000),
        errorCode: 'IT_FAIL',
        errorMessage: longMsg,
        retryable: true,
        responseSummary: null,
      });
      expect(done.success).toBe(true);

      const attempt = await prisma.shipmentTransmissionAttempt.findFirst({
        where: { id: reserved.attemptId!, userId: fx.userId },
        select: IT_ATTEMPT_VERIFY_SELECT,
      });
      expect(attempt?.status).toBe('FAILED');
      expect(attempt?.retryable).toBe(true);
      expect(attempt?.errorMessage?.includes('FAKE_IT_NOT_A_REAL_SECRET')).toBe(false);
      expect((attempt?.errorMessage ?? '').length).toBeLessThanOrEqual(
        TRANSMISSION_ERROR_MESSAGE_MAX_LENGTH,
      );

      const match = await prisma.shipmentMatch.findFirst({
        where: { id: fx.matchId, userId: fx.userId },
        select: IT_MATCH_VERIFY_SELECT,
      });
      expect(match?.transmissionStatus).toBe('FAILED');

      const order = await prisma.orderSyncOrder.findFirst({
        where: { id: fx.orderId, userId: fx.userId },
        select: IT_ORDER_VERIFY_SELECT,
      });
      expect(order?.transmissionStatus).toBe('FAILED');
    });
  });

  it('E: unknown → UNKNOWN on attempt/match/order (no auto READY)', async () => {
    await withReadyFixture(async ({ prisma, persist, fx }) => {
      const now = new Date('2026-07-11T10:04:00.000Z');
      const token = createShipmentTransmissionExecutionToken(() => 'it-token-e');
      const reserved = await reserveTransmissionAttempt(persist, {
        userId: fx.userId,
        candidate: fx.candidate,
        payloadFingerprint: fingerprintFor(fx),
        executionToken: token,
        ...leaseWindow(now),
      });
      await markTransmissionAttemptDispatched(persist, {
        userId: fx.userId,
        shipmentMatchId: fx.matchId,
        attemptId: reserved.attemptId!,
        executionToken: token,
        now: new Date(now.getTime() + 1000),
      });
      const done = await completeTransmissionAttemptUnknown(persist, {
        userId: fx.userId,
        shipmentMatchId: fx.matchId,
        attemptId: reserved.attemptId!,
        executionToken: token,
        now: new Date(now.getTime() + 2000),
        errorCode: 'IT_UNKNOWN',
        errorMessage: 'ambiguous',
      });
      expect(done.success).toBe(true);

      const match = await prisma.shipmentMatch.findFirst({
        where: { id: fx.matchId, userId: fx.userId },
        select: IT_MATCH_VERIFY_SELECT,
      });
      expect(match?.transmissionStatus).toBe('UNKNOWN');
      expect(match?.transmissionLeaseToken).toBeNull();

      const order = await prisma.orderSyncOrder.findFirst({
        where: { id: fx.orderId, userId: fx.userId },
        select: IT_ORDER_VERIFY_SELECT,
      });
      expect(order?.transmissionStatus).toBe('UNKNOWN');
    });
  });

  it('F: stale PENDING recover → CANCELLED + Match READY', async () => {
    await withReadyFixture(async ({ prisma, persist, fx }) => {
      const now = new Date('2026-07-11T10:05:00.000Z');
      const token = createShipmentTransmissionExecutionToken(() => 'it-token-f');
      const reserved = await reserveTransmissionAttempt(persist, {
        userId: fx.userId,
        candidate: fx.candidate,
        payloadFingerprint: fingerprintFor(fx),
        executionToken: token,
        ...leaseWindow(now),
      });
      expect(reserved.success).toBe(true);

      await prisma.shipmentMatch.updateMany({
        where: { id: fx.matchId, userId: fx.userId },
        data: { transmissionLeaseExpiresAt: new Date(now.getTime() - 60_000) },
      });

      const recovered = await recoverStalePendingAttempt(persist, {
        userId: fx.userId,
        shipmentMatchId: fx.matchId,
        attemptId: reserved.attemptId!,
        executionToken: token,
        now: new Date(now.getTime() + 120_000),
      });
      expect(recovered.success).toBe(true);
      expect(recovered.reasonCode).toBe('STALE_PENDING_RECOVERED');

      const attempt = await prisma.shipmentTransmissionAttempt.findFirst({
        where: { id: reserved.attemptId!, userId: fx.userId },
        select: IT_ATTEMPT_VERIFY_SELECT,
      });
      expect(attempt?.status).toBe('CANCELLED');

      const match = await prisma.shipmentMatch.findFirst({
        where: { id: fx.matchId, userId: fx.userId },
        select: IT_MATCH_VERIFY_SELECT,
      });
      expect(match?.transmissionStatus).toBe('READY');
      expect(match?.transmissionLeaseToken).toBeNull();
    });
  });

  it('G: stale PROCESSING recover → UNKNOWN', async () => {
    await withReadyFixture(async ({ prisma, persist, fx }) => {
      const now = new Date('2026-07-11T10:06:00.000Z');
      const token = createShipmentTransmissionExecutionToken(() => 'it-token-g');
      const reserved = await reserveTransmissionAttempt(persist, {
        userId: fx.userId,
        candidate: fx.candidate,
        payloadFingerprint: fingerprintFor(fx),
        executionToken: token,
        ...leaseWindow(now),
      });
      await markTransmissionAttemptDispatched(persist, {
        userId: fx.userId,
        shipmentMatchId: fx.matchId,
        attemptId: reserved.attemptId!,
        executionToken: token,
        now: new Date(now.getTime() + 1000),
      });
      await prisma.shipmentMatch.updateMany({
        where: { id: fx.matchId, userId: fx.userId },
        data: { transmissionLeaseExpiresAt: new Date(now.getTime() - 60_000) },
      });

      const recovered = await recoverStaleProcessingAttempt(persist, {
        userId: fx.userId,
        shipmentMatchId: fx.matchId,
        attemptId: reserved.attemptId!,
        executionToken: token,
        now: new Date(now.getTime() + 120_000),
      });
      expect(recovered.success).toBe(true);

      const attempt = await prisma.shipmentTransmissionAttempt.findFirst({
        where: { id: reserved.attemptId!, userId: fx.userId },
        select: IT_ATTEMPT_VERIFY_SELECT,
      });
      expect(attempt?.status).toBe('UNKNOWN');

      const match = await prisma.shipmentMatch.findFirst({
        where: { id: fx.matchId, userId: fx.userId },
        select: IT_MATCH_VERIFY_SELECT,
      });
      expect(match?.transmissionStatus).toBe('UNKNOWN');
      expect(match?.transmissionLeaseToken).toBeNull();
    });
  });

  it('H: lease race — exactly one reserve wins', async () => {
    await withReadyFixture(async ({ prisma, persist, fx }) => {
      const now = new Date('2026-07-11T10:07:00.000Z');
      const fp = fingerprintFor(fx);
      const [a, b] = await Promise.all([
        reserveTransmissionAttempt(persist, {
          userId: fx.userId,
          candidate: fx.candidate,
          payloadFingerprint: fp,
          executionToken: createShipmentTransmissionExecutionToken(() => 'it-token-h1'),
          ...leaseWindow(now),
        }),
        reserveTransmissionAttempt(persist, {
          userId: fx.userId,
          candidate: fx.candidate,
          payloadFingerprint: fp,
          executionToken: createShipmentTransmissionExecutionToken(() => 'it-token-h2'),
          ...leaseWindow(now),
        }),
      ]);
      const wins = [a, b].filter((r) => r.success);
      const loses = [a, b].filter((r) => !r.success);
      expect(wins).toHaveLength(1);
      expect(loses).toHaveLength(1);
      expect(
        loses[0]?.reasonCode === 'LEASE_NOT_ACQUIRED' ||
          loses[0]?.reasonCode === 'MATCH_NOT_READY',
      ).toBe(true);

      const attempts = await prisma.shipmentTransmissionAttempt.findMany({
        where: { shipmentMatchId: fx.matchId, userId: fx.userId },
        select: { id: true },
      });
      expect(attempts).toHaveLength(1);
    });
  });

  it('I: second attempt attemptNo=2 with same fingerprint', async () => {
    await withReadyFixture(async ({ prisma, persist, fx }) => {
      const now = new Date('2026-07-11T10:08:00.000Z');
      const fp = fingerprintFor(fx);
      const token1 = createShipmentTransmissionExecutionToken(() => 'it-token-i1');
      const first = await reserveTransmissionAttempt(persist, {
        userId: fx.userId,
        candidate: fx.candidate,
        payloadFingerprint: fp,
        executionToken: token1,
        ...leaseWindow(now),
      });
      await markTransmissionAttemptDispatched(persist, {
        userId: fx.userId,
        shipmentMatchId: fx.matchId,
        attemptId: first.attemptId!,
        executionToken: token1,
        now: new Date(now.getTime() + 1000),
      });
      await completeTransmissionAttemptFailure(persist, {
        userId: fx.userId,
        shipmentMatchId: fx.matchId,
        attemptId: first.attemptId!,
        executionToken: token1,
        now: new Date(now.getTime() + 2000),
        errorCode: 'IT_RETRY',
        errorMessage: 'retry',
        retryable: true,
        responseSummary: null,
      });

      // Test policy: prepare Match READY again for retry
      await prisma.shipmentMatch.updateMany({
        where: { id: fx.matchId, userId: fx.userId },
        data: {
          transmissionStatus: 'READY',
          transmissionLeaseToken: null,
          transmissionLeaseExpiresAt: null,
          transmissionErrorMessage: null,
        },
      });

      const token2 = createShipmentTransmissionExecutionToken(() => 'it-token-i2');
      const second = await reserveTransmissionAttempt(persist, {
        userId: fx.userId,
        candidate: fx.candidate,
        payloadFingerprint: fp,
        executionToken: token2,
        now: new Date(now.getTime() + 3000),
        leaseExpiresAt: new Date(now.getTime() + 3000 + SHIPMENT_TRANSMISSION_LEASE_MS),
      });
      expect(second.success).toBe(true);
      expect(second.attemptNo).toBe(2);

      const attempt = await prisma.shipmentTransmissionAttempt.findFirst({
        where: { id: second.attemptId!, userId: fx.userId },
        select: IT_ATTEMPT_VERIFY_SELECT,
      });
      expect(attempt?.payloadFingerprint).toBe(fp);
      expect(attempt?.attemptNo).toBe(2);
    });
  });

  it('J: stale writer completion blocked', async () => {
    await withReadyFixture(async ({ prisma, persist, fx }) => {
      const now = new Date('2026-07-11T10:09:00.000Z');
      const fp = fingerprintFor(fx);
      const tokenOld = createShipmentTransmissionExecutionToken(() => 'it-token-j-old');
      const first = await reserveTransmissionAttempt(persist, {
        userId: fx.userId,
        candidate: fx.candidate,
        payloadFingerprint: fp,
        executionToken: tokenOld,
        ...leaseWindow(now),
      });
      await markTransmissionAttemptDispatched(persist, {
        userId: fx.userId,
        shipmentMatchId: fx.matchId,
        attemptId: first.attemptId!,
        executionToken: tokenOld,
        now: new Date(now.getTime() + 500),
      });

      // Expire + recover path then new reserve, or force new lease via recover pending after expire
      await prisma.shipmentMatch.updateMany({
        where: { id: fx.matchId, userId: fx.userId },
        data: { transmissionLeaseExpiresAt: new Date(now.getTime() - 1) },
      });
      // Mark attempt back to PENDING without dispatched for recover? Already PROCESSING.
      // Use recover PROCESSING → UNKNOWN, then set READY for new reserve.
      await recoverStaleProcessingAttempt(persist, {
        userId: fx.userId,
        shipmentMatchId: fx.matchId,
        attemptId: first.attemptId!,
        executionToken: tokenOld,
        now: new Date(now.getTime() + 60_000),
      });
      await prisma.shipmentMatch.updateMany({
        where: { id: fx.matchId, userId: fx.userId },
        data: {
          transmissionStatus: 'READY',
          transmissionLeaseToken: null,
          transmissionLeaseExpiresAt: null,
        },
      });

      const tokenNew = createShipmentTransmissionExecutionToken(() => 'it-token-j-new');
      const second = await reserveTransmissionAttempt(persist, {
        userId: fx.userId,
        candidate: fx.candidate,
        payloadFingerprint: fp,
        executionToken: tokenNew,
        now: new Date(now.getTime() + 70_000),
        leaseExpiresAt: new Date(now.getTime() + 70_000 + SHIPMENT_TRANSMISSION_LEASE_MS),
      });
      expect(second.success).toBe(true);
      await markTransmissionAttemptDispatched(persist, {
        userId: fx.userId,
        shipmentMatchId: fx.matchId,
        attemptId: second.attemptId!,
        executionToken: tokenNew,
        now: new Date(now.getTime() + 71_000),
      });

      const stale = await completeTransmissionAttemptSuccess(persist, {
        userId: fx.userId,
        shipmentMatchId: fx.matchId,
        attemptId: first.attemptId!,
        executionToken: tokenOld,
        now: new Date(now.getTime() + 72_000),
        providerRequestId: null,
        responseSummary: null,
      });
      expect(stale.success).toBe(false);

      const match = await prisma.shipmentMatch.findFirst({
        where: { id: fx.matchId, userId: fx.userId },
        select: IT_MATCH_VERIFY_SELECT,
      });
      expect(match?.transmissionStatus).toBe('PROCESSING');
      expect(match?.transmissionLeaseToken).toBe(tokenNew);
    });
  });

  it('extra: additional READY match fixture helper works', async () => {
    await withReadyFixture(async ({ prisma, fx }) => {
      const extra = await createAdditionalReadyMatch(prisma, fx, 'b');
      expect(extra.matchId).not.toBe(fx.matchId);
      const match = await prisma.shipmentMatch.findFirst({
        where: { id: extra.matchId, userId: fx.userId },
        select: IT_MATCH_VERIFY_SELECT,
      });
      expect(match?.transmissionStatus).toBe('READY');
    });
  });
});

describe('shipment transmission integration gate (no DB)', () => {
  it('skips real scenarios when IT run env is not set', () => {
    // This file is excluded from default vitest; when loaded without gate, describe.skipIf hides DB tests.
    expect(typeof enabled).toBe('boolean');
  });
});
