import { describe, expect, it, vi } from 'vitest';

import type { SmartstoreProductOrderDetail } from '@/app/lib/smartstore/client';
import {
  SMARTSTORE_ALREADY_CONFIRMED_CODE,
  SMARTSTORE_CONFIRM_MAX_BATCH,
  applyUnconfirmedAddressChangeGuards,
  chunkProductOrderIds,
  classifyConfirmPreflight,
  mergeSmartstoreRefetchedOrdersIntoFetchResult,
  parseSmartstoreConfirmResponse,
  runSmartstoreConfirm,
  validateConfirmProductOrderIds,
} from '@/app/lib/smartstore/smartstore-confirm';

function detail(overrides?: {
  productOrderId?: string;
  orderId?: string;
  productOrderStatus?: string;
  placeOrderStatus?: string;
  claimType?: string;
  claimStatus?: string;
  address?: string;
}): SmartstoreProductOrderDetail {
  return {
    order: {
      orderId: overrides?.orderId ?? 'ORDER-1',
      paymentDate: '2026-07-01T10:00:00.000+09:00',
    },
    productOrder: {
      productOrderId: overrides?.productOrderId ?? 'PO-1',
      productOrderStatus: overrides?.productOrderStatus ?? 'PAYED',
      placeOrderStatus: overrides?.placeOrderStatus ?? 'NOT_YET',
      claimType: overrides?.claimType,
      claimStatus: overrides?.claimStatus,
      productName: '테스트상품',
      remainQuantity: 1,
      shippingAddress: {
        name: '홍길동',
        tel1: '01012345678',
        baseAddress: overrides?.address ?? '서울시 강남구',
        detailedAddress: '101호',
      },
    },
  };
}

describe('validateConfirmProductOrderIds', () => {
  it('dedupes productOrderIds', () => {
    const result = validateConfirmProductOrderIds(['PO-1', 'PO-2', 'PO-1', ' PO-2 ']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.productOrderIds).toEqual(['PO-1', 'PO-2']);
  });

  it('rejects empty and invalid values', () => {
    expect(validateConfirmProductOrderIds([]).ok).toBe(false);
    expect(validateConfirmProductOrderIds(['']).ok).toBe(false);
    expect(validateConfirmProductOrderIds(['PO 1']).ok).toBe(false);
    expect(validateConfirmProductOrderIds([null]).ok).toBe(false);
  });
});

describe('chunkProductOrderIds', () => {
  it('splits into max 30', () => {
    const ids = Array.from({ length: 65 }, (_, index) => `PO-${index + 1}`);
    const chunks = chunkProductOrderIds(ids, SMARTSTORE_CONFIRM_MAX_BATCH);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(30);
    expect(chunks[1]).toHaveLength(30);
    expect(chunks[2]).toHaveLength(5);
  });
});

describe('parseSmartstoreConfirmResponse', () => {
  it('parses successProductOrderInfos and failProductOrderInfos', () => {
    const parsed = parseSmartstoreConfirmResponse(
      JSON.stringify({
        data: {
          successProductOrderInfos: [
            { productOrderId: 'PO-1', isReceiverAddressChanged: true },
            { productOrderId: 'PO-2', isReceiverAddressChanged: false },
          ],
          failProductOrderInfos: [
            { productOrderId: 'PO-3', code: '9999', message: '주문상태 확인 필요' },
          ],
        },
      }),
    );
    expect(parsed.structureValid).toBe(true);
    expect(parsed.successProductOrderInfos).toEqual([
      { productOrderId: 'PO-1', isReceiverAddressChanged: true },
      { productOrderId: 'PO-2', isReceiverAddressChanged: false },
    ]);
    expect(parsed.failProductOrderInfos[0]?.productOrderId).toBe('PO-3');
    expect(parsed.failProductOrderInfos[0]?.code).toBe('9999');
  });

  it('does not accept dispatch-style successProductOrderIds as confirm success', () => {
    const parsed = parseSmartstoreConfirmResponse(
      JSON.stringify({
        data: {
          successProductOrderIds: ['PO-1'],
          failProductOrderInfos: [],
        },
      }),
    );
    expect(parsed.structureValid).toBe(false);
    expect(parsed.successProductOrderInfos).toEqual([]);
  });

  it('marks unexpected structure as invalid', () => {
    expect(parseSmartstoreConfirmResponse('not-json').structureValid).toBe(false);
    expect(parseSmartstoreConfirmResponse('{"hello":1}').structureValid).toBe(false);
  });
});

