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
});
