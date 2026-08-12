import { describe, expect, it, vi } from 'vitest';

import {
  CAFE24_CONFIRM_BATCH_SIZE,
  buildCafe24PrepareRequestUnits,
  classifyCafe24ConfirmPreflight,
  interpretCafe24PrepareBatchResponse,
  parseCafe24ShopNo,
  runCafe24Confirm,
  validateCafe24ConfirmItems,
} from '@/app/lib/cafe24/cafe24-confirm';
import {
  collectSelectedCafe24ConfirmSelection,
  isCafe24ConfirmableRow,
} from '@/app/lib/cafe24/cafe24-fetch-panel-logic';
import { mergeCafe24ConfirmedOrdersIntoFetchResult } from '@/app/lib/cafe24/cafe24-confirm-merge';
import { mapCafe24OrdersToStandardRows, mapCafe24Status } from '@/app/lib/cafe24/map-cafe24-orders';
import { buildOrderFetchViewFromStandardRow } from '@/app/lib/order-integration/order-fetch-view';
import { isRowHubEligible } from '@/app/lib/order-integration/hub-eligibility';

describe('parseCafe24ShopNo', () => {
  it('defaults only for missing/empty and rejects invalid values', () => {
    expect(parseCafe24ShopNo(null)).toEqual({ ok: true, shopNo: 1, usedDefault: true });
    expect(parseCafe24ShopNo(2)).toEqual({ ok: true, shopNo: 2, usedDefault: false });
    expect(parseCafe24ShopNo(0).ok).toBe(false);
    expect(parseCafe24ShopNo(-1).ok).toBe(false);
    expect(parseCafe24ShopNo(1.5).ok).toBe(false);
    expect(parseCafe24ShopNo('abc').ok).toBe(false);
  });
});

describe('cafe24 confirm status rules', () => {
  it('uses explicit status sets and requires order_item_code', () => {
    expect(mapCafe24Status('N10').placeOrderStatus).toBe('NOT_YET');
    expect(
      classifyCafe24ConfirmPreflight({
        orderId: 'O1',
        orderItemCode: 'I1',
        orderStatus: 'N10',
      }),
    ).toBeNull();
    expect(
      classifyCafe24ConfirmPreflight({ orderId: 'O1', orderItemCode: 'I1', orderStatus: 'N20' })
        ?.status,
    ).toBe('ALREADY_CONFIRMED');
    expect(
      classifyCafe24ConfirmPreflight({ orderId: 'O1', orderItemCode: 'I1', orderStatus: 'N22' })
        ?.message,
    ).toContain('배송보류');
    expect(
      classifyCafe24ConfirmPreflight({ orderId: 'O1', orderItemCode: null, orderStatus: 'N10' })
        ?.status,
    ).toBe('FAILED');
    expect(
      classifyCafe24ConfirmPreflight({
        orderId: 'O1',
        orderItemCode: 'O1',
        orderStatus: 'N10',
      })?.status,
    ).toBe('FAILED');
  });
});

