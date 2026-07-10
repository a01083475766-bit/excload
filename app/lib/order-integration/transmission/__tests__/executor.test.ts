import { describe, expect, it, vi } from 'vitest';

import { createShipmentTransmissionAdapterRegistry } from '@/app/lib/order-integration/transmission/adapter-registry';
import {
  executeShipmentTransmission,
  executeShipmentTransmissionBatch,
  type ShipmentTransmissionExecuteItem,
} from '@/app/lib/order-integration/transmission/executor';
import { createMockShipmentTransmissionAdapter } from '@/app/lib/order-integration/transmission/mock-adapter';
import type {
  ShipmentTransmissionAdapter,
  ShipmentTransmissionCandidate,
} from '@/app/lib/order-integration/transmission/types';

const BASE_CANDIDATE: ShipmentTransmissionCandidate = {
  provider: 'COUPANG',
  integrationAccountId: 'acc-1',
  uploadBatchId: 'batch-1',
  matchId: 'match-1',
  orderSyncOrderId: 'order-1',
  mallOrderNo: 'MALL-1',
  excloadOrderNo: 'EXC-20260710-000001',
  mallLineItemIds: null,
  trackingNumber: '012345678901',
  courierCode: 'CJ',
  courierName: 'CJ대한통운',
};

function item(
  overrides: Partial<ShipmentTransmissionCandidate> = {},
  previousStatus: ShipmentTransmissionExecuteItem['previousStatus'] = 'READY',
): ShipmentTransmissionExecuteItem {
  return {
    candidate: { ...BASE_CANDIDATE, ...overrides },
    previousStatus,
  };
}

function assertNoSensitiveFields(result: unknown) {
  const text = JSON.stringify(result);
  expect(text).not.toMatch(
    /secret|credential|accessKey|authorization|token|receiverName|receiverPhone|receiverAddress|normalizedPayloadJson/i,
  );
}

describe('executeShipmentTransmission', () => {
  it('maps success to READY → SENT', async () => {
    const registry = createShipmentTransmissionAdapterRegistry([
      createMockShipmentTransmissionAdapter({ provider: 'COUPANG' }),
    ]);
    const result = await executeShipmentTransmission(item(), { registry });
    expect(result.success).toBe(true);
    expect(result.previousStatus).toBe('READY');
    expect(result.nextStatus).toBe('SENT');
    expect(result.adapterCalled).toBe(true);
    assertNoSensitiveFields(result);
  });

  it('maps failure to READY → FAILED', async () => {
    const registry = createShipmentTransmissionAdapterRegistry([
      createMockShipmentTransmissionAdapter({
        provider: 'COUPANG',
        defaultOutcome: 'non_retryable_failure',
      }),
    ]);
    const result = await executeShipmentTransmission(item(), { registry });
    expect(result.success).toBe(false);
    expect(result.nextStatus).toBe('FAILED');
    expect(result.adapterCalled).toBe(true);
    expect(result.errorCode).toBe('MOCK_NON_RETRYABLE_FAILURE');
  });

  it('returns ADAPTER_NOT_REGISTERED without calling adapter', async () => {
    const registry = createShipmentTransmissionAdapterRegistry();
    const result = await executeShipmentTransmission(item(), { registry });
    expect(result.errorCode).toBe('ADAPTER_NOT_REGISTERED');
    expect(result.adapterCalled).toBe(false);
    expect(result.nextStatus).toBe('READY');
  });

  it('normalizes adapter throw to ADAPTER_EXECUTION_ERROR', async () => {
    const throwing: ShipmentTransmissionAdapter = {
      provider: 'COUPANG',
      buildPayload: () => ({}),
      transmit: async () => {
        throw new Error('boom');
      },
    };
    const registry = createShipmentTransmissionAdapterRegistry([throwing]);
    const result = await executeShipmentTransmission(item(), { registry });
    expect(result.adapterCalled).toBe(true);
    expect(result.success).toBe(false);
    expect(result.nextStatus).toBe('FAILED');
    expect(result.errorCode).toBe('ADAPTER_EXECUTION_ERROR');
    expect(result.retryable).toBe(true);
    expect(result.errorMessage).toBe('boom');
  });

  it('does not call adapter when SENT', async () => {
    const transmit = vi.fn();
    const adapter: ShipmentTransmissionAdapter = {
      provider: 'COUPANG',
      buildPayload: () => ({}),
      transmit,
    };
    const registry = createShipmentTransmissionAdapterRegistry([adapter]);
    const result = await executeShipmentTransmission(item({}, 'SENT'), { registry });
    expect(transmit).not.toHaveBeenCalled();
    expect(result.errorCode).toBe('TRANSMISSION_NOT_ALLOWED');
    expect(result.adapterCalled).toBe(false);
  });

  it('does not call adapter when SKIPPED', async () => {
    const transmit = vi.fn();
    const adapter: ShipmentTransmissionAdapter = {
      provider: 'COUPANG',
      buildPayload: () => ({}),
      transmit,
    };
    const registry = createShipmentTransmissionAdapterRegistry([adapter]);
    const result = await executeShipmentTransmission(item({}, 'SKIPPED'), { registry });
    expect(transmit).not.toHaveBeenCalled();
    expect(result.errorCode).toBe('TRANSMISSION_NOT_ALLOWED');
  });

  it('does not call adapter when NONE', async () => {
    const transmit = vi.fn();
    const adapter: ShipmentTransmissionAdapter = {
      provider: 'COUPANG',
      buildPayload: () => ({}),
      transmit,
    };
    const registry = createShipmentTransmissionAdapterRegistry([adapter]);
    const result = await executeShipmentTransmission(item({}, 'NONE'), { registry });
    expect(transmit).not.toHaveBeenCalled();
    expect(result.errorCode).toBe('TRANSMISSION_NOT_ALLOWED');
  });
});

