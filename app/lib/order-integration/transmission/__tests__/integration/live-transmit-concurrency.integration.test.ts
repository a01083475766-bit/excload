/**
 * Live transmit concurrency + allowlist gate — smoke DB integration.
 *
 * Uses real reserveTransmissionAttempt via runPersistedShipmentTransmission.
 * Gated by SHIPMENT_TRANSMISSION_IT_RUN=true (wrapper only).
 * Excluded from default vitest; run via:
 *   npm run order-transmission:test-db:integration
 * or:
 *   npx vitest run -c vitest.integration.config.ts <this-file>
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SHIPMENT_UPLOAD_BATCH_READY_STATUS } from '@/app/lib/order-integration/shipments/refresh-shipment-upload-batch-ready-status';
import { createPrismaShipmentTransmissionPersistClient } from '@/app/lib/order-integration/transmission/prisma-persist-client';
import { runPersistedShipmentTransmission } from '@/app/lib/order-integration/transmission/persisted-executor';
import { runShipmentTransmitService } from '@/app/lib/order-integration/transmission/transmit-service';
import {
  createShipmentTransmissionReadRepository,
  type PrepareShipmentMatchForTransmitResult,
  type ShipmentTransmissionReadPrismaClient,
} from '@/app/lib/order-integration/transmission/read-repository';
import type {
  ShipmentTransmissionAdapter,
  ShipmentTransmissionAdapterResult,
  ShipmentTransmissionCandidate,
} from '@/app/lib/order-integration/transmission/types';
import {
  cleanupShipmentTransmissionItIds,
  trackAttemptsForMatches,
} from '@/app/lib/order-integration/transmission/__tests__/integration/support/cleanup';
import { createEmptyItIds } from '@/app/lib/order-integration/transmission/__tests__/integration/support/cleanup-plans';
import { createCleanupRegistry } from '@/app/lib/order-integration/transmission/__tests__/integration/support/cleanup-registry';
import {
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
  cleanupPendingRegistryEntries,
  runTrackedCleanup,
} from '@/app/lib/order-integration/transmission/__tests__/integration/support/scenario-harness';

const enabled = evaluateIntegrationMutationGate().ok;

describe.skipIf(!enabled)('live transmit concurrency (smoke DB)', () => {
  type Ctx = {
    prisma: ReturnType<typeof createIntegrationPrismaClient>;
    persist: ReturnType<typeof createPrismaShipmentTransmissionPersistClient>;
    fx: ReadyTransmissionFixture;
  };

  const registry = createCleanupRegistry();
  let totalDeleted = 0;
  let disconnectPass = true;
  let scenarioSeq = 0;
  const fixtureRunIds: string[] = [];

  async function withReadyFixture(run: (ctx: Ctx) => Promise<void>): Promise<void> {
    const abort = registry.getSuiteAbortReason();
    if (abort) {
      throw new Error(`suite aborted before scenario: ${abort}`);
    }
    expect(evaluateIntegrationMutationGate().ok).toBe(true);

    const key = `scenario-${++scenarioSeq}`;
    const ids = createEmptyItIds(createShipmentTransmissionItRunId());
    const entry = registry.register(key, ids);
    fixtureRunIds.push(ids.runId);
    const prisma = createIntegrationPrismaClient();
    const persist = createPrismaShipmentTransmissionPersistClient(prisma);

    try {
      const fx = await createReadyTransmissionFixture(prisma, {
        runId: ids.runId,
        ids,
      });
      entry.flags.fixtureCreated = true;
      // eslint-disable-next-line no-console -- IT measurement for operator report
      console.log(`[IT_METRICS] fixtureCreated key=${key} runId=${ids.runId}`);
      await run({ prisma, persist, fx });
      entry.flags.testCompleted = true;
    } finally {
      const result = await runTrackedCleanup({
        entry,
        trackAttempts: (tracked) => trackAttemptsForMatches(prisma, tracked),
        cleanup: (tracked) => cleanupShipmentTransmissionItIds(prisma, tracked),
        disconnect: () => disconnectIntegrationPrisma(prisma),
      });
      totalDeleted += result.deletedTotal;
      if (!result.disconnectOk) disconnectPass = false;
      if (!result.cleanupOk) {
        registry.abortSuite(entry.flags.cleanupErrorCode ?? 'CLEANUP_FAIL');
      } else {
        registry.markFullyCleaned(key);
      }
      // eslint-disable-next-line no-console -- IT measurement for operator report
      console.log(
        `[IT_METRICS] cleanup key=${key} ok=${result.cleanupOk} deleted=${result.deletedTotal} pending=${registry.hasPending()}`,
      );
      expect(result.cleanupOk, `cleanup failed: ${entry.flags.cleanupErrorCode ?? 'unknown'}`).toBe(
        true,
      );
      expect(result.disconnectOk, 'disconnect failed').toBe(true);
    }
  }

  beforeAll(() => {
    expect(enabled).toBe(true);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (!enabled) return;
    if (!registry.hasPending()) return;
    const fallback = await cleanupPendingRegistryEntries({
      registry,
      createCleanupClient: () => {
        const prisma = createIntegrationPrismaClient();
        return {
          trackAttempts: (ids) => trackAttemptsForMatches(prisma, ids),
          cleanup: (ids) => cleanupShipmentTransmissionItIds(prisma, ids),
          disconnect: () => disconnectIntegrationPrisma(prisma),
        };
      },
    });
    totalDeleted += fallback.deletedTotal;
    if (!fallback.disconnectPass) disconnectPass = false;
    if (!fallback.cleanupPass) {
      expect.fail(`afterEach cleanup FAIL: ${fallback.errorCode ?? 'unknown'}`);
    }
  });

  afterAll(async () => {
    if (!enabled) return;
    const finalSweep = await cleanupPendingRegistryEntries({
      registry,
      createCleanupClient: () => {
        const prisma = createIntegrationPrismaClient();
        return {
          trackAttempts: (ids) => trackAttemptsForMatches(prisma, ids),
          cleanup: (ids) => cleanupShipmentTransmissionItIds(prisma, ids),
          disconnect: () => disconnectIntegrationPrisma(prisma),
        };
      },
    });
    totalDeleted += finalSweep.deletedTotal;
    if (!finalSweep.disconnectPass) disconnectPass = false;
    // eslint-disable-next-line no-console -- IT measurement for operator report
    console.log(
      `[IT_METRICS] afterAll pending=${registry.hasPending()} totalDeleted=${totalDeleted} runIds=${fixtureRunIds.join(',')}`,
    );
    expect(disconnectPass).toBe(true);
    expect(finalSweep.cleanupPass).toBe(true);
    expect(registry.hasPending()).toBe(false);
    expect(totalDeleted).toBeGreaterThanOrEqual(0);
  });

  it('concurrent persisted transmit: exactly one lease, one attempt, one adapter call', async () => {
    await withReadyFixture(async ({ prisma, persist, fx }) => {
      const transmit = vi.fn(
        async (
          candidate: ShipmentTransmissionCandidate,
        ): Promise<ShipmentTransmissionAdapterResult> => ({
          success: true,
          provider: candidate.provider,
          matchId: candidate.matchId,
          outcomeKind: 'success',
          errorCode: null,
          errorMessage: null,
          providerRequestId: 'it-concurrent-1',
          retryable: false,
          responseSummary: { providerStatusCode: 'OK', message: 'it-ok' },
        }),
      );

      const adapter: ShipmentTransmissionAdapter = {
        provider: fx.candidate.provider,
        buildPayload: () => ({}),
        transmit,
      };

      const now = new Date('2026-07-24T08:00:00.000Z');
      const [a, b] = await Promise.all([
        runPersistedShipmentTransmission({
          userId: fx.userId,
          candidate: fx.candidate,
          adapter,
          persistClient: persist,
          now,
          executionTokenFactory: () => 'it-live-conc-a',
        }),
        runPersistedShipmentTransmission({
          userId: fx.userId,
          candidate: fx.candidate,
          adapter,
          persistClient: persist,
          now,
          executionTokenFactory: () => 'it-live-conc-b',
        }),
      ]);

      const results = [a, b];
      const winners = results.filter((r) => r.reserve.success && r.adapterCalled);
      const losers = results.filter((r) => !r.reserve.success);
      const leaseAcquireCount = results.filter((r) => r.reserve.success).length;
      const successCount = results.filter((r) => r.success).length;

      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      expect(losers[0]?.adapterCalled).toBe(false);
      expect(transmit).toHaveBeenCalledTimes(1);
      expect(successCount).toBe(1);

      const attempts = await prisma.shipmentTransmissionAttempt.findMany({
        where: { shipmentMatchId: fx.matchId, userId: fx.userId },
        select: { id: true, status: true },
      });
      expect(attempts).toHaveLength(1);

      const match = await prisma.shipmentMatch.findFirst({
        where: { id: fx.matchId, userId: fx.userId },
        select: { transmissionStatus: true },
      });
      expect(match?.transmissionStatus).toBe('SENT');

      // eslint-disable-next-line no-console -- IT measurement for operator report
      console.log(
        `[IT_METRICS] concurrency reqA={reserve:${a.reserve.success},adapter:${a.adapterCalled},success:${a.success}} reqB={reserve:${b.reserve.success},adapter:${b.adapterCalled},success:${b.success}} winners=${winners.length} losers=${losers.length} lease=${leaseAcquireCount} attempts=${attempts.length} adapterCalls=${transmit.mock.calls.length} successCount=${successCount}`,
      );
    });
  });

  it('allowlist missing: no lease and no adapter call', async () => {
    await withReadyFixture(async ({ prisma, fx }) => {
      const transmit = vi.fn(async () => {
        throw new Error('adapter must not run');
      });

      const result = await runShipmentTransmitService(
        {
          enabled: true,
          allowedProviders: [],
          allowedIntegrationAccountIds: [],
          // Same PrismaClient bridge as transmit route.ts
          readRepository: createShipmentTransmissionReadRepository(
            prisma as unknown as ShipmentTransmissionReadPrismaClient,
          ),
          persistClient: createPrismaShipmentTransmissionPersistClient(prisma),
          resolveAdapter: () =>
            ({
              provider: fx.candidate.provider,
              buildPayload: () => ({}),
              transmit,
            }) as ShipmentTransmissionAdapter,
          prepareForTransmit: async () => {
            throw new Error('prepare must not run when allowlist empty');
          },
        },
        {
          userId: fx.userId,
          batchId: fx.uploadBatchId,
          parsedBody: { matchIds: [fx.matchId], retryFailed: false },
        },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasonCode).toBe('LIVE_ALLOWLIST_NOT_CONFIGURED');
      }
      expect(transmit).not.toHaveBeenCalled();

      const attempts = await prisma.shipmentTransmissionAttempt.findMany({
        where: { shipmentMatchId: fx.matchId, userId: fx.userId },
        select: { id: true },
      });
      expect(attempts).toHaveLength(0);

      const match = await prisma.shipmentMatch.findFirst({
        where: { id: fx.matchId, userId: fx.userId },
        select: { transmissionStatus: true, transmissionLeaseToken: true },
      });
      expect(match?.transmissionStatus).toBe('READY');
      expect(match?.transmissionLeaseToken).toBeNull();

      // eslint-disable-next-line no-console -- IT measurement for operator report
      console.log(
        `[IT_METRICS] allowlist_missing lease=${match?.transmissionLeaseToken ? 1 : 0} attempts=${attempts.length} adapterCalls=${transmit.mock.calls.length}`,
      );
    });
  });

  it('allowlist provider mismatch: no lease and no adapter call', async () => {
    await withReadyFixture(async ({ prisma, fx }) => {
      // Fixture upload batch defaults to MATCHED; live transmit requires READY
      // so the request reaches candidate allowlist (same as unit allowlist tests).
      await prisma.shipmentUploadBatch.updateMany({
        where: { id: fx.uploadBatchId, userId: fx.userId },
        data: { status: SHIPMENT_UPLOAD_BATCH_READY_STATUS },
      });
      expect(fx.candidate.provider).toBe('COUPANG');

      const transmit = vi.fn(async () => {
        throw new Error('adapter must not run');
      });
      const prepareForTransmit = vi.fn(
        async (): Promise<PrepareShipmentMatchForTransmitResult> => ({
          ok: true,
          reasonCode: null,
        }),
      );

      // Allow SMARTSTORE only — COUPANG fixture must be blocked by provider gate.
      const result = await runShipmentTransmitService(
        {
          enabled: true,
          allowedProviders: ['SMARTSTORE'],
          allowedIntegrationAccountIds: [fx.accountId],
          // Same PrismaClient bridge as transmit route.ts
          readRepository: createShipmentTransmissionReadRepository(
            prisma as unknown as ShipmentTransmissionReadPrismaClient,
          ),
          persistClient: createPrismaShipmentTransmissionPersistClient(prisma),
          resolveAdapter: () =>
            ({
              provider: fx.candidate.provider,
              buildPayload: () => ({}),
              transmit,
            }) as ShipmentTransmissionAdapter,
          prepareForTransmit,
        },
        {
          userId: fx.userId,
          batchId: fx.uploadBatchId,
          parsedBody: { matchIds: [fx.matchId], retryFailed: false },
        },
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.body.results[0]?.attempted).toBe(false);
        expect(result.body.results[0]?.errorCode).toBe('LIVE_PROVIDER_NOT_ALLOWED');
        expect(result.body.summary.successCount).toBe(0);
        expect(result.body.summary.attemptedCount).toBe(0);
      }
      expect(transmit).not.toHaveBeenCalled();
      expect(prepareForTransmit).not.toHaveBeenCalled();

      const attempts = await prisma.shipmentTransmissionAttempt.findMany({
        where: { shipmentMatchId: fx.matchId, userId: fx.userId },
        select: { id: true },
      });
      expect(attempts).toHaveLength(0);

      const match = await prisma.shipmentMatch.findFirst({
        where: { id: fx.matchId, userId: fx.userId },
        select: { transmissionStatus: true, transmissionLeaseToken: true },
      });
      expect(match?.transmissionStatus).toBe('READY');
      expect(match?.transmissionLeaseToken).toBeNull();

      // eslint-disable-next-line no-console -- IT measurement for operator report
      console.log(
        `[IT_METRICS] allowlist_provider_mismatch reasonCode=LIVE_PROVIDER_NOT_ALLOWED lease=${match?.transmissionLeaseToken ? 1 : 0} attempts=${attempts.length} adapterCalls=${transmit.mock.calls.length} successCount=0`,
      );
    });
  });
});

describe('live transmit concurrency gate (no DB)', () => {
  it('reports whether smoke IT mutation gate is enabled', () => {
    const gate = evaluateIntegrationMutationGate();
    expect(typeof gate.ok).toBe('boolean');
    if (!gate.ok) {
      expect(gate.reason.length).toBeGreaterThan(0);
    }
  });
});
