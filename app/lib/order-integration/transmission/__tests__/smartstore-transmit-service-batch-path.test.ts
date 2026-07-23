import { describe, expect, it, vi } from 'vitest';

import { runShipmentTransmitService } from '@/app/lib/order-integration/transmission/transmit-service';
import type { ShipmentTransmissionAdapter } from '@/app/lib/order-integration/transmission/types';
import { SHIPMENT_UPLOAD_BATCH_READY_STATUS } from '@/app/lib/order-integration/shipments/refresh-shipment-upload-batch-ready-status';

describe('SMARTSTORE transmit-service uses account batch path', () => {
  it('calls transmitAccountBatch and never single transmit for SMARTSTORE', async () => {
    const singleTransmit = vi.fn(async () => {
      throw new Error('single transmit must not run');
    });
    const accountBatch = vi.fn(async ({ entries }: { entries: Array<{ candidate: { matchId: string } }> }) =>
      entries.map((entry) => ({
        matchId: entry.candidate.matchId,
        success: true,
        outcomeKind: 'success' as const,
        errorCode: null,
        errorMessage: null,
        providerRequestId: null,
        retryable: false,
        externallyPosted: false,
        responseSummary: {
          itemResults: [
            {
              productOrderId: 'PO-1',
              status: 'ALREADY_DISPATCHED' as const,
              shipmentFingerprint: 'fp',
              message: '이미 동일 송장정보로 발송 처리된 주문입니다.',
            },
          ],
        },
      })),
    );

    const smartstoreAdapter: ShipmentTransmissionAdapter = {
      provider: 'SMARTSTORE',
      buildPayload: () => ({}),
      transmit: singleTransmit,
      transmitAccountBatch: accountBatch,
    };
    const coupangTransmit = vi.fn();
    const coupangAdapter: ShipmentTransmissionAdapter = {
      provider: 'COUPANG',
      buildPayload: () => ({}),
      transmit: coupangTransmit,
    };

    const runPersisted = vi.fn(async () => {
      throw new Error('COUPANG path should not run in this SMARTSTORE-only fixture');
    });

    const result = await runShipmentTransmitService(
      {
        enabled: true,
        readRepository: {
          findBatchForMockTransmit: async () => ({
            id: 'batch-1',
            userId: 'user-1',
            provider: 'SMARTSTORE',
            integrationAccountId: 'acct-1',
            status: SHIPMENT_UPLOAD_BATCH_READY_STATUS,
          }),
          findMatchesForMockTransmit: async () => [
            {
              id: 'm1',
              userId: 'user-1',
              uploadBatchId: 'batch-1',
              orderSyncOrderId: 'order-1',
              provider: 'SMARTSTORE',
              integrationAccountId: 'acct-1',
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
                integrationAccountId: 'acct-1',
                mallOrderNo: 'ORDER-PO-1',
                excloadOrderNo: 'EXC-1',
                mallLineItemIds: ['PO-1'],
              },
            },
          ],
        } as never,
        persistClient: {
          $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
            fn({
              shipmentMatch: {
                updateMany: async () => ({ count: 1 }),
                findFirst: async () => ({
                  id: 'm1',
                  userId: 'user-1',
                  uploadBatchId: 'batch-1',
                  provider: 'SMARTSTORE',
                  integrationAccountId: 'acct-1',
                  orderSyncOrderId: 'order-1',
                  transmissionStatus: 'PROCESSING',
                  transmissionLeaseToken: 'tok',
                  transmissionLeaseExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
                  lastTransmissionAttemptAt: null,
                  transmissionErrorMessage: null,
                }),
                findMany: async () => [{ transmissionStatus: 'PROCESSING' }],
              },
              shipmentTransmissionAttempt: {
                create: async ({ data }: { data: Record<string, unknown> }) => ({
                  id: 'attempt-1',
                  ...data,
                }),
                findFirst: async () => ({
                  id: 'attempt-1',
                  userId: 'user-1',
                  shipmentMatchId: 'm1',
                  attemptNo: 1,
                  status: 'PENDING',
                  executionToken: 'tok',
                  dispatchedAt: null,
                  orderSyncOrderId: 'order-1',
                }),
                updateMany: async () => ({ count: 1 }),
              },
              orderSyncOrder: {
                updateMany: async () => ({ count: 1 }),
              },
            }),
        } as never,
        resolveAdapter: ({ provider }) =>
          provider === 'SMARTSTORE' ? smartstoreAdapter : coupangAdapter,
        runPersisted,
      },
      {
        userId: 'user-1',
        batchId: 'batch-1',
        parsedBody: { matchIds: ['m1'], retryFailed: false },
      },
    );

    expect(result.ok).toBe(true);
    expect(accountBatch).toHaveBeenCalledTimes(1);
    expect(singleTransmit).not.toHaveBeenCalled();
    expect(coupangTransmit).not.toHaveBeenCalled();
    expect(runPersisted).not.toHaveBeenCalled();
  });

  it('promotes eligible NONE to READY before SMARTSTORE batch transmit', async () => {
    const prepareNoneForTransmit = vi.fn(async () => true);
    const accountBatch = vi.fn(async ({ entries }: { entries: Array<{ candidate: { matchId: string } }> }) =>
      entries.map((entry) => ({
        matchId: entry.candidate.matchId,
        success: true,
        outcomeKind: 'success' as const,
        errorCode: null,
        errorMessage: null,
        providerRequestId: null,
        retryable: false,
        externallyPosted: true,
        responseSummary: null,
      })),
    );

    const result = await runShipmentTransmitService(
      {
        enabled: true,
        readRepository: {
          findBatchForMockTransmit: async () => ({
            id: 'batch-1',
            userId: 'user-1',
            provider: 'SMARTSTORE',
            integrationAccountId: 'acct-1',
            status: SHIPMENT_UPLOAD_BATCH_READY_STATUS,
          }),
          findMatchesForMockTransmit: async () => [
            {
              id: 'm-none',
              userId: 'user-1',
              uploadBatchId: 'batch-1',
              orderSyncOrderId: 'order-1',
              provider: 'SMARTSTORE',
              integrationAccountId: 'acct-1',
              userConfirmationStatus: 'CONFIRMED',
              transmissionStatus: 'NONE',
              finalTrackingNumber: '123456789012',
              finalCarrierCode: 'CJ',
              finalCarrierName: 'CJ대한통운',
              uploadRow: null,
              orderSyncOrder: {
                id: 'order-1',
                userId: 'user-1',
                provider: 'SMARTSTORE',
                integrationAccountId: 'acct-1',
                mallOrderNo: 'ORDER-1',
                excloadOrderNo: 'EXC-1',
                mallLineItemIds: ['PO-1'],
              },
            },
          ],
        } as never,
        persistClient: {
          $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
            fn({
              shipmentMatch: {
                updateMany: async () => ({ count: 1 }),
                findFirst: async () => ({
                  id: 'm-none',
                  userId: 'user-1',
                  uploadBatchId: 'batch-1',
                  provider: 'SMARTSTORE',
                  integrationAccountId: 'acct-1',
                  orderSyncOrderId: 'order-1',
                  transmissionStatus: 'PROCESSING',
                  transmissionLeaseToken: 'tok',
                  transmissionLeaseExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
                  lastTransmissionAttemptAt: null,
                  transmissionErrorMessage: null,
                }),
                findMany: async () => [{ transmissionStatus: 'PROCESSING' }],
              },
              shipmentTransmissionAttempt: {
                create: async ({ data }: { data: Record<string, unknown> }) => ({
                  id: 'attempt-1',
                  ...data,
                }),
                findFirst: async () => ({
                  id: 'attempt-1',
                  userId: 'user-1',
                  shipmentMatchId: 'm-none',
                  attemptNo: 1,
                  status: 'PENDING',
                  executionToken: 'tok',
                  dispatchedAt: null,
                  orderSyncOrderId: 'order-1',
                }),
                updateMany: async () => ({ count: 1 }),
              },
              orderSyncOrder: {
                updateMany: async () => ({ count: 1 }),
              },
            }),
        } as never,
        resolveAdapter: () =>
          ({
            provider: 'SMARTSTORE',
            buildPayload: () => ({}),
            transmit: async () => {
              throw new Error('single transmit must not run');
            },
            transmitAccountBatch: accountBatch,
          }) as ShipmentTransmissionAdapter,
        prepareNoneForTransmit,
      },
      {
        userId: 'user-1',
        batchId: 'batch-1',
        parsedBody: { matchIds: ['m-none'], retryFailed: false },
      },
    );

    expect(result.ok).toBe(true);
    expect(prepareNoneForTransmit).toHaveBeenCalledWith({ matchId: 'm-none' });
    expect(accountBatch).toHaveBeenCalledTimes(1);
  });
});
