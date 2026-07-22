import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrderIntegrationProvider } from '@prisma/client';

import { createMemoryTransmissionPersistClient } from '@/app/lib/order-integration/transmission/__tests__/support/memory-persist-client';
import { runPersistedSmartstoreBatchedTransmission } from '@/app/lib/order-integration/transmission/smartstore-batched-persisted';
import type { ShipmentTransmissionMatchRow } from '@/app/lib/order-integration/transmission/repository';
import type {
  ShipmentTransmissionAdapter,
  ShipmentTransmissionCandidate,
} from '@/app/lib/order-integration/transmission/types';
import {
  buildSmartstoreItemShipmentFingerprint,
  runSmartstoreCrossMatchBatchDispatch,
} from '@/app/lib/smartstore/smartstore-batch-dispatch';

const now = new Date('2026-07-22T12:00:00.000Z');

function readyMatch(id: string): ShipmentTransmissionMatchRow {
  return {
    id,
    userId: 'user-1',
    uploadBatchId: 'batch-1',
    provider: 'SMARTSTORE' as OrderIntegrationProvider,
    integrationAccountId: 'acct-1',
    orderSyncOrderId: `order-${id}`,
    transmissionStatus: 'READY',
    transmissionLeaseToken: null,
    transmissionLeaseExpiresAt: null,
    lastTransmissionAttemptAt: null,
    transmissionErrorMessage: null,
  };
}

function candidate(matchId: string, po: string): ShipmentTransmissionCandidate {
  return {
    provider: 'SMARTSTORE',
    integrationAccountId: 'acct-1',
    uploadBatchId: 'batch-1',
    matchId,
    orderSyncOrderId: `order-${matchId}`,
    mallOrderNo: `ORDER-${po}`,
    excloadOrderNo: `EXC-${matchId}`,
    mallLineItemIds: [po],
    trackingNumber: '123456789012',
    courierCode: 'CJ',
    courierName: null,
  };
}

