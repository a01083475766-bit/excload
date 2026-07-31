import { describe, expect, it, vi } from 'vitest';

import type { SmartstoreProductOrderDetail } from '@/app/lib/smartstore/client';
import {
  SMARTSTORE_DISPATCH_MAX_BATCH,
  buildSmartstoreDispatchDate,
  classifySmartstoreDispatchPreflight,
  extractSmartstoreDispatchProductOrderIds,
  isAmbiguousDispatchHttpStatus,
  parseSmartstoreDispatchResponse,
  resolveSmartstoreDeliveryCompanyCode,
  runSmartstoreInvoiceTransmission,
} from '@/app/lib/smartstore/smartstore-invoice';

function detail(overrides?: {
  productOrderId?: string;
  orderId?: string;
  productOrderStatus?: string;
  placeOrderStatus?: string;
  claimType?: string;
  trackingNumber?: string;
  deliveryCompanyCode?: string;
  remainQuantity?: number | null;
}): SmartstoreProductOrderDetail {
  return {
    order: { orderId: overrides?.orderId ?? 'ORDER-1' },
    productOrder: {
      productOrderId: overrides?.productOrderId ?? 'PO-1',
      productOrderStatus: overrides?.productOrderStatus ?? 'PAYED',
      placeOrderStatus: overrides?.placeOrderStatus ?? 'OK',
      claimType: overrides?.claimType,
      remainQuantity:
        overrides && 'remainQuantity' in overrides ? (overrides.remainQuantity as number) : 1,
      productName: '상품',
    },
    delivery: overrides?.trackingNumber
      ? {
          trackingNumber: overrides.trackingNumber,
          deliveryCompanyCode: overrides.deliveryCompanyCode,
        }
      : undefined,
  };
}

describe('extractSmartstoreDispatchProductOrderIds', () => {
  it('dedupes and ignores bundle/order-style noise', () => {
    expect(
      extractSmartstoreDispatchProductOrderIds(['PO-1', 'PO-2', 'PO-1', 'bundle:BOX', '']),
    ).toEqual(['PO-1', 'PO-2']);
  });
});

describe('resolveSmartstoreDeliveryCompanyCode', () => {
  it('maps LOTTE to HYUNDAI and never returns LOTTE or CH1 fallback', () => {
    expect(
      resolveSmartstoreDeliveryCompanyCode({ courierCode: 'LOTTE', courierName: null }),
    ).toEqual({ ok: true, deliveryCompanyCode: 'HYUNDAI' });
    expect(
      resolveSmartstoreDeliveryCompanyCode({ courierCode: 'UNKNOWN', courierName: '기타' }).ok,
    ).toBe(false);
  });
});