describe('executeShipmentTransmissionBatch', () => {
  it('handles empty array', async () => {
    const registry = createShipmentTransmissionAdapterRegistry();
    const batch = await executeShipmentTransmissionBatch([], { registry });
    expect(batch).toEqual({
      totalCount: 0,
      successCount: 0,
      failureCount: 0,
      skippedCount: 0,
      retryableFailureCount: 0,
      results: [],
    });
  });

  it('all success', async () => {
    const registry = createShipmentTransmissionAdapterRegistry([
      createMockShipmentTransmissionAdapter({ provider: 'COUPANG' }),
    ]);
    const batch = await executeShipmentTransmissionBatch(
      [item({ matchId: 'm1' }), item({ matchId: 'm2' })],
      { registry },
    );
    expect(batch.successCount).toBe(2);
    expect(batch.failureCount).toBe(0);
    expect(batch.results.map((r) => r.matchId)).toEqual(['m1', 'm2']);
  });

  it('all failure', async () => {
    const registry = createShipmentTransmissionAdapterRegistry([
      createMockShipmentTransmissionAdapter({
        provider: 'COUPANG',
        defaultOutcome: 'non_retryable_failure',
      }),
    ]);
    const batch = await executeShipmentTransmissionBatch(
      [item({ matchId: 'm1' }), item({ matchId: 'm2' })],
      { registry },
    );
    expect(batch.failureCount).toBe(2);
    expect(batch.successCount).toBe(0);
  });

  it('mixed success and failure with retryable aggregate', async () => {
    const registry = createShipmentTransmissionAdapterRegistry([
      createMockShipmentTransmissionAdapter({
        provider: 'COUPANG',
        byMatchId: {
          ok: 'success',
          soft: 'retryable_failure',
          hard: 'non_retryable_failure',
        },
      }),
    ]);
    const batch = await executeShipmentTransmissionBatch(
      [
        item({ matchId: 'ok' }),
        item({ matchId: 'soft' }),
        item({ matchId: 'hard' }),
      ],
      { registry },
    );
    expect(batch.successCount).toBe(1);
    expect(batch.failureCount).toBe(2);
    expect(batch.retryableFailureCount).toBe(1);
    expect(batch.totalCount).toBe(3);
  });

  it('partial failure when adapter missing for one provider', async () => {
    const registry = createShipmentTransmissionAdapterRegistry([
      createMockShipmentTransmissionAdapter({ provider: 'COUPANG' }),
    ]);
    const batch = await executeShipmentTransmissionBatch(
      [
        item({ matchId: 'c1', provider: 'COUPANG' }),
        item({ matchId: 's1', provider: 'SMARTSTORE' }),
      ],
      { registry },
    );
    expect(batch.successCount).toBe(1);
    expect(batch.failureCount).toBe(1);
    expect(batch.skippedCount).toBe(0);
    expect(batch.results[1]?.errorCode).toBe('ADAPTER_NOT_REGISTERED');
    expect(batch.successCount + batch.failureCount + batch.skippedCount).toBe(
      batch.totalCount,
    );
  });

  it('classifies TRANSMISSION_NOT_ALLOWED as skipped and SENT not as failure', async () => {
    const registry = createShipmentTransmissionAdapterRegistry([
      createMockShipmentTransmissionAdapter({ provider: 'COUPANG' }),
    ]);
    const batch = await executeShipmentTransmissionBatch(
      [
        item({ matchId: 'ready' }, 'READY'),
        item({ matchId: 'sent' }, 'SENT'),
        item({ matchId: 'none' }, 'NONE'),
      ],
      { registry },
    );
    expect(batch.successCount).toBe(1);
    expect(batch.skippedCount).toBe(2);
    expect(batch.failureCount).toBe(0);
    expect(batch.successCount + batch.failureCount + batch.skippedCount).toBe(3);
  });

  it('counts ADAPTER_EXECUTION_ERROR throw as failure with retryable', async () => {
    const adapter: ShipmentTransmissionAdapter = {
      provider: 'COUPANG',
      buildPayload: () => ({}),
      transmit: async () => {
        throw new Error('network');
      },
    };
    const registry = createShipmentTransmissionAdapterRegistry([adapter]);
    const batch = await executeShipmentTransmissionBatch([item({ matchId: 'x' })], {
      registry,
    });
    expect(batch.failureCount).toBe(1);
    expect(batch.retryableFailureCount).toBe(1);
    expect(batch.skippedCount).toBe(0);
  });

  it('one throw does not stop other items', async () => {
    let calls = 0;
    const adapter: ShipmentTransmissionAdapter = {
      provider: 'COUPANG',
      buildPayload: () => ({}),
      transmit: async (candidate) => {
        calls += 1;
        if (candidate.matchId === 'boom') {
          throw new Error('explode');
        }
        return {
          success: true,
          provider: 'COUPANG',
          matchId: candidate.matchId,
          providerRequestId: 'ok',
          errorCode: null,
          errorMessage: null,
          retryable: false,
          responseSummary: { httpStatus: 200, message: 'ok' },
        };
      },
    };
    const registry = createShipmentTransmissionAdapterRegistry([adapter]);
    const batch = await executeShipmentTransmissionBatch(
      [item({ matchId: 'boom' }), item({ matchId: 'ok' })],
      { registry },
    );
    expect(calls).toBe(2);
    expect(batch.results[0]?.errorCode).toBe('ADAPTER_EXECUTION_ERROR');
    expect(batch.results[1]?.success).toBe(true);
  });

  it('preserves input order and blocks duplicate matchId', async () => {
    const registry = createShipmentTransmissionAdapterRegistry([
      createMockShipmentTransmissionAdapter({ provider: 'COUPANG' }),
    ]);
    const batch = await executeShipmentTransmissionBatch(
      [
        item({ matchId: 'dup' }),
        item({ matchId: 'other' }),
        item({ matchId: 'dup' }),
      ],
      { registry },
    );
    expect(batch.results.map((r) => r.matchId)).toEqual(['dup', 'other', 'dup']);
    expect(batch.results[0]?.success).toBe(true);
    expect(batch.results[2]?.errorCode).toBe('DUPLICATE_MATCH_ID');
    expect(batch.results[2]?.adapterCalled).toBe(false);
    expect(batch.successCount + batch.failureCount + batch.skippedCount).toBe(
      batch.totalCount,
    );
  });
});