describe('runPersistedSmartstoreBatchedTransmission', () => {
  let mem: ReturnType<typeof createMemoryTransmissionPersistClient>;

  beforeEach(() => {
    mem = createMemoryTransmissionPersistClient();
  });

  it('keeps per-match attempt/lease and stores itemResults on complete', async () => {
    for (const id of ['m1', 'm2', 'm3']) {
      mem.seedMatch(readyMatch(id));
      mem.seedOrder({ id: `order-${id}`, userId: 'user-1', transmissionStatus: 'NONE' });
    }

    const dispatchBatch = vi.fn(async (items: ReadonlyArray<{ productOrderId: string }>) => ({
      httpStatus: 200,
      bodyText: JSON.stringify({
        data: {
          successProductOrderIds: items.map((item) => item.productOrderId),
          failProductOrderInfos: [],
        },
      }),
    }));

    const adapter: ShipmentTransmissionAdapter = {
      provider: 'SMARTSTORE',
      buildPayload: () => ({}),
      transmit: async () => {
        throw new Error('single transmit must not be used');
      },
      transmitAccountBatch: async ({ integrationAccountId, entries }) => {
        const outcomes = await runSmartstoreCrossMatchBatchDispatch({
          userId: 'user-1',
          integrationAccountId,
          entries: entries.map((entry) => ({
            matchId: entry.candidate.matchId,
            candidate: entry.candidate,
            priorItemResults: entry.priorItemResults,
          })),
          fetchByIds: async (ids) =>
            ids.map((productOrderId) => ({
              order: { orderId: `ORDER-${productOrderId}` },
              productOrder: {
                productOrderId,
                productOrderStatus: 'PAYED',
                placeOrderStatus: 'OK',
                remainQuantity: 1,
              },
            })) as never,
          dispatchBatch,
        });
        return outcomes.map((outcome) => ({
          matchId: outcome.matchId,
          success: outcome.success,
          outcomeKind: outcome.outcomeKind,
          errorCode: outcome.errorCode,
          errorMessage: outcome.errorMessage,
          providerRequestId: null,
          retryable: false,
          responseSummary: outcome.responseSummary,
          externallyPosted: outcome.externallyPosted,
        }));
      },
    };

    const results = await runPersistedSmartstoreBatchedTransmission({
      userId: 'user-1',
      integrationAccountId: 'acct-1',
      entries: [
        { candidate: candidate('m1', 'PO-1'), priorItemResults: [] },
        { candidate: candidate('m2', 'PO-2'), priorItemResults: [] },
        { candidate: candidate('m3', 'PO-3'), priorItemResults: [] },
      ],
      adapter,
      persistClient: mem.client,
      now,
      executionTokenFactory: () => `token-${Math.random()}`,
    });

    expect(dispatchBatch).toHaveBeenCalledTimes(1);
    expect(dispatchBatch.mock.calls[0]?.[0]).toHaveLength(3);
    expect(results).toHaveLength(3);
    expect(results.every((row) => row.success && row.adapterCalled)).toBe(true);
    expect(results.map((row) => row.reserve.attemptNo).sort()).toEqual([1, 1, 1]);
    expect(mem.getMatch('m1')?.transmissionStatus).toBe('SENT');
    expect(mem.getMatch('m2')?.transmissionStatus).toBe('SENT');
    expect(mem.getMatch('m3')?.transmissionStatus).toBe('SENT');

    const attempt1 = mem.getAttempt(results[0]!.complete!.attemptId!);
    expect(attempt1?.dispatchedAt).not.toBeNull();
    const summary = attempt1?.responseSummaryJson as { itemResults?: unknown[] };
    expect(summary.itemResults).toHaveLength(1);
    expect(JSON.stringify(summary)).not.toMatch(/clientSecret|accessToken|010-/i);
  });

  it('does not set dispatchedAt/SENT for conflict-only or preflight-blocked matches', async () => {
    for (const id of ['m-conflict-a', 'm-conflict-b', 'm-confirm']) {
      mem.seedMatch(readyMatch(id));
      mem.seedOrder({ id: `order-${id}`, userId: 'user-1', transmissionStatus: 'NONE' });
    }

    const dispatchBatch = vi.fn();
    const adapter: ShipmentTransmissionAdapter = {
      provider: 'SMARTSTORE',
      buildPayload: () => ({}),
      transmit: async () => {
        throw new Error('single transmit must not be used');
      },
      transmitAccountBatch: async ({ integrationAccountId, entries }) => {
        const outcomes = await runSmartstoreCrossMatchBatchDispatch({
          userId: 'user-1',
          integrationAccountId,
          entries: entries.map((entry) => ({
            matchId: entry.candidate.matchId,
            candidate: entry.candidate,
            priorItemResults: entry.priorItemResults,
          })),
          fetchByIds: async (ids) =>
            ids.map((productOrderId) => ({
              order: { orderId: `ORDER-${productOrderId}` },
              productOrder: {
                productOrderId,
                productOrderStatus: 'PAYED',
                placeOrderStatus:
                  productOrderId === 'PO-CONFIRM' ? 'NOT_YET' : 'OK',
                remainQuantity: 1,
              },
            })) as never,
          dispatchBatch,
        });
        return outcomes.map((outcome) => ({
          matchId: outcome.matchId,
          success: outcome.success,
          outcomeKind: outcome.outcomeKind,
          errorCode: outcome.errorCode,
          errorMessage: outcome.errorMessage,
          providerRequestId: null,
          retryable: false,
          responseSummary: outcome.responseSummary,
          externallyPosted: outcome.externallyPosted,
        }));
      },
    };

    const results = await runPersistedSmartstoreBatchedTransmission({
      userId: 'user-1',
      integrationAccountId: 'acct-1',
      entries: [
        {
          candidate: {
            ...candidate('m-conflict-a', 'P1'),
            trackingNumber: '111111111111',
          },
          priorItemResults: [],
        },
        {
          candidate: {
            ...candidate('m-conflict-b', 'P1'),
            trackingNumber: '222222222222',
          },
          priorItemResults: [],
        },
        {
          candidate: candidate('m-confirm', 'PO-CONFIRM'),
          priorItemResults: [],
        },
      ],
      adapter,
      persistClient: mem.client,
      now,
      executionTokenFactory: () => `token-${Math.random()}`,
    });

    expect(dispatchBatch).not.toHaveBeenCalled();
    expect(results).toHaveLength(3);
    for (const row of results) {
      const attempt = mem.getAttempt(row.complete!.attemptId!);
      expect(attempt?.dispatchedAt).toBeNull();
      expect(attempt?.status).toBe('FAILED');
      expect(mem.getMatch(row.matchId)?.transmissionStatus).toBe('FAILED');
      expect(row.success).toBe(false);
      expect(row.dispatch).toBeNull();
    }
    expect(
      results.find((row) => row.matchId === 'm-confirm')?.adapterResult?.errorCode,
    ).toBe('ORDER_CONFIRMATION_REQUIRED');
  });

  it('keeps dispatchedAt null for NOT_ATTEMPTED matches after earlier chunk failure', async () => {
    const matchIds = Array.from({ length: 61 }, (_, index) => `m-${index + 1}`);
    for (const id of matchIds) {
      mem.seedMatch(readyMatch(id));
      mem.seedOrder({ id: `order-${id}`, userId: 'user-1', transmissionStatus: 'NONE' });
    }

    let call = 0;
    const dispatchBatch = vi.fn(async (items: ReadonlyArray<{ productOrderId: string }>) => {
      call += 1;
      if (call === 1) {
        return {
          httpStatus: 200,
          bodyText: JSON.stringify({
            data: {
              successProductOrderIds: items.map((item) => item.productOrderId),
              failProductOrderInfos: [],
            },
          }),
        };
      }
      throw new Error('timeout');
    });

    const adapter: ShipmentTransmissionAdapter = {
      provider: 'SMARTSTORE',
      buildPayload: () => ({}),
      transmit: async () => {
        throw new Error('single transmit must not be used');
      },
      transmitAccountBatch: async ({ integrationAccountId, entries }) => {
        const outcomes = await runSmartstoreCrossMatchBatchDispatch({
          userId: 'user-1',
          integrationAccountId,
          entries: entries.map((entry) => ({
            matchId: entry.candidate.matchId,
            candidate: entry.candidate,
            priorItemResults: entry.priorItemResults,
          })),
          fetchByIds: async (ids) =>
            ids.map((productOrderId) => ({
              order: { orderId: `ORDER-${productOrderId}` },
              productOrder: {
                productOrderId,
                productOrderStatus: 'PAYED',
                placeOrderStatus: 'OK',
                remainQuantity: 1,
              },
            })) as never,
          dispatchBatch,
        });
        return outcomes.map((outcome) => ({
          matchId: outcome.matchId,
          success: outcome.success,
          outcomeKind: outcome.outcomeKind,
          errorCode: outcome.errorCode,
          errorMessage: outcome.errorMessage,
          providerRequestId: null,
          retryable: false,
          responseSummary: outcome.responseSummary,
          externallyPosted: outcome.externallyPosted,
        }));
      },
    };

    const results = await runPersistedSmartstoreBatchedTransmission({
      userId: 'user-1',
      integrationAccountId: 'acct-1',
      entries: matchIds.map((id, index) => ({
        candidate: candidate(id, `PO-${index + 1}`),
        priorItemResults: [],
      })),
      adapter,
      persistClient: mem.client,
      now,
      executionTokenFactory: () => `token-${Math.random()}`,
    });

    expect(dispatchBatch).toHaveBeenCalledTimes(2);
    const notAttempted = results.filter(
      (row) => row.adapterResult?.errorCode === 'NOT_ATTEMPTED',
    );
    expect(notAttempted).toHaveLength(1);
    for (const row of notAttempted) {
      const attempt = mem.getAttempt(row.complete!.attemptId!);
      expect(attempt?.dispatchedAt).toBeNull();
      expect(attempt?.status).toBe('FAILED');
      expect(mem.getMatch(row.matchId)?.transmissionStatus).toBe('FAILED');
      expect(row.dispatch).toBeNull();
      expect(row.success).toBe(false);
    }

    const postedSuccess = results.filter((row) => row.success);
    expect(postedSuccess).toHaveLength(30);
    for (const row of postedSuccess) {
      expect(mem.getAttempt(row.complete!.attemptId!)?.dispatchedAt).not.toBeNull();
      expect(mem.getMatch(row.matchId)?.transmissionStatus).toBe('SENT');
    }
  });

  it('does not call Coupang-style single transmit for SMARTSTORE batch path', async () => {
    mem.seedMatch(readyMatch('m1'));
    mem.seedOrder({ id: 'order-m1', userId: 'user-1', transmissionStatus: 'NONE' });
    const single = vi.fn();
    const adapter: ShipmentTransmissionAdapter = {
      provider: 'SMARTSTORE',
      buildPayload: () => ({}),
      transmit: single,
      transmitAccountBatch: async ({ entries }) =>
        entries.map((entry) => ({
          matchId: entry.candidate.matchId,
          success: true,
          outcomeKind: 'success' as const,
          errorCode: null,
          errorMessage: null,
          providerRequestId: null,
          retryable: false,
          externallyPosted: true,
          responseSummary: {
            itemResults: [
              {
                productOrderId: 'PO-1',
                status: 'SUCCESS' as const,
                shipmentFingerprint: buildSmartstoreItemShipmentFingerprint({
                  userId: 'user-1',
                  integrationAccountId: 'acct-1',
                  productOrderId: 'PO-1',
                  deliveryCompanyCode: 'CJGLS',
                  trackingNumber: '123456789012',
                }),
              },
            ],
          },
        })),
    };

    await runPersistedSmartstoreBatchedTransmission({
      userId: 'user-1',
      integrationAccountId: 'acct-1',
      entries: [{ candidate: candidate('m1', 'PO-1'), priorItemResults: [] }],
      adapter,
      persistClient: mem.client,
      now,
    });
    expect(single).not.toHaveBeenCalled();
  });
});
