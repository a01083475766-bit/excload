import { describe, expect, it, vi } from 'vitest';

import { createMockShipmentTransmissionAdapter } from '@/app/lib/order-integration/transmission/mock-adapter';
import {
  parseTransmitMockBody,
  SHIPMENT_TRANSMISSION_MOCK_MAX_MATCH_IDS,
} from '@/app/lib/order-integration/transmission/parse-transmit-mock-body';
import { runMockTransmitService } from '@/app/lib/order-integration/transmission/mock-transmit-service';
import type {
  MockTransmitBatchRecord,
  MockTransmitMatchRecord,
  MockTransmitReadRepository,
  MockTransmitServiceDeps,
} from '@/app/lib/order-integration/transmission/mock-transmit-service';
import type { PersistedShipmentTransmissionResult } from '@/app/lib/order-integration/transmission/persisted-executor';
import type { ShipmentTransmissionCandidate } from '@/app/lib/order-integration/transmission/types';

describe('parseTransmitMockBody', () => {
  it('requires body and non-empty matchIds', () => {
    expect(parseTransmitMockBody(null).ok).toBe(false);
    expect(parseTransmitMockBody({}).ok).toBe(false);
    expect(parseTransmitMockBody({ matchIds: [] }).ok).toBe(false);
  });

  it('trims, dedupes, preserves order, counts duplicates', () => {
    const parsed = parseTransmitMockBody({
      matchIds: [' match-2 ', 'match-1', 'match-2', ' match-1 '],
      extra: true,
    });
    expect(parsed).toEqual({
      ok: true,
      body: {
        matchIds: ['match-2', 'match-1'],
        requestedCount: 4,
        duplicateMatchIdCount: 2,
      },
    });
  });

  it('rejects blank, non-string, and oversize raw arrays', () => {
    expect(parseTransmitMockBody({ matchIds: [' '] }).ok).toBe(false);
    expect(parseTransmitMockBody({ matchIds: [1] }).ok).toBe(false);
    expect(
      parseTransmitMockBody({
        matchIds: Array.from({ length: SHIPMENT_TRANSMISSION_MOCK_MAX_MATCH_IDS + 1 }, (_, i) => `m${i}`),
      }).ok,
    ).toBe(false);
  });
});

function buildBatch(overrides: Partial<MockTransmitBatchRecord> = {}): MockTransmitBatchRecord {
  return {
    id: 'batch-1',
    userId: 'user-a',
    provider: 'COUPANG',
    integrationAccountId: 'acc-1',
    status: 'READY',
    originalFileName: 'shipment-transmission-it-file.xlsx',
    ...overrides,
  };
}

function buildMatch(overrides: Partial<MockTransmitMatchRecord> = {}): MockTransmitMatchRecord {
  return {
    id: 'match-1',
    userId: 'user-a',
    uploadBatchId: 'batch-1',
    provider: 'COUPANG',
    integrationAccountId: 'acc-1',
    userConfirmationStatus: 'CONFIRMED',
    transmissionStatus: 'READY',
    orderSyncOrderId: 'order-1',
    finalTrackingNumber: null,
    finalCarrierCode: null,
    finalCarrierName: null,
    uploadRow: {
      trackingNumber: '012345678901',
      carrierCode: 'CJ',
      carrierName: 'CJ대한통운',
    },
    orderSyncOrder: {
      id: 'order-1',
      userId: 'user-a',
      provider: 'COUPANG',
      integrationAccountId: 'acc-1',
      mallOrderNo: 'MALL-1',
      excloadOrderNo: 'EXC-1',
      mallLineItemIds: ['LI-1'],
    },
    ...overrides,
  };
}

function candidateFrom(match: MockTransmitMatchRecord): ShipmentTransmissionCandidate {
  return {
    provider: 'COUPANG',
    integrationAccountId: 'acc-1',
    uploadBatchId: 'batch-1',
    matchId: match.id,
    orderSyncOrderId: 'order-1',
    mallOrderNo: 'MALL-1',
    excloadOrderNo: 'EXC-1',
    mallLineItemIds: ['LI-1'],
    trackingNumber: '012345678901',
    courierCode: 'CJ',
    courierName: 'CJ대한통운',
  };
}

