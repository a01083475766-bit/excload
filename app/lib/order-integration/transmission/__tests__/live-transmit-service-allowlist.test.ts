import { describe, expect, it, vi } from 'vitest';

import { runShipmentTransmitService } from '@/app/lib/order-integration/transmission/transmit-service';
import type { ShipmentTransmissionAdapter } from '@/app/lib/order-integration/transmission/types';
import { SHIPMENT_UPLOAD_BATCH_READY_STATUS } from '@/app/lib/order-integration/shipments/refresh-shipment-upload-batch-ready-status';

function eligibleSmartstoreMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    userId: 'user-1',
    uploadBatchId: 'batch-1',
    orderSyncOrderId: 'order-1',
    provider: 'SMARTSTORE',
    integrationAccountId: 'acc-allowed',
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
      integrationAccountId: 'acc-allowed',
      mallOrderNo: 'ORDER-1',
      excloadOrderNo: 'EXC-1',
      mallLineItemIds: ['PO-1'],
    },
    ...overrides,
  };
}

describe('runShipmentTransmitService live allowlist gate', () => {
  it('blocks when master switch is OFF without calling adapter', async () => {
    const transmit = vi.fn();
    const result = await runShipmentTransmitService(
      {
        enabled: false,
        allowedProviders: ['SMARTSTORE'],
        allowedIntegrationAccountIds: ['acc-allowed'],
        readRepository: {
          findBatchForMockTransmit: async () => {
            throw new Error('should not read batch when disabled');
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
      },
      { userId: 'user-1', batchId: 'batch-1', parsedBody: { matchIds: ['m1'], retryFailed: false } },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe('NOT_CONFIGURED');
    }
    expect(transmit).not.toHaveBeenCalled();
  });

  it('blocks when allowlists are missing without external calls', async () => {
    const transmit = vi.fn();
    const result = await runShipmentTransmitService(
      {
        enabled: true,
        allowedProviders: [],
        allowedIntegrationAccountIds: ['acc-allowed'],
        readRepository: {
          findBatchForMockTransmit: async () => {
            throw new Error('should not read when allowlist empty');
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
      },
      { userId: 'user-1', batchId: 'batch-1', parsedBody: { matchIds: ['m1'], retryFailed: false } },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe('LIVE_ALLOWLIST_NOT_CONFIGURED');
    }
    expect(transmit).not.toHaveBeenCalled();
  });

  it('skips COUPANG when only SMARTSTORE is allowlisted (0 external calls)', async () => {
    const transmit = vi.fn();
    const transmitAccountBatch = vi.fn();
    const result = await runShipmentTransmitService(
      {
        enabled: true,
        allowedProviders: ['SMARTSTORE'],
        allowedIntegrationAccountIds: ['acc-allowed'],
        readRepository: {
          findBatchForMockTransmit: async () => ({
            id: 'batch-1',
            userId: 'user-1',
            provider: 'COUPANG',
            integrationAccountId: 'acc-allowed',
            status: SHIPMENT_UPLOAD_BATCH_READY_STATUS,
          }),
          findMatchesForMockTransmit: async () => [
            eligibleSmartstoreMatch({
              provider: 'COUPANG',
              orderSyncOrder: {
                id: 'order-1',
                userId: 'user-1',
                provider: 'COUPANG',
                integrationAccountId: 'acc-allowed',
                mallOrderNo: 'ORDER-1',
                excloadOrderNo: 'EXC-1',
                mallLineItemIds: ['PO-1'],
              },
            }),
          ],
        } as never,
        persistClient: {} as never,
        resolveAdapter: () =>
          ({
            provider: 'COUPANG',
            buildPayload: () => ({}),
            transmit,
            transmitAccountBatch,
          }) as ShipmentTransmissionAdapter,
        prepareForTransmit: async () => ({ ok: true as const, reasonCode: null }),
      },
      { userId: 'user-1', batchId: 'batch-1', parsedBody: { matchIds: ['m1'], retryFailed: false } },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.results[0]?.errorCode).toBe('LIVE_PROVIDER_NOT_ALLOWED');
      expect(result.body.results[0]?.attempted).toBe(false);
    }
    expect(transmit).not.toHaveBeenCalled();
    expect(transmitAccountBatch).not.toHaveBeenCalled();
  });

  it('skips account mismatch without external calls', async () => {
    const transmitAccountBatch = vi.fn();
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
            eligibleSmartstoreMatch({
              integrationAccountId: 'acc-other',
              orderSyncOrder: {
                id: 'order-1',
                userId: 'user-1',
                provider: 'SMARTSTORE',
                integrationAccountId: 'acc-other',
                mallOrderNo: 'ORDER-1',
                excloadOrderNo: 'EXC-1',
                mallLineItemIds: ['PO-1'],
              },
            }),
          ],
        } as never,
        persistClient: {} as never,
        resolveAdapter: () =>
          ({
            provider: 'SMARTSTORE',
            buildPayload: () => ({}),
            transmit: async () => {
              throw new Error('should not run');
            },
            transmitAccountBatch,
          }) as ShipmentTransmissionAdapter,
        prepareForTransmit: async () => ({ ok: true as const, reasonCode: null }),
      },
      { userId: 'user-1', batchId: 'batch-1', parsedBody: { matchIds: ['m1'], retryFailed: false } },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.results[0]?.errorCode).toBe('LIVE_ACCOUNT_NOT_ALLOWED');
    }
    expect(transmitAccountBatch).not.toHaveBeenCalled();
  });
});