describe('request assembly — order_item_code array', () => {
  const credentials = { mallId: 'demo', clientId: 'id', clientSecret: 'secret' };

  it('groups 2 N10 items of same order into one request with array of 2', async () => {
    const putPrepare = vi.fn().mockResolvedValue({
      httpStatus: 200,
      bodyText: JSON.stringify({
        orders: [
          {
            shop_no: 1,
            order_id: '20260812-0000001',
            process_status: 'prepare',
            order_item_code: ['20260812-0000001-01', '20260812-0000001-02'],
          },
        ],
      }),
    });
    const result = await runCafe24Confirm({
      credentials,
      accessToken: 'token',
      items: [
        {
          orderId: '20260812-0000001',
          orderItemCode: '20260812-0000001-01',
          orderStatus: 'N10',
          shopNo: 1,
        },
        {
          orderId: '20260812-0000001',
          orderItemCode: '20260812-0000001-02',
          orderStatus: 'N10',
          shopNo: 1,
        },
      ],
      putPrepare,
    });
    expect(result.putCallCount).toBe(1);
    expect(result.confirmedCount).toBe(2);
    expect(putPrepare).toHaveBeenCalledTimes(1);
    const reqs = putPrepare.mock.calls[0]![0].requests;
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toEqual({
      order_id: '20260812-0000001',
      process_status: 'prepare',
      order_item_code: ['20260812-0000001-01', '20260812-0000001-02'],
    });
    expect(Array.isArray(reqs[0].order_item_code)).toBe(true);
    expect(JSON.stringify(reqs)).not.toContain('prepareproduct');
  });

  it('sends single item as length-1 array not a bare string', () => {
    const units = buildCafe24PrepareRequestUnits([
      { orderId: 'O1', orderItemCode: 'I1', orderStatus: 'N10', shopNo: 1 },
    ]);
    expect(units).toHaveLength(1);
    expect(units[0]?.request.order_item_code).toEqual(['I1']);
  });

  it('batches 100 distinct orders as 1 PUT and 101 as 2', async () => {
    const putPrepare = vi.fn().mockImplementation(async (input: { requests: unknown[] }) => ({
      httpStatus: 200,
      bodyText: JSON.stringify({
        orders: (input.requests as Array<{ order_id: string; order_item_code: string[] }>).map(
          (r) => ({
            shop_no: 1,
            order_id: r.order_id,
            process_status: 'prepare',
            order_item_code: r.order_item_code,
          }),
        ),
      }),
    }));

    const items100 = Array.from({ length: 100 }, (_, i) => ({
      orderId: `O-${i}`,
      orderItemCode: `I-${i}`,
      orderStatus: 'N10',
      shopNo: 1,
    }));
    const r100 = await runCafe24Confirm({
      credentials,
      accessToken: 'token',
      items: items100,
      putPrepare,
    });
    expect(CAFE24_CONFIRM_BATCH_SIZE).toBe(100);
    expect(r100.putCallCount).toBe(1);
    expect(putPrepare.mock.calls[0]![0].requests).toHaveLength(100);

    putPrepare.mockClear();
    const items101 = [
      ...items100,
      { orderId: 'O-100', orderItemCode: 'I-100', orderStatus: 'N10', shopNo: 1 },
    ];
    const r101 = await runCafe24Confirm({
      credentials,
      accessToken: 'token',
      items: items101,
      putPrepare,
    });
    expect(r101.putCallCount).toBe(2);
    expect(putPrepare.mock.calls[0]![0].requests).toHaveLength(100);
    expect(putPrepare.mock.calls[1]![0].requests).toHaveLength(1);
  });

  it('keeps same order/item across different shop_no as separate requests', async () => {
    const putPrepare = vi.fn().mockImplementation(async (input: { shopNo: number; requests: Array<{ order_id: string; order_item_code: string[] }> }) => ({
      httpStatus: 200,
      bodyText: JSON.stringify({
        orders: input.requests.map((r) => ({
          shop_no: input.shopNo,
          order_id: r.order_id,
          process_status: 'prepare',
          order_item_code: r.order_item_code,
        })),
      }),
    }));
    const validated = validateCafe24ConfirmItems([
      { orderId: 'O1', orderItemCode: 'I1', orderStatus: 'N10', shopNo: 1 },
      { orderId: 'O1', orderItemCode: 'I1', orderStatus: 'N10', shopNo: 2 },
    ]);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.items).toHaveLength(2);

    const result = await runCafe24Confirm({
      credentials,
      accessToken: 'token',
      items: validated.items,
      putPrepare,
    });
    expect(result.putCallCount).toBe(2);
    expect(result.confirmedCount).toBe(2);
    const shopNos = putPrepare.mock.calls.map((c) => c[0].shopNo).sort();
    expect(shopNos).toEqual([1, 2]);
  });
});

describe('official orders response parsing', () => {
  it('confirms only items returned in orders array', () => {
    const batch = [
      { orderId: 'O1', orderItemCode: 'I1', orderStatus: 'N10', shopNo: 1 },
      { orderId: 'O1', orderItemCode: 'I2', orderStatus: 'N10', shopNo: 1 },
    ];
    const outcomes = interpretCafe24PrepareBatchResponse({
      httpStatus: 200,
      bodyText: JSON.stringify({
        orders: [
          {
            shop_no: 1,
            order_id: 'O1',
            process_status: 'prepare',
            order_item_code: ['I1'],
          },
        ],
      }),
      shopNo: 1,
      batch,
    });
    expect(outcomes.find((o) => o.key.endsWith('|I1'))?.status).toBe('CONFIRMED');
    expect(outcomes.find((o) => o.key.endsWith('|I2'))?.status).toBe('FAILED');
  });

  it('fails safely when 2xx has no orders array', () => {
    const outcomes = interpretCafe24PrepareBatchResponse({
      httpStatus: 200,
      bodyText: JSON.stringify({}),
      shopNo: 1,
      batch: [{ orderId: 'O1', orderItemCode: 'I1', orderStatus: 'N10', shopNo: 1 }],
    });
    expect(outcomes[0]?.status).toBe('FAILED');
    expect(outcomes[0]?.message).toContain('orders');
  });

  it('fails batch on HTTP 400 error object', () => {
    const outcomes = interpretCafe24PrepareBatchResponse({
      httpStatus: 400,
      bodyText: JSON.stringify({ error: { code: '422', message: 'Invalid order status' } }),
      shopNo: 1,
      batch: [
        { orderId: 'O1', orderItemCode: 'I1', orderStatus: 'N10', shopNo: 1 },
        { orderId: 'O2', orderItemCode: 'I2', orderStatus: 'N10', shopNo: 1 },
      ],
    });
    expect(outcomes.every((o) => o.status === 'FAILED')).toBe(true);
    expect(outcomes[0]?.message).toContain('Invalid order status');
  });
});

