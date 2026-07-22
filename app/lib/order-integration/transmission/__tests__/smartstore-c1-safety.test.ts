import { describe, expect, it, vi } from 'vitest';

import { buildSmartstoreItemShipmentFingerprint } from '@/app/lib/smartstore/smartstore-batch-dispatch';
import { classifySmartstoreDispatchPreflight } from '@/app/lib/smartstore/smartstore-invoice';
import {
  classifySmartstoreVerifyItem,
  isSmartstoreVerifiableAttemptStatus,
  mergeSmartstoreVerifyItemResults,
  summarizeSmartstoreVerifyDecisions,
} from '@/app/lib/order-integration/transmission/smartstore-verify-reconcile';
import { runVerifyTransmissionService } from '@/app/lib/order-integration/transmission/verify-transmission-status';
import {
  collectVerifiableAttemptIds,
  buildRecentTransmitResultView,
} from '@/app/lib/order-integration/transmission/recent-transmit-result-view';
import type { ShipmentTransmissionItemResultSummary } from '@/app/lib/order-integration/transmission/types';

function detail(overrides?: {
  status?: string;
  remainQuantity?: number | null;
  deliveryCompanyCode?: string;
  trackingNumber?: string;
}) {
  return {
    order: { orderId: 'ORD-1' },
    productOrder: {
      productOrderId: 'PO-1',
      productOrderStatus: overrides?.status ?? 'PAYED',
      placeOrderStatus: 'OK',
      remainQuantity: overrides?.remainQuantity === undefined ? 1 : overrides.remainQuantity,
    },
    delivery:
      overrides?.deliveryCompanyCode || overrides?.trackingNumber
        ? {
            deliveryCompanyCode: overrides.deliveryCompanyCode,
            trackingNumber: overrides.trackingNumber,
          }
        : undefined,
  };
}

describe('SMARTSTORE-C1 remainQuantity preflight', () => {
  const base = {
    requestedProductOrderId: 'PO-1',
    expectedMallOrderNo: 'ORD-1',
    requestedTrackingNumber: '123456789012',
    requestedDeliveryCompanyCode: 'CJGLS',
  };

  it('allows remainQuantity=1 for new POST', () => {
    expect(
      classifySmartstoreDispatchPreflight({
        ...base,
        detail: detail({ remainQuantity: 1 }),
      }).action,
    ).toBe('DISPATCH');
  });

  it('blocks remainQuantity=0 without POST', () => {
    const decision = classifySmartstoreDispatchPreflight({
      ...base,
      detail: detail({ remainQuantity: 0 }),
    });
    expect(decision).toMatchObject({
      action: 'BLOCK',
      errorCode: 'ORDER_STATE_NOT_ELIGIBLE',
    });
  });

  it('blocks remainQuantity=null as QUANTITY_UNCLEAR without estimating 1', () => {
    const decision = classifySmartstoreDispatchPreflight({
      ...base,
      detail: detail({ remainQuantity: null }),
    });
    expect(decision).toMatchObject({
      action: 'BLOCK',
      status: 'QUANTITY_UNCLEAR',
      errorCode: 'QUANTITY_UNCLEAR',
    });
  });
});

