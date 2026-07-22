import { describe, expect, it, vi } from 'vitest';

import { SMARTSTORE_DISPATCH_MAX_BATCH } from '@/app/lib/smartstore/client';
import type { SmartstoreProductOrderDetail } from '@/app/lib/smartstore/client';
import {
  buildSmartstoreItemShipmentFingerprint,
  runSmartstoreCrossMatchBatchDispatch,
} from '@/app/lib/smartstore/smartstore-batch-dispatch';
import { toPersistedResponseSummaryJson } from '@/app/lib/order-integration/transmission/repository';
import type { ShipmentTransmissionCandidate } from '@/app/lib/order-integration/transmission/types';

function detail(overrides: {
  productOrderId?: string;
  orderId?: string;
  productOrderStatus?: string;
  placeOrderStatus?: string;
  claimType?: string | null;
  trackingNumber?: string;
  deliveryCompanyCode?: string;
} = {}): SmartstoreProductOrderDetail {
  const productOrderId = overrides.productOrderId ?? 'PO-1';
  return {
    order: { orderId: overrides.orderId ?? `ORDER-${productOrderId}` },
    productOrder: {
      productOrderId,
      productOrderStatus: overrides.productOrderStatus ?? 'PAYED',
      placeOrderStatus: overrides.placeOrderStatus ?? 'OK',
      claimType: overrides.claimType ?? null,
      remainQuantity: 1,
    },
    delivery:
      overrides.trackingNumber || overrides.deliveryCompanyCode
        ? {
            trackingNumber: overrides.trackingNumber,
            deliveryCompany: overrides.deliveryCompanyCode,
          }
        : undefined,
  } as SmartstoreProductOrderDetail;
}

function candidate(
  overrides: Partial<ShipmentTransmissionCandidate> & { matchId: string; mallLineItemIds: string[] },
): ShipmentTransmissionCandidate {
  const firstPo = overrides.mallLineItemIds[0] ?? overrides.matchId;
  return {
    provider: 'SMARTSTORE',
    integrationAccountId: 'acct-1',
    uploadBatchId: 'batch-1',
    orderSyncOrderId: `order-${overrides.matchId}`,
    mallOrderNo: `ORDER-${firstPo}`,
    excloadOrderNo: `EXC-${overrides.matchId}`,
    trackingNumber: '123456789012',
    courierCode: 'CJ',
    courierName: null,
    ...overrides,
  };
}

function successBody(ids: readonly string[]) {
  return {
    httpStatus: 200,
    bodyText: JSON.stringify({
      data: {
        successProductOrderIds: [...ids],
        failProductOrderInfos: [],
      },
    }),
  };
}