describe('end-to-end mapping → confirm payload', () => {
  it('keeps shop_no, order_id, item codes and skips non-N10 sibling', async () => {
    const rows = mapCafe24OrdersToStandardRows([
      {
        shop_no: 2,
        order_id: '20260813-000099',
        order_status: 'N10',
        items: [
          { order_item_code: '20260813-000099-01', product_name: '상품A', quantity: 1 },
          {
            order_item_code: '20260813-000099-02',
            product_name: '상품B',
            quantity: 1,
            order_status: 'N20',
          },
        ],
      },
    ]);
    const putPrepare = vi.fn().mockResolvedValue({
      httpStatus: 200,
      bodyText: JSON.stringify({
        orders: [
          {
            shop_no: 2,
            order_id: '20260813-000099',
            process_status: 'prepare',
            order_item_code: ['20260813-000099-01'],
          },
        ],
      }),
    });
    const result = await runCafe24Confirm({
      credentials: { mallId: 'demo', clientId: 'id', clientSecret: 'secret' },
      accessToken: 'token',
      items: [
        {
          orderId: rows[0]!['주문번호'],
          orderItemCode: rows[0]!['상품주문번호'],
          orderStatus: rows[0]!['출고타입'],
          shopNo: Number(rows[0]!['센터코드']),
        },
        {
          orderId: rows[1]!['주문번호'],
          orderItemCode: rows[1]!['상품주문번호'],
          orderStatus: rows[1]!['출고타입'],
          shopNo: Number(rows[1]!['센터코드']),
        },
      ],
      putPrepare,
    });
    expect(result.confirmedCount).toBe(1);
    expect(result.alreadyConfirmedCount).toBe(1);
    expect(putPrepare.mock.calls[0]![0].shopNo).toBe(2);
    expect(putPrepare.mock.calls[0]![0].requests[0].order_item_code).toEqual([
      '20260813-000099-01',
    ]);
  });
});

describe('cafe24 mapping + hub gate + panel', () => {
  it('preserves codes and gates hub for N10', () => {
    const rows = mapCafe24OrdersToStandardRows([
      {
        shop_no: 3,
        order_id: '20260101-0001',
        order_status: 'N10',
        items: [{ order_item_code: 'ITEM-9', product_name: '상품' }],
      },
    ]);
    const view = buildOrderFetchViewFromStandardRow(rows[0]!, 0);
    expect(view.mallOrderStatusCode).toBe('N10');
    expect(isRowHubEligible({ mallId: 'cafe24', hubEligible: view.hubEligible })).toBe(false);
    const merged = mergeCafe24ConfirmedOrdersIntoFetchResult({
      rows,
      views: [view],
      results: [{ productOrderNo: 'ITEM-9', orderId: '20260101-0001', status: 'CONFIRMED' }],
    });
    expect(merged.views[0]?.hubEligible).toBe(true);
  });

  it('collects N10 rows only', () => {
    const selection = collectSelectedCafe24ConfirmSelection(
      [
        {
          mallId: 'cafe24',
          accountId: 'acct',
          rowIndex: 0,
          orderNo: 'O1',
          productOrderNo: 'I1',
          mallOrderStatusCode: 'N10',
          placeOrderStatus: 'NOT_YET',
          shopNo: 1,
        },
        {
          mallId: 'cafe24',
          accountId: 'acct',
          rowIndex: 1,
          orderNo: 'O2',
          productOrderNo: 'I2',
          mallOrderStatusCode: 'N20',
          placeOrderStatus: 'OK',
          shopNo: 1,
        },
      ],
      new Set(['cafe24:acct:0', 'cafe24:acct:1']),
      (mallId, accountId, rowIndex) => `${mallId}:${accountId}:${rowIndex}`,
    );
    expect(selection.ok).toBe(true);
    if (!selection.ok) return;
    expect(selection.items).toHaveLength(1);
    expect(isCafe24ConfirmableRow({ mallId: 'cafe24', mallOrderStatusCode: 'N10' })).toBe(true);
  });
});