describe('SMARTSTORE-C1 verify fingerprint', () => {
  const fp = buildSmartstoreItemShipmentFingerprint({
    userId: 'u1',
    integrationAccountId: 'acc-1',
    productOrderId: 'PO-1',
    deliveryCompanyCode: 'CJGLS',
    trackingNumber: '123456789012',
  });

  it('confirms only when shipped status and fingerprint match', () => {
    const decision = classifySmartstoreVerifyItem({
      userId: 'u1',
      integrationAccountId: 'acc-1',
      productOrderId: 'PO-1',
      expectedFingerprint: fp,
      detail: detail({
        status: 'DELIVERING',
        deliveryCompanyCode: 'CJGLS',
        trackingNumber: '123456789012',
      }),
    });
    expect(decision.kind).toBe('CONFIRMED');
    expect(decision.message).toContain('송장 반영 확인 완료');
  });

  it('conflicts when shipped but tracking or courier differs', () => {
    const decision = classifySmartstoreVerifyItem({
      userId: 'u1',
      integrationAccountId: 'acc-1',
      productOrderId: 'PO-1',
      expectedFingerprint: fp,
      detail: detail({
        status: 'DELIVERING',
        deliveryCompanyCode: 'CJGLS',
        trackingNumber: '999999999999',
      }),
    });
    expect(decision.kind).toBe('CONFLICT');
    expect(decision.message).toContain('재전송 금지');
  });

  it('keeps UNCERTAIN for PAYED without POST', () => {
    const decision = classifySmartstoreVerifyItem({
      userId: 'u1',
      integrationAccountId: 'acc-1',
      productOrderId: 'PO-1',
      expectedFingerprint: fp,
      detail: detail({ status: 'PAYED' }),
    });
    expect(decision.kind).toBe('PENDING');
    expect(decision.nextStatus).toBe('UNCERTAIN');
  });

  it('does not treat shipped status alone as success when delivery fields missing', () => {
    const decision = classifySmartstoreVerifyItem({
      userId: 'u1',
      integrationAccountId: 'acc-1',
      productOrderId: 'PO-1',
      expectedFingerprint: fp,
      detail: detail({ status: 'DELIVERING' }),
    });
    expect(decision.kind).toBe('MISSING_SHIPMENT_INFO');
  });

  it('preserves SUCCESS items and updates only UNCERTAIN', () => {
    const prior: ShipmentTransmissionItemResultSummary[] = [
      {
        productOrderId: 'PO-OK',
        status: 'SUCCESS',
        shipmentFingerprint: 'fp-ok',
        message: 'kept',
      },
      {
        productOrderId: 'PO-1',
        status: 'UNCERTAIN',
        shipmentFingerprint: fp,
        message: 'uncertain',
      },
    ];
    const details = new Map([
      [
        'PO-1',
        detail({
          status: 'DELIVERING',
          deliveryCompanyCode: 'CJGLS',
          trackingNumber: '123456789012',
        }) as never,
      ],
    ]);
    const { itemResults, decisions } = mergeSmartstoreVerifyItemResults({
      userId: 'u1',
      integrationAccountId: 'acc-1',
      priorItems: prior,
      detailsByProductOrderId: details,
    });
    expect(itemResults.find((r) => r.productOrderId === 'PO-OK')?.status).toBe('SUCCESS');
    expect(itemResults.find((r) => r.productOrderId === 'PO-1')?.status).toBe('SUCCESS');
    const summary = summarizeSmartstoreVerifyDecisions({ itemResults, decisions });
    expect(summary.allConfirmed).toBe(true);
    expect(summary.status).toBe('CONFIRMED');
  });

  it('keeps Match-level UNKNOWN when some items remain uncertain', () => {
    const prior: ShipmentTransmissionItemResultSummary[] = [
      {
        productOrderId: 'PO-OK',
        status: 'SUCCESS',
        shipmentFingerprint: 'fp-ok',
      },
      {
        productOrderId: 'PO-1',
        status: 'UNCERTAIN',
        shipmentFingerprint: fp,
      },
    ];
    const details = new Map([['PO-1', detail({ status: 'PAYED' }) as never]]);
    const { itemResults, decisions } = mergeSmartstoreVerifyItemResults({
      userId: 'u1',
      integrationAccountId: 'acc-1',
      priorItems: prior,
      detailsByProductOrderId: details,
    });
    const summary = summarizeSmartstoreVerifyDecisions({ itemResults, decisions });
    expect(summary.allConfirmed).toBe(false);
    expect(summary.hasUncertain).toBe(true);
    expect(summary.status).toBe('PARTIAL');
  });
});

describe('SMARTSTORE-C1 verifiable attempts', () => {
  it('allows SUCCESS and UNKNOWN with dispatchedAt; excludes NOT_ATTEMPTED / never posted', () => {
    expect(
      isSmartstoreVerifiableAttemptStatus({ status: 'SUCCESS', dispatchedAt: new Date() }),
    ).toBe(true);
    expect(
      isSmartstoreVerifiableAttemptStatus({ status: 'UNKNOWN', dispatchedAt: new Date() }),
    ).toBe(true);
    expect(isSmartstoreVerifiableAttemptStatus({ status: 'UNKNOWN', dispatchedAt: null })).toBe(
      false,
    );
    expect(isSmartstoreVerifiableAttemptStatus({ status: 'FAILED', dispatchedAt: null })).toBe(
      false,
    );
  });

  it('collects UNCERTAIN failed rows for verify button', () => {
    const view = buildRecentTransmitResultView({
      body: {
        batchId: 'b1',
        summary: { requestedCount: 2, successCount: 0, failureCount: 2, skippedCount: 0 },
        results: [
          {
            matchId: 'm1',
            attemptId: 'a-unc',
            attempted: true,
            previousStatus: 'READY',
            nextStatus: 'UNKNOWN',
            success: false,
            retryable: false,
            errorCode: 'UNCERTAIN',
            errorMessage: null,
            providerRequestId: null,
            requiresRetryPreparation: false,
          },
          {
            matchId: 'm2',
            attemptId: 'a-na',
            attempted: true,
            previousStatus: 'READY',
            nextStatus: 'FAILED',
            success: false,
            retryable: false,
            errorCode: 'NOT_ATTEMPTED',
            errorMessage: null,
            providerRequestId: null,
            requiresRetryPreparation: false,
          },
        ],
      },
      displayRows: [
        { matchId: 'm1', provider: 'SMARTSTORE', trackingNumberValue: '1' },
        { matchId: 'm2', provider: 'SMARTSTORE', trackingNumberValue: '2' },
      ],
    });
    expect(collectVerifiableAttemptIds(view!.results)).toEqual(['a-unc']);
  });
});