describe('classifyConfirmPreflight', () => {
  it('allows only PAYED + NOT_YET', () => {
    expect(classifyConfirmPreflight(detail(), 'PO-1')).toEqual({ action: 'CONFIRM' });
  });

  it('marks OK as already confirmed without confirm POST', () => {
    expect(
      classifyConfirmPreflight(detail({ placeOrderStatus: 'OK' }), 'PO-1').action,
    ).toBe('ALREADY_CONFIRMED');
  });

  it('blocks claim / canceled / unclear without POST', () => {
    expect(
      classifyConfirmPreflight(detail({ claimType: 'CANCEL' }), 'PO-1').action,
    ).toBe('SKIP');
    expect(
      classifyConfirmPreflight(detail({ productOrderStatus: 'CANCELED' }), 'PO-1').action,
    ).toBe('SKIP');
    expect(
      classifyConfirmPreflight(detail({ placeOrderStatus: 'WEIRD' }), 'PO-1').action,
    ).toBe('SKIP');
  });

  it('blocks mismatched productOrderId', () => {
    expect(classifyConfirmPreflight(detail({ productOrderId: 'PO-9' }), 'PO-1').action).toBe(
      'SKIP',
    );
    expect(classifyConfirmPreflight(null, 'PO-1').action).toBe('SKIP');
  });
});