describe('buildSmartstoreDispatchDate', () => {
  it('converts fixed UTC instants to exact KST wall clock with millis and +09:00', () => {
    expect(buildSmartstoreDispatchDate(new Date('2026-07-22T12:00:00.000Z'))).toBe(
      '2026-07-22T21:00:00.000+09:00',
    );
    expect(buildSmartstoreDispatchDate(new Date('2026-07-22T15:00:00.123Z'))).toBe(
      '2026-07-23T00:00:00.123+09:00',
    );
    expect(buildSmartstoreDispatchDate(new Date('2026-07-22T16:30:00.000Z'))).toBe(
      '2026-07-23T01:30:00.000+09:00',
    );
  });

  it('does not depend on process.env.TZ local getters', () => {
    const previous = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      expect(buildSmartstoreDispatchDate(new Date('2026-07-22T12:00:00.000Z'))).toBe(
        '2026-07-22T21:00:00.000+09:00',
      );
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});

describe('parseSmartstoreDispatchResponse', () => {
  it('parses successProductOrderIds and rejects confirm-shaped payloads', () => {
    const parsed = parseSmartstoreDispatchResponse(
      JSON.stringify({
        data: {
          successProductOrderIds: ['PO-1'],
          failProductOrderInfos: [{ productOrderId: 'PO-2', code: '9999', message: '실패' }],
        },
      }),
    );
    expect(parsed.structureValid).toBe(true);
    expect(parsed.successProductOrderIds).toEqual(['PO-1']);
    expect(parsed.failProductOrderInfos[0]?.productOrderId).toBe('PO-2');

    expect(
      parseSmartstoreDispatchResponse(
        JSON.stringify({
          data: {
            successProductOrderInfos: [{ productOrderId: 'PO-1' }],
            failProductOrderInfos: [],
          },
        }),
      ).structureValid,
    ).toBe(false);
  });
});

describe('classifySmartstoreDispatchPreflight', () => {
  it('allows only PAYED + OK without claim', () => {
    expect(
      classifySmartstoreDispatchPreflight({
        detail: detail(),
        requestedProductOrderId: 'PO-1',
        expectedMallOrderNo: 'ORDER-1',
        requestedTrackingNumber: '123',
        requestedDeliveryCompanyCode: 'CJGLS',
      }).action,
    ).toBe('DISPATCH');
  });

  it('requires confirmation for NOT_YET', () => {
    const decision = classifySmartstoreDispatchPreflight({
      detail: detail({ placeOrderStatus: 'NOT_YET' }),
      requestedProductOrderId: 'PO-1',
      expectedMallOrderNo: 'ORDER-1',
      requestedTrackingNumber: '123',
      requestedDeliveryCompanyCode: 'CJGLS',
    });
    expect(decision.action).toBe('BLOCK');
    if (decision.action !== 'BLOCK') return;
    expect(decision.errorCode).toBe('ORDER_CONFIRMATION_REQUIRED');
  });

  it('blocks claim/canceled and treats matching shipped invoice as already dispatched', () => {
    expect(
      classifySmartstoreDispatchPreflight({
        detail: detail({ claimType: 'CANCEL' }),
        requestedProductOrderId: 'PO-1',
        expectedMallOrderNo: 'ORDER-1',
        requestedTrackingNumber: '123',
        requestedDeliveryCompanyCode: 'CJGLS',
      }).action,
    ).toBe('BLOCK');

    expect(
      classifySmartstoreDispatchPreflight({
        detail: detail({
          productOrderStatus: 'DELIVERING',
          trackingNumber: 'INV-1',
          deliveryCompanyCode: 'CJGLS',
        }),
        requestedProductOrderId: 'PO-1',
        expectedMallOrderNo: 'ORDER-1',
        requestedTrackingNumber: 'INV-1',
        requestedDeliveryCompanyCode: 'CJGLS',
      }).action,
    ).toBe('ALREADY_DISPATCHED');
  });

  it('blocks unclear or zero remainQuantity without estimating 1', () => {
    expect(
      classifySmartstoreDispatchPreflight({
        detail: detail({ remainQuantity: null }),
        requestedProductOrderId: 'PO-1',
        expectedMallOrderNo: 'ORDER-1',
        requestedTrackingNumber: '123',
        requestedDeliveryCompanyCode: 'CJGLS',
      }),
    ).toMatchObject({
      action: 'BLOCK',
      status: 'QUANTITY_UNCLEAR',
      errorCode: 'QUANTITY_UNCLEAR',
    });

    expect(
      classifySmartstoreDispatchPreflight({
        detail: detail({ remainQuantity: 0 }),
        requestedProductOrderId: 'PO-1',
        expectedMallOrderNo: 'ORDER-1',
        requestedTrackingNumber: '123',
        requestedDeliveryCompanyCode: 'CJGLS',
      }),
    ).toMatchObject({
      action: 'BLOCK',
      errorCode: 'ORDER_STATE_NOT_ELIGIBLE',
    });
  });
});

describe('runSmartstoreInvoiceTransmission', () => {
  it('dispatches with productOrderId, DELIVERY, HYUNDAI, and chunked 30+1', async () => {
    const ids = Array.from({ length: 31 }, (_, index) => `PO-${index + 1}`);
    const dispatchBatch = vi.fn(async (items: ReadonlyArray<{ productOrderId: string }>) => ({
      httpStatus: 200,
      bodyText: JSON.stringify({
        data: {
          successProductOrderIds: items.map((item) => item.productOrderId),
          failProductOrderInfos: [],
        },
      }),
    }));

    const result = await runSmartstoreInvoiceTransmission({
      mallOrderNo: 'ORDER-1',
      mallLineItemIds: ids,
      courierCode: 'LOTTE',
      courierName: '롯데택배',
      trackingNumber: '123456789012',
      now: () => new Date('2026-07-22T12:00:00.000Z'),
      fetchByIds: async (requested) =>
        requested.map((productOrderId) =>
          detail({
            productOrderId,
            orderId: 'ORDER-1',
            placeOrderStatus: 'OK',
          }),
        ),
      dispatchBatch,
    });

    expect(result.success).toBe(true);
    expect(dispatchBatch).toHaveBeenCalledTimes(2);
    expect(dispatchBatch.mock.calls[0]?.[0]).toHaveLength(SMARTSTORE_DISPATCH_MAX_BATCH);
    expect(dispatchBatch.mock.calls[1]?.[0]).toHaveLength(1);
    const first = dispatchBatch.mock.calls[0]?.[0]?.[0] as {
      productOrderId: string;
      deliveryMethod: string;
      deliveryCompanyCode: string;
      dispatchDate: string;
    };
    expect(first.productOrderId).toBe('PO-1');
    expect(first.productOrderId).not.toBe('ORDER-1');
    expect(first.deliveryMethod).toBe('DELIVERY');
    expect(first.deliveryCompanyCode).toBe('HYUNDAI');
    expect(first.deliveryCompanyCode).not.toBe('LOTTE');
    expect(first.dispatchDate).toMatch(/\.\d{3}\+09:00$/);
  });

  it('does not POST when placeOrderStatus is NOT_YET and never calls confirm', async () => {
    const dispatchBatch = vi.fn();
    const result = await runSmartstoreInvoiceTransmission({
      mallOrderNo: 'ORDER-1',
      mallLineItemIds: ['PO-1'],
      courierCode: 'CJ',
      courierName: null,
      trackingNumber: '123456789012',
      fetchByIds: async () => [detail({ placeOrderStatus: 'NOT_YET' })],
      dispatchBatch,
    });
    expect(dispatchBatch).not.toHaveBeenCalled();
    expect(result.errorCode).toBe('ORDER_CONFIRMATION_REQUIRED');
    expect(result.errorMessage).toContain('주문조회 화면에서 발주확인');
  });

  it('does not POST for claim/canceled or preflight fetch failure', async () => {
    const dispatchBatch = vi.fn();
    const claim = await runSmartstoreInvoiceTransmission({
      mallOrderNo: 'ORDER-1',
      mallLineItemIds: ['PO-1'],
      courierCode: 'CJ',
      courierName: null,
      trackingNumber: '123456789012',
      fetchByIds: async () => [detail({ claimType: 'RETURN' })],
      dispatchBatch,
    });
    expect(dispatchBatch).not.toHaveBeenCalled();
    expect(claim.errorCode).toBe('ORDER_STATE_NOT_ELIGIBLE');

    const fetchFail = await runSmartstoreInvoiceTransmission({
      mallOrderNo: 'ORDER-1',
      mallLineItemIds: ['PO-1'],
      courierCode: 'CJ',
      courierName: null,
      trackingNumber: '123456789012',
      fetchByIds: async () => {
        throw new Error('network');
      },
      dispatchBatch,
    });
    expect(dispatchBatch).not.toHaveBeenCalled();
    expect(fetchFail.errorCode).toBe('PROVIDER_STATUS_UNKNOWN');
    expect(fetchFail.outcomeKind).toBe('unknown');
  });

  it('blocks unknown courier before API and does not use CH1', async () => {
    const dispatchBatch = vi.fn();
    const result = await runSmartstoreInvoiceTransmission({
      mallOrderNo: 'ORDER-1',
      mallLineItemIds: ['PO-1'],
      courierCode: 'UNKNOWN',
      courierName: '자가배송',
      trackingNumber: '123456789012',
      fetchByIds: async () => [detail()],
      dispatchBatch,
    });
    expect(dispatchBatch).not.toHaveBeenCalled();
    expect(result.errorCode).toBe('COURIER_UNSUPPORTED');
  });

  it('preserves mixed HTTP 200 success/fail and missing ids as uncertain', async () => {
    const dispatchBatch = vi.fn(async () => ({
      httpStatus: 200,
      bodyText: JSON.stringify({
        data: {
          successProductOrderIds: ['PO-1'],
          failProductOrderInfos: [{ productOrderId: 'PO-2', code: '9999', message: '실패' }],
        },
      }),
    }));

    const result = await runSmartstoreInvoiceTransmission({
      mallOrderNo: 'ORDER-1',
      mallLineItemIds: ['PO-1', 'PO-2', 'PO-3'],
      courierCode: 'CJ',
      courierName: null,
      trackingNumber: '123456789012',
      fetchByIds: async (requested) =>
        requested.map((productOrderId) => detail({ productOrderId })),
      dispatchBatch,
    });

    expect(result.outcomeKind).toBe('unknown');
    expect(result.itemResults.find((row) => row.productOrderId === 'PO-1')?.status).toBe(
      'DISPATCHED',
    );
    expect(result.itemResults.find((row) => row.productOrderId === 'PO-2')?.status).toBe('FAILED');
    expect(result.itemResults.find((row) => row.productOrderId === 'PO-3')?.status).toBe(
      'UNCERTAIN',
    );
  });

  it('does not auto-retry on timeout/429/5xx and keeps first chunk success', async () => {
    const ids = Array.from({ length: 31 }, (_, index) => `PO-${index + 1}`);
    const dispatchBatch = vi.fn(async (items: ReadonlyArray<{ productOrderId: string }>) => {
      if (items.length === 30) {
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

    const result = await runSmartstoreInvoiceTransmission({
      mallOrderNo: 'ORDER-1',
      mallLineItemIds: ids,
      courierCode: 'CJ',
      courierName: null,
      trackingNumber: '123456789012',
      fetchByIds: async (requested) =>
        requested.map((productOrderId) => {
          if (requested.length === 1) {
            return detail({
              productOrderId,
              productOrderStatus: 'PAYED',
              placeOrderStatus: 'OK',
            });
          }
          return detail({ productOrderId });
        }),
      dispatchBatch,
    });

    expect(dispatchBatch).toHaveBeenCalledTimes(2);
    expect(result.itemResults.filter((row) => row.status === 'DISPATCHED')).toHaveLength(30);
    expect(result.itemResults[30]?.status).toBe('UNCERTAIN');
    expect(result.outcomeKind).toBe('unknown');

    dispatchBatch.mockReset();
    dispatchBatch.mockResolvedValue({ httpStatus: 429, bodyText: '{}' });
    const rateLimited = await runSmartstoreInvoiceTransmission({
      mallOrderNo: 'ORDER-1',
      mallLineItemIds: ['PO-1'],
      courierCode: 'CJ',
      courierName: null,
      trackingNumber: '123456789012',
      fetchByIds: async () => [detail()],
      dispatchBatch,
    });
    expect(dispatchBatch).toHaveBeenCalledTimes(1);
    expect(rateLimited.outcomeKind).toBe('unknown');
    expect(rateLimited.itemResults[0]?.status).toBe('UNCERTAIN');
  });

  it('treats already shipped with same invoice as success without POST', async () => {
    const dispatchBatch = vi.fn();
    const result = await runSmartstoreInvoiceTransmission({
      mallOrderNo: 'ORDER-1',
      mallLineItemIds: ['PO-1'],
      courierCode: 'CJ',
      courierName: null,
      trackingNumber: 'INV-9',
      fetchByIds: async () => [
        detail({
          productOrderStatus: 'DELIVERING',
          trackingNumber: 'INV-9',
          deliveryCompanyCode: 'CJGLS',
        }),
      ],
      dispatchBatch,
    });
    expect(dispatchBatch).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.itemResults[0]?.status).toBe('ALREADY_DISPATCHED');
  });

  it('does not mark already shipped as success when invoice mismatches', async () => {
    const dispatchBatch = vi.fn();
    const result = await runSmartstoreInvoiceTransmission({
      mallOrderNo: 'ORDER-1',
      mallLineItemIds: ['PO-1'],
      courierCode: 'CJ',
      courierName: null,
      trackingNumber: 'INV-NEW',
      fetchByIds: async () => [
        detail({
          productOrderStatus: 'DELIVERING',
          trackingNumber: 'INV-OLD',
          deliveryCompanyCode: 'CJGLS',
        }),
      ],
      dispatchBatch,
    });
    expect(dispatchBatch).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.itemResults[0]?.status).toBe('UNCERTAIN');
  });
});

describe('smartstore invoice ambiguous HTTP classification', () => {
  it('treats every 5xx as unknown and keeps 429 unknown', () => {
    for (const status of [500, 501, 502, 503, 504, 520, 521, 522, 599]) {
      expect(isAmbiguousDispatchHttpStatus(status)).toBe(true);
    }
    expect(isAmbiguousDispatchHttpStatus(429)).toBe(true);
    expect(isAmbiguousDispatchHttpStatus(400)).toBe(false);
    expect(isAmbiguousDispatchHttpStatus(403)).toBe(false);
  });

  it('returns unknown on 501/520/522 without FAILED outcome', async () => {
    for (const httpStatus of [501, 520, 522]) {
      const dispatchBatch = vi.fn(async () => ({ httpStatus, bodyText: '{}' }));
      const result = await runSmartstoreInvoiceTransmission({
        mallOrderNo: 'ORDER-1',
        mallLineItemIds: ['PO-1'],
        courierCode: 'CJ',
        courierName: null,
        trackingNumber: '123456789012',
        fetchByIds: async () => [detail()],
        dispatchBatch,
      });
      expect(dispatchBatch).toHaveBeenCalledTimes(1);
      expect(result.outcomeKind).toBe('unknown');
    }
  });

  it('keeps definitive 4xx as failure', async () => {
    const dispatchBatch = vi.fn(async () => ({ httpStatus: 400, bodyText: '{}' }));
    const result = await runSmartstoreInvoiceTransmission({
      mallOrderNo: 'ORDER-1',
      mallLineItemIds: ['PO-1'],
      courierCode: 'CJ',
      courierName: null,
      trackingNumber: '123456789012',
      fetchByIds: async () => [detail()],
      dispatchBatch,
    });
    expect(result.outcomeKind).toBe('failure');
  });
});

/**
 * SMARTSTORE-B2: 교차 Match 배치는 smartstore-batch-dispatch에서 검증한다.
 * (이 파일의 Match 단위 전송 한계 고정 테스트는 제거됨)
 */
describe('SMARTSTORE-B2 cross-match coverage pointer', () => {
  it('keeps dispatchDate UTC→KST conversion in this module', () => {
    expect(buildSmartstoreDispatchDate(new Date('2026-07-22T12:00:00.000Z'))).toBe(
      '2026-07-22T21:00:00.000+09:00',
    );
  });
});