function persistedSuccess(matchId: string): PersistedShipmentTransmissionResult {
  const candidate = candidateFrom(buildMatch({ id: matchId }));
  return {
    success: true,
    adapterCalled: true,
    candidate,
    reserve: {
      success: true,
      reasonCode: 'OK',
      shipmentMatchId: matchId,
      attemptId: 'att-1',
      attemptNo: 1,
      executionToken: 'tok',
      previousStatus: 'READY',
      nextStatus: 'PROCESSING',
    },
    dispatch: {
      success: true,
      reasonCode: 'OK',
      shipmentMatchId: matchId,
      attemptId: 'att-1',
      attemptNo: 1,
      executionToken: 'tok',
      previousStatus: 'PENDING',
      nextStatus: 'PROCESSING',
    },
    complete: {
      success: true,
      reasonCode: 'OK',
      shipmentMatchId: matchId,
      attemptId: 'att-1',
      attemptNo: 1,
      executionToken: 'tok',
      previousStatus: 'PROCESSING',
      nextStatus: 'SENT',
    },
    adapterResult: {
      success: true,
      provider: 'COUPANG',
      matchId,
      providerRequestId: 'mock-req',
      errorCode: null,
      errorMessage: null,
      retryable: false,
      outcomeKind: 'success',
      responseSummary: null,
    },
    outcomeKind: 'success',
  };
}

const GOOD_ENV = {
  nodeEnv: 'test',
  vercelEnv: 'preview',
  envProfile: 'smoke',
  featureEnabled: 'true',
  allowedUserIds: 'user-a',
  batchPrefix: 'shipment-transmission-it-',
};

function buildDeps(options: {
  batch?: MockTransmitBatchRecord | null;
  matches?: MockTransmitMatchRecord[];
  credentialConfigured?: boolean;
  runPersisted?: MockTransmitServiceDeps['runPersisted'];
}): {
  deps: MockTransmitServiceDeps;
  findBatch: ReturnType<typeof vi.fn>;
  findMatches: ReturnType<typeof vi.fn>;
  runPersisted: ReturnType<typeof vi.fn>;
} {
  const findBatch = vi.fn(async () =>
    options.batch === undefined ? buildBatch() : options.batch,
  );
  const findMatches = vi.fn(async () => options.matches ?? [buildMatch()]);
  const runPersisted =
    options.runPersisted ??
    vi.fn(async (input: { candidate: ShipmentTransmissionCandidate }) =>
      persistedSuccess(input.candidate.matchId),
    );

  const readRepository: MockTransmitReadRepository = {
    findBatchForMockTransmit: findBatch,
    findMatchesForMockTransmit: findMatches,
    resolveCredentialConfigured: vi.fn(async () => options.credentialConfigured === true),
  };

  return {
    findBatch,
    findMatches,
    runPersisted: runPersisted as ReturnType<typeof vi.fn>,
    deps: {
      env: GOOD_ENV,
      readRepository,
      resolveAdapter: () =>
        createMockShipmentTransmissionAdapter({
          provider: 'COUPANG',
          requestIdFactory: () => 'mock-fixed',
        }),
      persistClient: { $transaction: vi.fn() } as never,
      runPersisted: runPersisted as MockTransmitServiceDeps['runPersisted'],
    },
  };
}