describe('SMARTSTORE-B2 cross-match batch dispatch', () => {
  it('batches 100 matches on same account into 30+30+30+10', async () => {
    const entries = Array.from({ length: 100 }, (_, index) => {
      const matchId = `m-${index + 1}`;
      const po = `PO-${index + 1}`;
      return {
        matchId,
        candidate: candidate({
          matchId,
          mallLineItemIds: [po],
          mallOrderNo: `ORDER-${po}`,
        }),
        priorItemResults: [],
      };
    });
    const dispatchBatch = vi.fn(async (items: ReadonlyArray<{ productOrderId: string }>) =>
      successBody(items.map((item) => item.productOrderId)),
    );

    const outcomes = await runSmartstoreCrossMatchBatchDispatch({
      userId: 'user-1',
      integrationAccountId: 'acct-1',
      entries,
      fetchByIds: async (ids) =>
        ids.map((productOrderId) =>
          detail({ productOrderId, orderId: `ORDER-${productOrderId}` }),
        ),
      dispatchBatch,
    });

    expect(dispatchBatch).toHaveBeenCalledTimes(4);
    expect(dispatchBatch.mock.calls.map((call) => call[0]?.length)).toEqual([30, 30, 30, 10]);
    expect(outcomes).toHaveLength(100);
    expect(outcomes.every((row) => row.success)).toBe(true);
  });

  it('batches 31 matches into 30+1', async () => {
    const entries = Array.from({ length: 31 }, (_, index) => {
      const matchId = `m-${index + 1}`;
      return {
        matchId,
        candidate: candidate({ matchId, mallLineItemIds: [`PO-${index + 1}`] }),
        priorItemResults: [],
      };
    });
    const dispatchBatch = vi.fn(async (items: ReadonlyArray<{ productOrderId: string }>) =>
      successBody(items.map((item) => item.productOrderId)),
    );

    await runSmartstoreCrossMatchBatchDispatch({
      userId: 'user-1',
      integrationAccountId: 'acct-1',
      entries,
      fetchByIds: async (ids) =>
        ids.map((productOrderId) =>
          detail({ productOrderId, orderId: `ORDER-${productOrderId}` }),
        ),
      dispatchBatch,
    });

    expect(dispatchBatch).toHaveBeenCalledTimes(2);
    expect(dispatchBatch.mock.calls[0]?.[0]).toHaveLength(SMARTSTORE_DISPATCH_MAX_BATCH);
    expect(dispatchBatch.mock.calls[1]?.[0]).toHaveLength(1);
  });

  it('never mixes different accountIds in one POST body', async () => {
    const dispatchA = vi.fn(async (items: ReadonlyArray<{ productOrderId: string }>) =>
      successBody(items.map((item) => item.productOrderId)),
    );
    const dispatchB = vi.fn(async (items: ReadonlyArray<{ productOrderId: string }>) =>
      successBody(items.map((item) => item.productOrderId)),
    );

    await runSmartstoreCrossMatchBatchDispatch({
      userId: 'user-1',
      integrationAccountId: 'acct-A',
      entries: [
        {
          matchId: 'm1',
          candidate: candidate({
            matchId: 'm1',
            integrationAccountId: 'acct-A',
            mallLineItemIds: ['PO-A1'],
          }),
          priorItemResults: [],
        },
        {
          matchId: 'm2',
          candidate: candidate({
            matchId: 'm2',
            integrationAccountId: 'acct-A',
            mallLineItemIds: ['PO-A2'],
          }),
          priorItemResults: [],
        },
      ],
      fetchByIds: async (ids) =>
        ids.map((productOrderId) =>
          detail({ productOrderId, orderId: `ORDER-${productOrderId}` }),
        ),
      dispatchBatch: dispatchA,
    });
    await runSmartstoreCrossMatchBatchDispatch({
      userId: 'user-1',
      integrationAccountId: 'acct-B',
      entries: [
        {
          matchId: 'm3',
          candidate: candidate({
            matchId: 'm3',
            integrationAccountId: 'acct-B',
            mallLineItemIds: ['PO-B1'],
          }),
          priorItemResults: [],
        },
      ],
      fetchByIds: async (ids) =>
        ids.map((productOrderId) =>
          detail({ productOrderId, orderId: `ORDER-${productOrderId}` }),
        ),
      dispatchBatch: dispatchB,
    });

    expect(dispatchA).toHaveBeenCalledTimes(1);
    expect(dispatchA.mock.calls[0]?.[0]?.map((row) => row.productOrderId)).toEqual([
      'PO-A1',
      'PO-A2',
    ]);
    expect(dispatchB).toHaveBeenCalledTimes(1);
    expect(dispatchB.mock.calls[0]?.[0]?.map((row) => row.productOrderId)).toEqual(['PO-B1']);
  });

  it('dedupes same productOrderId+invoice across matches into one POST and fans out', async () => {
    const dispatchBatch = vi.fn(async (items: ReadonlyArray<{ productOrderId: string }>) =>
      successBody(items.map((item) => item.productOrderId)),
    );
    const outcomes = await runSmartstoreCrossMatchBatchDispatch({
      userId: 'user-1',
      integrationAccountId: 'acct-1',
      entries: [
        {
          matchId: 'match-a',
          candidate: candidate({
            matchId: 'match-a',
            mallLineItemIds: ['P1'],
            trackingNumber: '111',
            mallOrderNo: 'ORDER-A',
          }),
          priorItemResults: [],
        },
        {
          matchId: 'match-b',
          candidate: candidate({
            matchId: 'match-b',
            mallLineItemIds: ['P1'],
            trackingNumber: '111',
            mallOrderNo: 'ORDER-A',
          }),
          priorItemResults: [],
        },
      ],
      fetchByIds: async () => [detail({ productOrderId: 'P1', orderId: 'ORDER-A' })],
      dispatchBatch,
    });

    expect(dispatchBatch).toHaveBeenCalledTimes(1);
    expect(dispatchBatch.mock.calls[0]?.[0]).toHaveLength(1);
    expect(outcomes.find((row) => row.matchId === 'match-a')?.itemResults[0]?.status).toBe(
      'SUCCESS',
    );
    expect(outcomes.find((row) => row.matchId === 'match-b')?.itemResults[0]?.status).toBe(
      'SUCCESS',
    );
  });

  it('blocks conflicting tracking numbers for same productOrderId before POST', async () => {
    const dispatchBatch = vi.fn();
    const outcomes = await runSmartstoreCrossMatchBatchDispatch({
      userId: 'user-1',
      integrationAccountId: 'acct-1',
      entries: [
        {
          matchId: 'match-a',
          candidate: candidate({
            matchId: 'match-a',
            mallLineItemIds: ['P1'],
            trackingNumber: '111',
          }),
          priorItemResults: [],
        },
        {
          matchId: 'match-b',
          candidate: candidate({
            matchId: 'match-b',
            mallLineItemIds: ['P1'],
            trackingNumber: '222',
          }),
          priorItemResults: [],
        },
      ],
      fetchByIds: async () => [detail({ productOrderId: 'P1' })],
      dispatchBatch,
    });

    expect(dispatchBatch).not.toHaveBeenCalled();
    expect(outcomes.every((row) => row.itemResults[0]?.status === 'CONFLICT')).toBe(true);
  });

  it('blocks conflicting courier for same productOrderId before POST', async () => {
    const dispatchBatch = vi.fn();
    const outcomes = await runSmartstoreCrossMatchBatchDispatch({
      userId: 'user-1',
      integrationAccountId: 'acct-1',
      entries: [
        {
          matchId: 'match-a',
          candidate: candidate({
            matchId: 'match-a',
            mallLineItemIds: ['P1'],
            courierCode: 'CJ',
            trackingNumber: '111',
          }),
          priorItemResults: [],
        },
        {
          matchId: 'match-b',
          candidate: candidate({
            matchId: 'match-b',
            mallLineItemIds: ['P1'],
            courierCode: 'HANJIN',
            trackingNumber: '111',
          }),
          priorItemResults: [],
        },
      ],
      fetchByIds: async () => [detail({ productOrderId: 'P1' })],
      dispatchBatch,
    });

    expect(dispatchBatch).not.toHaveBeenCalled();
    expect(outcomes.every((row) => row.itemResults[0]?.status === 'CONFLICT')).toBe(true);
  });

  it('still posts non-conflicting ids when another id conflicts', async () => {
    const dispatchBatch = vi.fn(async (items: ReadonlyArray<{ productOrderId: string }>) =>
      successBody(items.map((item) => item.productOrderId)),
    );
    const outcomes = await runSmartstoreCrossMatchBatchDispatch({
      userId: 'user-1',
      integrationAccountId: 'acct-1',
      entries: [
        {
          matchId: 'match-a',
          candidate: candidate({
            matchId: 'match-a',
            mallLineItemIds: ['P1'],
            trackingNumber: '111',
          }),
          priorItemResults: [],
        },
        {
          matchId: 'match-b',
          candidate: candidate({
            matchId: 'match-b',
            mallLineItemIds: ['P1'],
            trackingNumber: '222',
          }),
          priorItemResults: [],
        },
        {
          matchId: 'match-c',
          candidate: candidate({
            matchId: 'match-c',
            mallLineItemIds: ['P2'],
            trackingNumber: '333',
          }),
          priorItemResults: [],
        },
      ],
      fetchByIds: async (ids) =>
        ids.map((productOrderId) =>
          detail({ productOrderId, orderId: `ORDER-${productOrderId}` }),
        ),
      dispatchBatch,
    });

    expect(dispatchBatch).toHaveBeenCalledTimes(1);
    expect(dispatchBatch.mock.calls[0]?.[0]?.map((row) => row.productOrderId)).toEqual(['P2']);
    expect(outcomes.find((row) => row.matchId === 'match-c')?.success).toBe(true);
    expect(outcomes.find((row) => row.matchId === 'match-a')?.itemResults[0]?.status).toBe(
      'CONFLICT',
    );
  });

  it('persists mixed itemResults and skips identical prior success on reprocess', async () => {
    const fingerprint = buildSmartstoreItemShipmentFingerprint({
      userId: 'user-1',
      integrationAccountId: 'acct-1',
      productOrderId: 'P1',
      deliveryCompanyCode: 'CJGLS',
      trackingNumber: '123456789012',
    });
    const prior = [
      {
        productOrderId: 'P1',
        status: 'SUCCESS' as const,
        providerCode: null,
        message: 'ok',
        shipmentFingerprint: fingerprint,
      },
      {
        productOrderId: 'P2',
        status: 'FAILED' as const,
        providerCode: 'X',
        message: 'fail',
        shipmentFingerprint: buildSmartstoreItemShipmentFingerprint({
          userId: 'user-1',
          integrationAccountId: 'acct-1',
          productOrderId: 'P2',
          deliveryCompanyCode: 'CJGLS',
          trackingNumber: '123456789012',
        }),
      },
    ];

    const persisted = toPersistedResponseSummaryJson({
      message: 'partial',
      itemResults: prior,
    });
    expect(persisted?.itemResults).toHaveLength(2);
    expect(JSON.stringify(persisted)).not.toMatch(/clientSecret|Bearer|010-|서울/i);

    const dispatchBatch = vi.fn(async (items: ReadonlyArray<{ productOrderId: string }>) =>
      successBody(items.map((item) => item.productOrderId)),
    );
    const outcomes = await runSmartstoreCrossMatchBatchDispatch({
      userId: 'user-1',
      integrationAccountId: 'acct-1',
      entries: [
        {
          matchId: 'match-1',
          candidate: candidate({
            matchId: 'match-1',
            mallLineItemIds: ['P1', 'P2'],
            mallOrderNo: 'ORDER-SHARED',
          }),
          priorItemResults: prior,
        },
      ],
      fetchByIds: async (ids) =>
        ids.map((productOrderId) =>
          detail({ productOrderId, orderId: 'ORDER-SHARED' }),
        ),
      dispatchBatch,
    });

    expect(dispatchBatch).toHaveBeenCalledTimes(1);
    expect(dispatchBatch.mock.calls[0]?.[0]?.map((row) => row.productOrderId)).toEqual(['P2']);
    expect(outcomes[0]?.itemResults.find((row) => row.productOrderId === 'P1')?.status).toBe(
      'ALREADY_DISPATCHED',
    );
    expect(outcomes[0]?.itemResults.find((row) => row.productOrderId === 'P2')?.status).toBe(
      'SUCCESS',
    );
  });

  it('blocks reprocess when prior success fingerprint differs', async () => {
    const priorFp = buildSmartstoreItemShipmentFingerprint({
      userId: 'user-1',
      integrationAccountId: 'acct-1',
      productOrderId: 'P1',
      deliveryCompanyCode: 'CJGLS',
      trackingNumber: 'OLDTRACK01',
    });
    const dispatchBatch = vi.fn();
    const outcomes = await runSmartstoreCrossMatchBatchDispatch({
      userId: 'user-1',
      integrationAccountId: 'acct-1',
      entries: [
        {
          matchId: 'match-1',
          candidate: candidate({
            matchId: 'match-1',
            mallLineItemIds: ['P1'],
            trackingNumber: 'NEWTRACK02',
          }),
          priorItemResults: [
            {
              productOrderId: 'P1',
              status: 'SUCCESS',
              shipmentFingerprint: priorFp,
            },
          ],
        },
      ],
      fetchByIds: async () => [detail({ productOrderId: 'P1' })],
      dispatchBatch,
    });

    expect(dispatchBatch).not.toHaveBeenCalled();
    expect(outcomes[0]?.itemResults[0]?.status).toBe('CONFLICT');
  });

  it('keeps first chunk success, marks ambiguous chunk UNCERTAIN, and later chunks NOT_ATTEMPTED', async () => {
    const entries = Array.from({ length: 61 }, (_, index) => {
      const matchId = `m-${index + 1}`;
      return {
        matchId,
        candidate: candidate({ matchId, mallLineItemIds: [`PO-${index + 1}`] }),
        priorItemResults: [],
      };
    });
    let call = 0;
    const dispatchBatch = vi.fn(async (items: ReadonlyArray<{ productOrderId: string }>) => {
      call += 1;
      if (call === 1) {
        return successBody(items.map((item) => item.productOrderId));
      }
      throw new Error('timeout');
    });

    const outcomes = await runSmartstoreCrossMatchBatchDispatch({
      userId: 'user-1',
      integrationAccountId: 'acct-1',
      entries,
      fetchByIds: async (ids) =>
        ids.map((productOrderId) =>
          detail({ productOrderId, orderId: `ORDER-${productOrderId}` }),
        ),
      dispatchBatch,
    });

    expect(dispatchBatch).toHaveBeenCalledTimes(2);
    expect(outcomes.filter((row) => row.itemResults[0]?.status === 'SUCCESS')).toHaveLength(30);
    expect(outcomes.filter((row) => row.itemResults[0]?.status === 'UNCERTAIN')).toHaveLength(30);
    expect(outcomes.filter((row) => row.itemResults[0]?.status === 'NOT_ATTEMPTED')).toHaveLength(
      1,
    );
    expect(
      outcomes.filter((row) => row.itemResults[0]?.status === 'NOT_ATTEMPTED')[0]?.externallyPosted,
    ).toBe(false);
    expect(
      outcomes.filter((row) => row.itemResults[0]?.status === 'SUCCESS')[0]?.externallyPosted,
    ).toBe(true);
  });

  it('does not auto-retry on 429', async () => {
    const dispatchBatch = vi.fn(async () => ({ httpStatus: 429, bodyText: '{}' }));
    await runSmartstoreCrossMatchBatchDispatch({
      userId: 'user-1',
      integrationAccountId: 'acct-1',
      entries: [
        {
          matchId: 'm1',
          candidate: candidate({ matchId: 'm1', mallLineItemIds: ['PO-1'] }),
          priorItemResults: [],
        },
      ],
      fetchByIds: async () => [detail()],
      dispatchBatch,
    });
    expect(dispatchBatch).toHaveBeenCalledTimes(1);
  });

  it('does not call confirm during batch dispatch', async () => {
    const confirm = vi.fn();
    const dispatchBatch = vi.fn(async (items: ReadonlyArray<{ productOrderId: string }>) =>
      successBody(items.map((item) => item.productOrderId)),
    );
    await runSmartstoreCrossMatchBatchDispatch({
      userId: 'user-1',
      integrationAccountId: 'acct-1',
      entries: [
        {
          matchId: 'm1',
          candidate: candidate({ matchId: 'm1', mallLineItemIds: ['PO-1'] }),
          priorItemResults: [],
        },
      ],
      fetchByIds: async () => [detail()],
      dispatchBatch,
    });
    expect(confirm).not.toHaveBeenCalled();
  });
});
