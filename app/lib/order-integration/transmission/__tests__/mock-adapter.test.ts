import { describe, expect, it } from 'vitest';

import { createMockShipmentTransmissionAdapter } from '@/app/lib/order-integration/transmission/mock-adapter';
import type { ShipmentTransmissionCandidate } from '@/app/lib/order-integration/transmission/types';

const CANDIDATE: ShipmentTransmissionCandidate = {
  provider: 'COUPANG',
  integrationAccountId: 'acc-1',
  uploadBatchId: 'batch-1',
  matchId: 'match-1',
  orderSyncOrderId: 'order-1',
  mallOrderNo: 'MALL-1',
  excloadOrderNo: 'EXC-20260710-000001',
  mallLineItemIds: ['PO-1'],
  trackingNumber: '012345678901',
  courierCode: 'CJ',
  courierName: 'CJ대한통운',
};

describe('createMockShipmentTransmissionAdapter', () => {
  it('returns success with providerRequestId and sanitized summary', async () => {
    const adapter = createMockShipmentTransmissionAdapter({
      provider: 'COUPANG',
      requestIdFactory: () => 'req-fixed-1',
    });
    const result = await adapter.transmit(CANDIDATE);
    expect(result.success).toBe(true);
    expect(result.providerRequestId).toBe('req-fixed-1');
    expect(result.responseSummary).toEqual({
      httpStatus: 200,
      providerStatusCode: 'OK',
      providerRequestId: 'req-fixed-1',
      message: 'mock transmission succeeded',
    });
    expect(result.errorCode).toBeNull();
  });

  it('returns retryable failure', async () => {
    const adapter = createMockShipmentTransmissionAdapter({
      provider: 'COUPANG',
      defaultOutcome: 'retryable_failure',
    });
    const result = await adapter.transmit(CANDIDATE);
    expect(result.success).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.errorCode).toBe('MOCK_RETRYABLE_FAILURE');
  });

  it('returns non-retryable failure', async () => {
    const adapter = createMockShipmentTransmissionAdapter({
      provider: 'COUPANG',
      defaultOutcome: 'non_retryable_failure',
    });
    const result = await adapter.transmit(CANDIDATE);
    expect(result.success).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.errorCode).toBe('MOCK_NON_RETRYABLE_FAILURE');
    expect(result.outcomeKind).toBe('failure');
  });

  it('returns unknown with outcomeKind unknown', async () => {
    const adapter = createMockShipmentTransmissionAdapter({
      provider: 'COUPANG',
      defaultOutcome: 'unknown',
      requestIdFactory: () => 'req-unknown-1',
    });
    const result = await adapter.transmit(CANDIDATE);
    expect(result.success).toBe(false);
    expect(result.outcomeKind).toBe('unknown');
    expect(result.retryable).toBe(false);
    expect(result.errorCode).toBe('MOCK_UNKNOWN_RESULT');
    expect(result.providerRequestId).toBe('req-unknown-1');
    expect(result.responseSummary?.providerStatusCode).toBe('UNKNOWN');
  });

  it('default providerRequestId is deterministic and omits mall/tracking', async () => {
    const adapter = createMockShipmentTransmissionAdapter({ provider: 'COUPANG' });
    const a = await adapter.transmit(CANDIDATE);
    const b = await adapter.transmit(CANDIDATE);
    expect(a.providerRequestId).toBe(b.providerRequestId);
    expect(a.providerRequestId).toMatch(/^mock-[a-f0-9]{16}$/);
    expect(a.providerRequestId).not.toMatch(/MALL-1|012345678901/);
  });

  it('applies per-matchId outcomes deterministically', async () => {
    const adapter = createMockShipmentTransmissionAdapter({
      provider: 'COUPANG',
      defaultOutcome: 'success',
      byMatchId: {
        'match-fail': 'retryable_failure',
      },
    });
    const ok = await adapter.transmit(CANDIDATE);
    const fail = await adapter.transmit({ ...CANDIDATE, matchId: 'match-fail' });
    expect(ok.success).toBe(true);
    expect(fail.success).toBe(false);
    expect(fail.errorCode).toBe('MOCK_RETRYABLE_FAILURE');

    const failAgain = await adapter.transmit({ ...CANDIDATE, matchId: 'match-fail' });
    expect(failAgain).toEqual(fail);
  });

  it('payload and result omit credential and PII', async () => {
    const adapter = createMockShipmentTransmissionAdapter({ provider: 'COUPANG' });
    const payload = JSON.stringify(adapter.buildPayload(CANDIDATE));
    const result = JSON.stringify(await adapter.transmit(CANDIDATE));
    for (const text of [payload, result]) {
      expect(text).not.toMatch(/secret|credential|accessKey|authorization|receiver|phone|address/i);
    }
  });
});