describe('runMockTransmitService', () => {
  it('blocks production before any DB read', async () => {
    const { deps, findBatch, findMatches } = buildDeps({});
    deps.env = { ...GOOD_ENV, vercelEnv: 'production' };
    const result = await runMockTransmitService(deps, {
      userId: 'user-a',
      batchId: 'batch-1',
      parsedBody: { matchIds: ['match-1'], requestedCount: 1, duplicateMatchIdCount: 0 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(findBatch).not.toHaveBeenCalled();
    expect(findMatches).not.toHaveBeenCalled();
  });

  it('blocks allowlist miss before DB read', async () => {
    const { deps, findBatch } = buildDeps({});
    const result = await runMockTransmitService(deps, {
      userId: 'user-z',
      batchId: 'batch-1',
      parsedBody: { matchIds: ['match-1'], requestedCount: 1, duplicateMatchIdCount: 0 },
    });
    expect(result.ok).toBe(false);
    expect(findBatch).not.toHaveBeenCalled();
  });

  it('returns 404 for missing batch and 409 for not READY', async () => {
    const missing = buildDeps({ batch: null });
    const notReady = buildDeps({ batch: buildBatch({ status: 'UPLOADED' }) });

    const r404 = await runMockTransmitService(missing.deps, {
      userId: 'user-a',
      batchId: 'batch-1',
      parsedBody: { matchIds: ['match-1'], requestedCount: 1, duplicateMatchIdCount: 0 },
    });
    expect(r404).toMatchObject({ ok: false, status: 404 });

    const r409 = await runMockTransmitService(notReady.deps, {
      userId: 'user-a',
      batchId: 'batch-1',
      parsedBody: { matchIds: ['match-1'], requestedCount: 1, duplicateMatchIdCount: 0 },
    });
    expect(r409).toMatchObject({ ok: false, status: 409 });
  });

  it('blocks credential-configured accounts after batch read', async () => {
    const { deps, findMatches } = buildDeps({ credentialConfigured: true });
    const result = await runMockTransmitService(deps, {
      userId: 'user-a',
      batchId: 'batch-1',
      parsedBody: { matchIds: ['match-1'], requestedCount: 1, duplicateMatchIdCount: 0 },
    });
    expect(result).toMatchObject({ ok: false, status: 403, reasonCode: 'MOCK_CREDENTIAL_ACCOUNT_BLOCKED' });
    expect(findMatches).not.toHaveBeenCalled();
  });

  it('skips NONE/FAILED/SENT and runs READY success', async () => {
    const matches = [
      buildMatch({ id: 'm-none', transmissionStatus: 'NONE' }),
      buildMatch({ id: 'm-ready', transmissionStatus: 'READY' }),
      buildMatch({ id: 'm-sent', transmissionStatus: 'SENT' }),
    ];
    const { deps, runPersisted } = buildDeps({ matches });
    const result = await runMockTransmitService(deps, {
      userId: 'user-a',
      batchId: 'batch-1',
      parsedBody: {
        matchIds: ['m-none', 'm-ready', 'm-sent', 'missing'],
        requestedCount: 4,
        duplicateMatchIdCount: 0,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.results.map((r) => r.matchId)).toEqual([
      'm-none',
      'm-ready',
      'm-sent',
      'missing',
    ]);
    expect(result.body.results[0]?.errorCode).toBe('MATCH_NOT_READY_FOR_EXECUTION');
    expect(result.body.results[1]?.success).toBe(true);
    expect(result.body.results[1]?.attempted).toBe(true);
    expect(result.body.results[1]?.attemptId).toBe('att-1');
    expect(result.body.results[2]?.errorCode).toBe('MATCH_ALREADY_SENT');
    expect(result.body.results[3]?.errorCode).toBe('MATCH_NOT_FOUND');
    expect(result.body.results[0]?.attemptId).toBeNull();
    expect(runPersisted).toHaveBeenCalledTimes(1);
    const s = result.body.summary;
    expect(s.attemptedCount).toBe(s.successCount + s.failureCount + s.unknownCount);
    expect(s.evaluatedCount).toBe(s.attemptedCount + s.skippedCount);
    expect(JSON.stringify(result.body)).not.toMatch(/MALL-1|012345678901|tok|fingerprint|receiver/i);
  });

  it('continues after individual persist failure (partial success)', async () => {
    const matches = [
      buildMatch({ id: 'm1', transmissionStatus: 'READY' }),
      buildMatch({ id: 'm2', transmissionStatus: 'READY' }),
    ];
    let calls = 0;
    const runPersisted = vi.fn(async (input: { candidate: ShipmentTransmissionCandidate }) => {
      calls += 1;
      if (calls === 1) {
        const base = persistedSuccess(input.candidate.matchId);
        return {
          ...base,
          success: false,
          outcomeKind: 'failure' as const,
          adapterResult: {
            ...base.adapterResult!,
            success: false,
            retryable: true,
            errorCode: 'MOCK_RETRYABLE_FAILURE',
            errorMessage: 'mock adapter retryable failure',
            outcomeKind: 'failure' as const,
          },
          complete: {
            ...base.complete!,
            nextStatus: 'FAILED',
          },
        };
      }
      return persistedSuccess(input.candidate.matchId);
    });
    const { deps } = buildDeps({
      matches,
      runPersisted: runPersisted as MockTransmitServiceDeps['runPersisted'],
    });
    const result = await runMockTransmitService(deps, {
      userId: 'user-a',
      batchId: 'batch-1',
      parsedBody: {
        matchIds: ['m1', 'm2'],
        requestedCount: 2,
        duplicateMatchIdCount: 0,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.summary.successCount).toBe(1);
    expect(result.body.summary.failureCount).toBe(1);
    expect(result.body.summary.retryableFailureCount).toBe(1);
    expect(runPersisted).toHaveBeenCalledTimes(2);
  });

  it('maps unknown persisted outcome separately from failure', async () => {
    const runPersisted = vi.fn(async (input: { candidate: ShipmentTransmissionCandidate }) => {
      const base = persistedSuccess(input.candidate.matchId);
      return {
        ...base,
        success: false,
        outcomeKind: 'unknown' as const,
        adapterResult: {
          ...base.adapterResult!,
          success: false,
          errorCode: 'MOCK_UNKNOWN_RESULT',
          errorMessage: 'Mock transmission result is unknown.',
          outcomeKind: 'unknown' as const,
        },
        complete: { ...base.complete!, nextStatus: 'UNKNOWN' },
      };
    });
    const { deps } = buildDeps({
      runPersisted: runPersisted as MockTransmitServiceDeps['runPersisted'],
    });
    const result = await runMockTransmitService(deps, {
      userId: 'user-a',
      batchId: 'batch-1',
      parsedBody: { matchIds: ['match-1'], requestedCount: 1, duplicateMatchIdCount: 0 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.summary.unknownCount).toBe(1);
    expect(result.body.summary.failureCount).toBe(0);
  });
});