describe('SMARTSTORE-C1 verify service read-only', () => {
  it('verifies UNKNOWN attempt with matching fingerprint and never calls confirm/dispatch', async () => {
    const fp = buildSmartstoreItemShipmentFingerprint({
      userId: 'u1',
      integrationAccountId: 'acc-1',
      productOrderId: 'PO-1',
      deliveryCompanyCode: 'CJGLS',
      trackingNumber: '123456789012',
    });
    const fetchByIds = vi.fn(async () => [
      detail({
        status: 'DELIVERING',
        deliveryCompanyCode: 'CJGLS',
        trackingNumber: '123456789012',
      }),
    ]);
    const persist = vi.fn(async () => undefined);
    const confirm = vi.fn();
    const dispatch = vi.fn();

    const result = await runVerifyTransmissionService(
      {
        findAttempts: async () => [
          {
            id: 'a1',
            userId: 'u1',
            uploadBatchId: 'b1',
            shipmentMatchId: 'm1',
            provider: 'SMARTSTORE',
            integrationAccountId: 'acc-1',
            status: 'UNKNOWN',
            mallOrderNo: 'ORD-1',
            mallLineItemIdsJson: ['PO-1'],
            trackingNumberNormalized: '123456789012',
            courierCode: 'CJ',
            dispatchedAt: new Date('2026-07-22T00:00:00.000Z'),
            responseSummaryJson: {
              itemResults: [
                {
                  productOrderId: 'PO-1',
                  status: 'UNCERTAIN',
                  shipmentFingerprint: fp,
                  message: 'uncertain',
                },
              ],
            },
            orderSyncOrder: { mallLineItemIds: ['PO-1'], normalizedPayloadJson: null },
          },
        ],
        loadAccount: async ({ accountId, userId, provider }) => {
          expect(accountId).toBe('acc-1');
          expect(userId).toBe('u1');
          expect(provider).toBe('SMARTSTORE');
          return { id: 'acc-1' } as never;
        },
        resolveSmartstoreCredentials: () => ({
          clientId: 'cid',
          clientSecret: 'sec',
          authType: 'SELF',
        }),
        fetchSmartstoreByIds: fetchByIds,
        persistSmartstoreVerification: persist,
      },
      { userId: 'u1', batchId: 'b1', attemptIds: ['a1'] },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.results[0]).toMatchObject({
      attemptId: 'a1',
      status: 'CONFIRMED',
      message: '송장 반영 확인 완료',
    });
    expect(fetchByIds).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        allConfirmed: true,
        attemptId: 'a1',
        shipmentMatchId: 'm1',
      }),
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(JSON.stringify(result.body)).not.toMatch(/clientSecret|access_token|Bearer/i);
  });

  it('excludes FAILED without dispatchedAt from verify', async () => {
    const result = await runVerifyTransmissionService(
      {
        findAttempts: async () => [
          {
            id: 'a-fail',
            userId: 'u1',
            uploadBatchId: 'b1',
            shipmentMatchId: 'm1',
            provider: 'SMARTSTORE',
            integrationAccountId: 'acc-1',
            status: 'FAILED',
            mallOrderNo: 'ORD-1',
            mallLineItemIdsJson: ['PO-1'],
            dispatchedAt: null,
            orderSyncOrder: null,
          },
        ],
        loadAccount: async () => ({ id: 'acc-1' }) as never,
        fetchSmartstoreByIds: async () => {
          throw new Error('should not fetch');
        },
      },
      { userId: 'u1', batchId: 'b1', attemptIds: ['a-fail'] },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.results[0]?.status).toBe('UNSUPPORTED');
  });

  it('keeps Coupang SUCCESS-only verify path', async () => {
    const result = await runVerifyTransmissionService(
      {
        findAttempts: async () => [
          {
            id: 'a-cp',
            userId: 'u1',
            uploadBatchId: 'b1',
            shipmentMatchId: 'm1',
            provider: 'COUPANG',
            integrationAccountId: 'acc-cp',
            status: 'UNKNOWN',
            mallOrderNo: 'ORD-1',
            mallLineItemIdsJson: ['bundle:1'],
            dispatchedAt: new Date(),
            orderSyncOrder: {
              mallLineItemIds: ['bundle:1'],
              normalizedPayloadJson: { shipmentBoxIds: ['1'] },
            },
          },
        ],
        loadAccount: async () => ({ id: 'acc-cp' }) as never,
        fetchCoupangByBoxId: async () => {
          throw new Error('should not call');
        },
      },
      { userId: 'u1', batchId: 'b1', attemptIds: ['a-cp'] },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.results[0]?.status).toBe('UNSUPPORTED');
  });
});
