/**
 * Allowlist / concurrency guards that run in default vitest (no smoke DB).
 * True DB lease race lives in live-transmit-concurrency.integration.test.ts.
 */

import { describe, expect, it, vi } from 'vitest';

import { runShipmentTransmitService } from '@/app/lib/order-integration/transmission/transmit-service';
import type { ShipmentTransmissionAdapter } from '@/app/lib/order-integration/transmission/types';
import { SHIPMENT_UPLOAD_BATCH_READY_STATUS } from '@/app/lib/order-integration/shipments/refresh-shipment-upload-batch-ready-status';
import { evaluateIntegrationMutationGate } from '@/app/lib/order-integration/transmission/__tests__/integration/support/mutation-gate';
import type { PrepareShipmentMatchForTransmitResult } from '@/app/lib/order-integration/transmission/read-repository';

describe('live transmit concurrency / allowlist (unit, no DB)', () => {
  it('allowlist missing: never prepares, never calls adapter', async () => {
    const transmit = vi.fn();
    const prepareForTransmit = vi.fn(
      async (): Promise<PrepareShipmentMatchForTransmitResult> => ({
        ok: true,
        reasonCode: null,
      }),
    );

    const result = await runShipmentTransmitService(
      {
        enabled: true,
        allowedProviders: [],
        allowedIntegrationAccountIds: ['acc-1'],
        readRepository: {
          findBatchForMockTransmit: async () => {
            throw new Error('batch read must not run');
          },
          findMatchesForMockTransmit: async () => [],
        } as never,
        persistClient: {} as never,
        resolveAdapter: () =>
          ({
            provider: 'SMARTSTORE',
            buildPayload: () => ({}),
            transmit,
          }) as ShipmentTransmissionAdapter,
        prepareForTransmit,
      },
      { userId: 'user-1', batchId: 'batch-1', parsedBody: { matchIds: ['m1'], retryFailed: false } },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe('LIVE_ALLOWLIST_NOT_CONFIGURED');
    }
    expect(prepareForTransmit).not.toHaveBeenCalled();
    expect(transmit).not.toHaveBeenCalled();
  });

  it('account mismatch: no prepare and no adapter after eligibility', async () => {
    const transmit = vi.fn();
    const prepareForTransmit = vi.fn(
      async (): Promise<PrepareShipmentMatchForTransmitResult> => ({
        ok: true,
        reasonCode: null,
      }),
    );

    const result = await runShipmentTransmitService(
      {
        enabled: true,
        allowedProviders: ['SMARTSTORE'],
        allowedIntegrationAccountIds: ['acc-allowed'],
        readRepository: {
          findBatchForMockTransmit: async () => ({
            id: 'batch-1',
            userId: 'user-1',
            provider: 'SMARTSTORE',
            integrationAccountId: 'acc-other',
            status: SHIPMENT_UPLOAD_BATCH_READY_STATUS,
          }),
          findMatchesForMockTransmit: async () => [
            {
              id: 'm1',
              userId: 'user-1',
              uploadBatchId: 'batch-1',
              orderSyncOrderId: 'order-1',
              provider: 'SMARTSTORE',
              integrationAccountId: 'acc-other',
              userConfirmationStatus: 'CONFIRMED',
              transmissionStatus: 'READY',
              finalTrackingNumber: '123456789012',
              finalCarrierCode: 'CJ',
              finalCarrierName: 'CJ대한통운',
              uploadRow: null,
              orderSyncOrder: {
                id: 'order-1',
                userId: 'user-1',
                provider: 'SMARTSTORE',
                integrationAccountId: 'acc-other',
                mallOrderNo: 'ORDER-1',
                excloadOrderNo: 'EXC-1',
                mallLineItemIds: ['PO-1'],
              },
            },
          ],
        } as never,
        persistClient: {} as never,
        resolveAdapter: () =>
          ({
            provider: 'SMARTSTORE',
            buildPayload: () => ({}),
            transmit,
          }) as ShipmentTransmissionAdapter,
        prepareForTransmit,
      },
      { userId: 'user-1', batchId: 'batch-1', parsedBody: { matchIds: ['m1'], retryFailed: false } },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.results[0]?.errorCode).toBe('LIVE_ACCOUNT_NOT_ALLOWED');
      expect(result.body.results[0]?.attempted).toBe(false);
    }
    expect(prepareForTransmit).not.toHaveBeenCalled();
    expect(transmit).not.toHaveBeenCalled();
  });

  it('documents smoke IT gate requirement for real concurrent lease race', () => {
    const gate = evaluateIntegrationMutationGate();
    // Real Promise.all lease race against reserveTransmissionAttempt requires smoke IT DB.
    expect(gate.ok || gate.reason).toBeTruthy();
  });
});