describe('runSmartstoreConfirm', () => {
  it('calls confirm only for PAYED + NOT_YET and chunks by 30', async () => {
    const ids = Array.from({ length: 32 }, (_, index) => `PO-${index + 1}`);
    const confirmBatch = vi.fn(async (batch: readonly string[]) => ({
      httpStatus: 200,
      bodyText: JSON.stringify({
        data: {
          successProductOrderInfos: batch.map((productOrderId) => ({
            productOrderId,
            isReceiverAddressChanged: false,
          })),
          failProductOrderInfos: [],
        },
      }),
    }));

    const fetchByIds = vi.fn(async (requested: readonly string[]) =>
      requested.map((productOrderId) =>
        detail({
          productOrderId,
          placeOrderStatus:
            requested.length === 32 && productOrderId === 'PO-1'
              ? 'NOT_YET'
              : productOrderId.startsWith('PO-')
                ? 'NOT_YET'
                : 'NOT_YET',
        }),
      ),
    );

    // First call: preflight all 32. Subsequent: per-success refetch.
    fetchByIds.mockImplementation(async (requested: readonly string[]) => {
      return requested.map((productOrderId) => {
        const isPreflight = requested.length > 1;
        return detail({
          productOrderId,
          placeOrderStatus: isPreflight ? 'NOT_YET' : 'OK',
        });
      });
    });

    const result = await runSmartstoreConfirm({
      productOrderIds: ids,
      fetchByIds,
      confirmBatch,
    });

    expect(confirmBatch).toHaveBeenCalledTimes(2);
    expect(confirmBatch.mock.calls[0]?.[0]).toHaveLength(30);
    expect(confirmBatch.mock.calls[1]?.[0]).toHaveLength(2);
    expect(result.confirmedCount).toBe(32);
  });

  it('does not POST when placeOrderStatus is already OK', async () => {
    const confirmBatch = vi.fn();
    const result = await runSmartstoreConfirm({
      productOrderIds: ['PO-1'],
      fetchByIds: async () => [detail({ placeOrderStatus: 'OK' })],
      confirmBatch,
    });
    expect(confirmBatch).not.toHaveBeenCalled();
    expect(result.alreadyConfirmedCount).toBe(1);
    expect(result.results[0]?.status).toBe('ALREADY_CONFIRMED');
  });

  it('does not POST for canceled or claim orders', async () => {
    const confirmBatch = vi.fn();
    const result = await runSmartstoreConfirm({
      productOrderIds: ['PO-1', 'PO-2'],
      fetchByIds: async () => [
        detail({ productOrderId: 'PO-1', productOrderStatus: 'CANCELED' }),
        detail({ productOrderId: 'PO-2', claimType: 'RETURN' }),
      ],
      confirmBatch,
    });
    expect(confirmBatch).not.toHaveBeenCalled();
    expect(result.failedCount).toBe(2);
  });

  it('never sends orderId as productOrderId when detail mismatch', async () => {
    const confirmBatch = vi.fn();
    const result = await runSmartstoreConfirm({
      productOrderIds: ['ORDER-1'],
      fetchByIds: async () => [detail({ orderId: 'ORDER-1', productOrderId: 'PO-1' })],
      confirmBatch,
    });
    expect(confirmBatch).not.toHaveBeenCalled();
    expect(result.results[0]?.status).toBe('FAILED');
  });

  it('preserves mixed success and failure in HTTP 200', async () => {
    const confirmBatch = vi.fn(async () => ({
      httpStatus: 200,
      bodyText: JSON.stringify({
        data: {
          successProductOrderInfos: [{ productOrderId: 'PO-1', isReceiverAddressChanged: false }],
          failProductOrderInfos: [
            { productOrderId: 'PO-2', code: '9999', message: '주문상태 확인 필요' },
          ],
        },
      }),
    }));

    const result = await runSmartstoreConfirm({
      productOrderIds: ['PO-1', 'PO-2'],
      fetchByIds: vi
        .fn()
        .mockResolvedValueOnce([
          detail({ productOrderId: 'PO-1' }),
          detail({ productOrderId: 'PO-2' }),
        ])
        .mockResolvedValueOnce([detail({ productOrderId: 'PO-1', placeOrderStatus: 'OK' })]),
      confirmBatch,
    });

    expect(confirmBatch).toHaveBeenCalledTimes(1);
    expect(result.confirmedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.results.find((row) => row.productOrderId === 'PO-2')?.status).toBe('FAILED');
  });

  it('handles isReceiverAddressChanged with detail refetch', async () => {
    const confirmBatch = vi.fn(async () => ({
      httpStatus: 200,
      bodyText: JSON.stringify({
        data: {
          successProductOrderInfos: [{ productOrderId: 'PO-1', isReceiverAddressChanged: true }],
          failProductOrderInfos: [],
        },
      }),
    }));

    const result = await runSmartstoreConfirm({
      productOrderIds: ['PO-1'],
      fetchByIds: vi
        .fn()
        .mockResolvedValueOnce([detail({ productOrderId: 'PO-1', address: '서울시 강남구' })])
        .mockResolvedValueOnce([
          detail({ productOrderId: 'PO-1', placeOrderStatus: 'OK', address: '부산시 해운대구' }),
        ]),
      confirmBatch,
    });

    expect(result.addressChangedCount).toBe(1);
    expect(result.results[0]?.status).toBe('ADDRESS_CHANGED');
    expect(result.results[0]?.views?.[0]?.detail.receiverAddress).toContain('부산시');
    expect(result.results[0]?.message).toContain('택배 양식을 다시 내려받아');
  });

  it('treats 104443 as already confirmed only after placeOrderStatus OK recheck', async () => {
    const confirmBatch = vi.fn(async () => ({
      httpStatus: 200,
      bodyText: JSON.stringify({
        data: {
          successProductOrderInfos: [],
          failProductOrderInfos: [
            {
              productOrderId: 'PO-1',
              code: SMARTSTORE_ALREADY_CONFIRMED_CODE,
              message: '이미 발주확인 된 주문입니다.',
            },
          ],
        },
      }),
    }));

    const okResult = await runSmartstoreConfirm({
      productOrderIds: ['PO-1'],
      fetchByIds: vi
        .fn()
        .mockResolvedValueOnce([detail({ productOrderId: 'PO-1' })])
        .mockResolvedValueOnce([detail({ productOrderId: 'PO-1', placeOrderStatus: 'OK' })]),
      confirmBatch,
    });
    expect(okResult.results[0]?.status).toBe('ALREADY_CONFIRMED');

    const uncertainResult = await runSmartstoreConfirm({
      productOrderIds: ['PO-1'],
      fetchByIds: vi
        .fn()
        .mockResolvedValueOnce([detail({ productOrderId: 'PO-1' })])
        .mockResolvedValueOnce([detail({ productOrderId: 'PO-1', placeOrderStatus: 'NOT_YET' })]),
      confirmBatch,
    });
    expect(uncertainResult.results[0]?.status).toBe('UNCERTAIN');
  });

  it('does not auto-retry failed confirm POST', async () => {
    const confirmBatch = vi.fn(async () => {
      throw new Error('network');
    });
    const fetchByIds = vi
      .fn()
      .mockResolvedValueOnce([detail({ productOrderId: 'PO-1' })])
      .mockResolvedValueOnce([detail({ productOrderId: 'PO-1', placeOrderStatus: 'NOT_YET' })]);

    await runSmartstoreConfirm({
      productOrderIds: ['PO-1'],
      fetchByIds,
      confirmBatch,
    });

    expect(confirmBatch).toHaveBeenCalledTimes(1);
  });

  it('marks confirm success without status refetch as UNCERTAIN, not CONFIRMED/FAILED', async () => {
    const confirmBatch = vi.fn(async () => ({
      httpStatus: 200,
      bodyText: JSON.stringify({
        data: {
          successProductOrderInfos: [{ productOrderId: 'PO-1', isReceiverAddressChanged: false }],
          failProductOrderInfos: [],
        },
      }),
    }));

    const result = await runSmartstoreConfirm({
      productOrderIds: ['PO-1'],
      fetchByIds: vi
        .fn()
        .mockResolvedValueOnce([detail({ productOrderId: 'PO-1' })])
        .mockRejectedValueOnce(new Error('refetch failed')),
      confirmBatch,
    });

    expect(confirmBatch).toHaveBeenCalledTimes(1);
    expect(result.results[0]?.status).toBe('UNCERTAIN');
    expect(result.confirmedCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.uncertainCount).toBe(1);
    expect(result.results[0]?.message).toContain('주문조회 후 상태를 확인해');
    expect(result.results[0]?.message).toContain('다시 실행하지 마세요');
  });

  it('on POST timeout, rechecks status: OK → ALREADY_CONFIRMED, otherwise UNCERTAIN', async () => {
    const confirmBatch = vi.fn(async () => {
      throw new Error('timeout');
    });

    const okResult = await runSmartstoreConfirm({
      productOrderIds: ['PO-1'],
      fetchByIds: vi
        .fn()
        .mockResolvedValueOnce([detail({ productOrderId: 'PO-1' })])
        .mockResolvedValueOnce([detail({ productOrderId: 'PO-1', placeOrderStatus: 'OK' })]),
      confirmBatch,
    });
    expect(confirmBatch).toHaveBeenCalledTimes(1);
    expect(okResult.results[0]?.status).toBe('ALREADY_CONFIRMED');
    expect(okResult.failedCount).toBe(0);

    confirmBatch.mockClear();
    const uncertainResult = await runSmartstoreConfirm({
      productOrderIds: ['PO-1'],
      fetchByIds: vi
        .fn()
        .mockResolvedValueOnce([detail({ productOrderId: 'PO-1' })])
        .mockRejectedValueOnce(new Error('refetch failed')),
      confirmBatch,
    });
    expect(confirmBatch).toHaveBeenCalledTimes(1);
    expect(uncertainResult.results[0]?.status).toBe('UNCERTAIN');
    expect(uncertainResult.failedCount).toBe(0);
    expect(uncertainResult.uncertainCount).toBe(1);
  });

  it('blocks stale address when isReceiverAddressChanged but detail refetch fails', async () => {
    const confirmBatch = vi.fn(async () => ({
      httpStatus: 200,
      bodyText: JSON.stringify({
        data: {
          successProductOrderInfos: [{ productOrderId: 'PO-1', isReceiverAddressChanged: true }],
          failProductOrderInfos: [],
        },
      }),
    }));

    const result = await runSmartstoreConfirm({
      productOrderIds: ['PO-1'],
      fetchByIds: vi
        .fn()
        .mockResolvedValueOnce([detail({ productOrderId: 'PO-1', address: '서울시 강남구' })])
        .mockRejectedValueOnce(new Error('refetch failed')),
      confirmBatch,
    });

    expect(result.results[0]?.status).toBe('UNCERTAIN');
    expect(result.results[0]?.isReceiverAddressChanged).toBe(true);
    expect(result.addressChangedCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.results[0]?.standardRows).toBeNull();
    expect(result.results[0]?.views).toBeNull();
    expect(result.results[0]?.message).toContain('배송지가 변경됐지만');
    expect(result.results[0]?.message).toContain('기존 택배 양식은 사용하지 말고');
  });

  it('keeps earlier chunk successes when a later chunk fails', async () => {
    const ids = Array.from({ length: 31 }, (_, index) => `PO-${index + 1}`);
    const confirmBatch = vi.fn(async (batch: readonly string[]) => {
      if (batch.length === 30) {
        return {
          httpStatus: 200,
          bodyText: JSON.stringify({
            data: {
              successProductOrderInfos: batch.map((productOrderId) => ({
                productOrderId,
                isReceiverAddressChanged: false,
              })),
              failProductOrderInfos: [],
            },
          }),
        };
      }
      return { httpStatus: 400, bodyText: '{}' };
    });

    let fetchCall = 0;
    const fetchByIds = vi.fn(async (requested: readonly string[]) => {
      fetchCall += 1;
      return requested.map((productOrderId) =>
        detail({
          productOrderId,
          placeOrderStatus: fetchCall === 1 ? 'NOT_YET' : 'OK',
        }),
      );
    });

    const result = await runSmartstoreConfirm({
      productOrderIds: ids,
      fetchByIds,
      confirmBatch,
    });

    expect(result.confirmedCount).toBe(30);
    expect(result.failedCount).toBe(1);
  });
});

