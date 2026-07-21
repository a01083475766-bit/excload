import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrderIntegrationProvider } from '@prisma/client';

import { createMemoryTransmissionPersistClient } from '@/app/lib/order-integration/transmission/__tests__/support/memory-persist-client';
import { createMockShipmentTransmissionAdapter } from '@/app/lib/order-integration/transmission/mock-adapter';
import { runPersistedShipmentTransmission } from '@/app/lib/order-integration/transmission/persisted-executor';
import type { ShipmentTransmissionMatchRow } from '@/app/lib/order-integration/transmission/repository';
import type {
  ShipmentTransmissionAdapter,
  ShipmentTransmissionCandidate,
} from '@/app/lib/order-integration/transmission/types';

const CANDIDATE: ShipmentTransmissionCandidate = {
  provider: 'COUPANG',
  integrationAccountId: 'acc-1',
  uploadBatchId: 'batch-1',
  matchId: 'match-1',
  orderSyncOrderId: 'order-1',
  mallOrderNo: 'MALL-1',
  excloadOrderNo: 'EXC-1',
  mallLineItemIds: ['PO-1'],
  trackingNumber: '012345678901',
  courierCode: 'CJ',
  courierName: 'CJ대한통운',
};

const now = new Date('2026-07-10T12:00:00.000Z');

function readyMatch(): ShipmentTransmissionMatchRow {
  return {
    id: 'match-1',
    userId: 'user-a',
    uploadBatchId: 'batch-1',
    provider: 'COUPANG' as OrderIntegrationProvider,
    integrationAccountId: 'acc-1',
    orderSyncOrderId: 'order-1',
    transmissionStatus: 'READY',
    transmissionLeaseToken: null,
    transmissionLeaseExpiresAt: null,
    lastTransmissionAttemptAt: null,
    transmissionErrorMessage: null,
  };
}