describe('applyUnconfirmedAddressChangeGuards', () => {
  it('obscures stale address and blocks hub eligibility', () => {
    const guarded = applyUnconfirmedAddressChangeGuards({
      rows: [
        { 상품주문번호: 'PO-1', 받는사람주소1: '서울 강남', 받는사람주소2: '101호' } as never,
        { 상품주문번호: 'PO-2', 받는사람주소1: '대구' } as never,
      ],
      views: [
        {
          rowIndex: 0,
          status: 'PAYED',
          statusLabel: '결제완료',
          placeOrderStatus: 'NOT_YET',
          orderNo: 'O1',
          productOrderNo: 'PO-1',
          paidAt: '',
          orderedAt: '',
          productName: '',
          productOption: '',
          quantity: '1',
          receiverName: '',
          paymentAmount: '',
          paymentMeans: '',
          hasTracking: false,
          claimLabel: '',
          detail: {
            ordererName: '',
            receiverPhone: '',
            receiverAddress: '서울 강남 101호',
            deliveryMemo: '',
            sellerProductCode: '',
          },
        },
      ],
      productOrderIds: ['PO-1'],
    });

    expect(String(guarded.rows[0]?.['받는사람주소1'])).toContain('배송지 변경됨');
    expect(String(guarded.rows[0]?.['받는사람주소2'])).toBe('');
    expect(String(guarded.rows[1]?.['받는사람주소1'])).toBe('대구');
    expect(guarded.views[0]?.hubEligible).toBe(false);
    expect(guarded.views[0]?.detail.receiverAddress).toContain('재조회 필요');
  });
});