describe('runPersistedShipmentTransmission', () => {
  let mem: ReturnType<typeof createMemoryTransmissionPersistClient>;

  beforeEach(() => {
    mem = createMemoryTransmissionPersistClient();
    mem.seedMatch(readyMatch());
    mem.seedOrder({ id: 'order-1', userId: 'user-a', transmissionStatus: 'NONE' });
  });

  it('runs success flow end-to-end', async () => {
    const result = await runPersistedShipmentTransmission({
      userId: 'user-a',
      candidate: CANDIDATE,
      adapter: createMockShipmentTransmissionAdapter({ provider: 'COUPANG' }),
      persistClient: mem.client,
      now,
      executionTokenFactory: () => 'token-ok',
    });
    expect(result.adapterCalled).toBe(true);
    expect(result.outcomeKind).toBe('success');
    expect(result.complete?.success).toBe(true);
    expect(mem.getMatch('match-1')?.transmissionStatus).toBe('SENT');
  });

  it('runs clear failure flow', async () => {
    const result = await runPersistedShipmentTransmission({
      userId: 'user-a',
      candidate: CANDIDATE,
      adapter: createMockShipmentTransmissionAdapter({
        provider: 'COUPANG',
        defaultOutcome: 'non_retryable_failure',
      }),
      persistClient: mem.client,
      now,
      executionTokenFactory: () => 'token-fail',
    });
    expect(result.adapterCalled).toBe(true);
    expect(result.outcomeKind).toBe('failure');
    expect(mem.getMatch('match-1')?.transmissionStatus).toBe('FAILED');
  });

  it('marks UNKNOWN when adapter returns outcomeKind unknown', async () => {
    const adapter: ShipmentTransmissionAdapter = {
      provider: 'COUPANG',
      buildPayload: () => ({}),
      transmit: async () => ({
        success: false,
        provider: 'COUPANG',
        matchId: 'match-1',
        providerRequestId: null,
        errorCode: 'TIMEOUT',
        errorMessage: 'timeout',
        retryable: false,
        responseSummary: { message: 'timeout' },
        outcomeKind: 'unknown',
      }),
    };
    const result = await runPersistedShipmentTransmission({
      userId: 'user-a',
      candidate: CANDIDATE,
      adapter,
      persistClient: mem.client,
      now,
      executionTokenFactory: () => 'token-unk',
    });
    expect(result.outcomeKind).toBe('unknown');
    expect(mem.getMatch('match-1')?.transmissionStatus).toBe('UNKNOWN');
  });

  it('marks UNKNOWN when adapter throws after dispatch', async () => {
    const adapter: ShipmentTransmissionAdapter = {
      provider: 'COUPANG',
      buildPayload: () => ({}),
      transmit: async () => {
        throw new Error('socket hang up');
      },
    };
    const result = await runPersistedShipmentTransmission({
      userId: 'user-a',
      candidate: CANDIDATE,
      adapter,
      persistClient: mem.client,
      now,
      executionTokenFactory: () => 'token-throw',
    });
    expect(result.adapterCalled).toBe(true);
    expect(result.outcomeKind).toBe('unknown');
    expect(mem.getMatch('match-1')?.transmissionStatus).toBe('UNKNOWN');
  });

  it('does not call adapter when reserve fails', async () => {
    mem.seedMatch({ ...readyMatch(), transmissionStatus: 'SENT' });
    const transmit = vi.fn();
    const adapter: ShipmentTransmissionAdapter = {
      provider: 'COUPANG',
      buildPayload: () => ({}),
      transmit,
    };
    const result = await runPersistedShipmentTransmission({
      userId: 'user-a',
      candidate: CANDIDATE,
      adapter,
      persistClient: mem.client,
      now,
      executionTokenFactory: () => 'token-x',
    });
    expect(transmit).not.toHaveBeenCalled();
    expect(result.adapterCalled).toBe(false);
    expect(result.reserve.success).toBe(false);
  });

  it('does not reserve when adapter.transmit is missing', async () => {
    const result = await runPersistedShipmentTransmission({
      userId: 'user-a',
      candidate: CANDIDATE,
      adapter: {
        provider: 'COUPANG',
        buildPayload: () => ({}),
      } as unknown as ShipmentTransmissionAdapter,
      persistClient: mem.client,
      now,
      executionTokenFactory: () => 'token-missing',
    });
    expect(result.adapterCalled).toBe(false);
    expect(result.reserve.reasonMessage).toBe('ADAPTER_NOT_REGISTERED');
    expect(mem.getMatch('match-1')?.transmissionStatus).toBe('READY');
  });

  it('invokes piiClearClient only after successful persist', async () => {
    const trackingDelegates = {
      shipmentMatch: {
        findMany: vi.fn(async () => [
          { id: 'match-1', uploadRowId: 'row-1', transmissionStatus: 'SENT' },
        ]),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      shipmentUploadRow: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      shipmentTransmissionAttempt: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      orderSyncOrder: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    let trackingTxCalls = 0;
    const trackingClient = {
      ...trackingDelegates,
      async $transaction<T>(fn: (tx: typeof trackingDelegates) => Promise<T>): Promise<T> {
        trackingTxCalls += 1;
        return fn(trackingDelegates);
      },
    };

    const ok = await runPersistedShipmentTransmission({
      userId: 'user-a',
      candidate: CANDIDATE,
      adapter: createMockShipmentTransmissionAdapter({ provider: 'COUPANG' }),
      persistClient: mem.client,
      piiClearClient: trackingClient as never,
      now,
      executionTokenFactory: () => 'token-pii-ok',
    });
    expect(ok.complete?.success).toBe(true);
    expect(ok.success).toBe(true);
    expect(ok.piiClear).toEqual({ status: 'cleared' });
    expect(trackingTxCalls).toBe(1);
    expect(trackingDelegates.shipmentMatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-a', orderSyncOrderId: 'order-1' },
      }),
    );
    expect(trackingDelegates.orderSyncOrder.updateMany).toHaveBeenCalled();

    const findManyOnFail = vi.fn(async () => []);
    const failDelegates = {
      shipmentMatch: {
        findMany: findManyOnFail,
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      shipmentUploadRow: { updateMany: vi.fn(async () => ({ count: 0 })) },
      shipmentTransmissionAttempt: { updateMany: vi.fn(async () => ({ count: 0 })) },
      orderSyncOrder: { updateMany: vi.fn(async () => ({ count: 0 })) },
    };
    let failTxCalls = 0;
    const failClient = {
      ...failDelegates,
      async $transaction<T>(fn: (tx: typeof failDelegates) => Promise<T>): Promise<T> {
        failTxCalls += 1;
        return fn(failDelegates);
      },
    };
    mem.seedMatch(readyMatch());
    const fail = await runPersistedShipmentTransmission({
      userId: 'user-a',
      candidate: CANDIDATE,
      adapter: createMockShipmentTransmissionAdapter({
        provider: 'COUPANG',
        defaultOutcome: 'non_retryable_failure',
      }),
      persistClient: mem.client,
      piiClearClient: failClient as never,
      now,
      executionTokenFactory: () => 'token-pii-fail',
    });
    expect(fail.outcomeKind).toBe('failure');
    expect(fail.success).toBe(false);
    expect(fail.piiClear).toBeUndefined();
    expect(failTxCalls).toBe(0);
    expect(findManyOnFail).not.toHaveBeenCalled();
  });

  it('keeps transmit success when PII clear fails and records a safe failure code', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const piiClearClient = {
      async $transaction<T>(_fn: (tx: never) => Promise<T>): Promise<T> {
        throw Object.assign(new Error('db down'), { code: 'P2028' });
      },
      shipmentMatch: {
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      shipmentUploadRow: { updateMany: vi.fn(async () => ({ count: 0 })) },
      shipmentTransmissionAttempt: { updateMany: vi.fn(async () => ({ count: 0 })) },
      orderSyncOrder: { updateMany: vi.fn(async () => ({ count: 0 })) },
    };

    const result = await runPersistedShipmentTransmission({
      userId: 'user-a',
      candidate: CANDIDATE,
      adapter: createMockShipmentTransmissionAdapter({ provider: 'COUPANG' }),
      persistClient: mem.client,
      piiClearClient: piiClearClient as never,
      now,
      executionTokenFactory: () => 'token-pii-err',
    });

    expect(result.success).toBe(true);
    expect(result.complete?.success).toBe(true);
    expect(result.piiClear).toEqual({ status: 'failed', failureCode: 'P2028' });
    expect(errorSpy).toHaveBeenCalledWith(
      '[ShipmentTransmissionPiiClear]',
      expect.objectContaining({
        code: 'PII_CLEAR_FAILED',
        failureCode: 'P2028',
        userId: 'user-a',
        orderSyncOrderId: 'order-1',
        matchId: 'match-1',
        attemptId: expect.any(String),
      }),
    );
    const logged = errorSpy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(JSON.stringify(logged)).not.toMatch(/receiver|010-|mallOrder|홍길동/i);
    errorSpy.mockRestore();
  });
});