describe('mergeSmartstoreRefetchedOrdersIntoFetchResult', () => {
  it('replaces rows by productOrderId', () => {
    const merged = mergeSmartstoreRefetchedOrdersIntoFetchResult({
      rows: [
        { 상품주문번호: 'PO-1', 받는사람주소1: '서울' } as never,
        { 상품주문번호: 'PO-2', 받는사람주소1: '대구' } as never,
      ],
      views: [
        {
          rowIndex: 0,
          status: 'PAYED',
          statusLabel: '결제완료',
          placeOrderStatus: 'NOT_YET',
          orderNo: 'O1',
          productOrderNo: 'PO-1',
          paidAt: '',
          orderedAt: '',
          productName: '',
          productOption: '',
          quantity: '1',
          receiverName: '',
          paymentAmount: '',
          paymentMeans: '',
          hasTracking: false,
          claimLabel: '',
          detail: {
            ordererName: '',
            receiverPhone: '',
            receiverAddress: '서울',
            deliveryMemo: '',
            sellerProductCode: '',
          },
        },
        {
          rowIndex: 1,
          status: 'PAYED',
          statusLabel: '결제완료',
          placeOrderStatus: 'NOT_YET',
          orderNo: 'O2',
          productOrderNo: 'PO-2',
          paidAt: '',
          orderedAt: '',
          productName: '',
          productOption: '',
          quantity: '1',
          receiverName: '',
          paymentAmount: '',
          paymentMeans: '',
          hasTracking: false,
          claimLabel: '',
          detail: {
            ordererName: '',
            receiverPhone: '',
            receiverAddress: '대구',
            deliveryMemo: '',
            sellerProductCode: '',
          },
        },
      ],
      patches: [
        {
          productOrderId: 'PO-1',
          standardRows: [{ 상품주문번호: 'PO-1', 받는사람주소1: '부산' } as never],
          views: [
            {
              rowIndex: 0,
              status: 'PAYED',
              statusLabel: '결제완료',
              placeOrderStatus: 'OK',
              orderNo: 'O1',
              productOrderNo: 'PO-1',
              paidAt: '',
              orderedAt: '',
              productName: '',
              productOption: '',
              quantity: '1',
              receiverName: '',
              paymentAmount: '',
              paymentMeans: '',
              hasTracking: false,
              claimLabel: '',
              detail: {
                ordererName: '',
                receiverPhone: '',
                receiverAddress: '부산',
                deliveryMemo: '',
                sellerProductCode: '',
              },
            },
          ],
        },
      ],
    });

    expect(merged.rows).toHaveLength(2);
    expect(merged.rows.map((row) => row['상품주문번호'])).toEqual(['PO-2', 'PO-1']);
    expect(merged.views.find((view) => view.productOrderNo === 'PO-1')?.placeOrderStatus).toBe(
      'OK',
    );
  });
});
