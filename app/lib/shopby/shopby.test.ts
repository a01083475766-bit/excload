import { describe, expect, it } from 'vitest';
import { getAllPlannedProxyDomains } from '@/app/lib/order-integration/mall-integration-specs';
import {
  mapRawShopbyOrders,
  parseShopbyApiResponse,
  resolveShopbyOrderRequestTypes,
} from '@/app/lib/shopby/client';
import { SHOPBY_DEFAULT_ORDER_REQUEST_TYPES } from '@/app/lib/shopby/api-spec';
import { mapShopbyOrdersToPreviewRows } from '@/app/lib/shopby/map-shopby-orders';

describe('shopby proxy registry', () => {
  it('tracks server-api.e-ncp.com as planned before Lightsail 1-shot deploy', () => {
    const planned = getAllPlannedProxyDomains();
    expect(planned.some((d) => d.hostname === 'server-api.e-ncp.com')).toBe(true);
  });
});

describe('resolveShopbyOrderRequestTypes', () => {
  it('defaults to fetchable order statuses when empty', () => {
    expect(resolveShopbyOrderRequestTypes()).toEqual([...SHOPBY_DEFAULT_ORDER_REQUEST_TYPES]);
  });

  it('normalizes custom status codes', () => {
    expect(resolveShopbyOrderRequestTypes(['pay_done', 'PAY_DONE', 'delivery_ing'])).toEqual([
      'PAY_DONE',
      'DELIVERY_ING',
    ]);
  });
});

describe('parseShopbyApiResponse', () => {
  it('parses v1.1 paging envelope', () => {
    const envelope = parseShopbyApiResponse(
      JSON.stringify({ totalCount: 0, contents: [] }),
    );
    expect(envelope.totalCount).toBe(0);
  });
});

describe('mapRawShopbyOrders', () => {
  it('flattens deliveryGroups orderProducts', () => {
    const rows = mapRawShopbyOrders([
      {
        orderNo: '20260708001',
        orderYmdt: '2026-07-01 10:00:00',
        firstPayYmdt: '2026-07-01 10:01:00',
        deliveryGroups: [
          {
            receiverName: '홍길동',
            receiverContact1: '010-1234-5678',
            receiverZipCd: '12345',
            receiverAddress: '서울시 강남구',
            receiverDetailAddress: '101호',
            deliveryMemo: '문 앞',
            orderProducts: [
              {
                orderOptionNo: 100,
                productName: '테스트상품',
                orderCnt: 2,
                orderStatusType: 'PAY_DONE',
                salePrice: 15000,
              },
            ],
          },
        ],
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.orderNo).toBe('20260708001');
    expect(rows[0]?.productName).toBe('테스트상품');
    expect(rows[0]?.receiverName).toBe('홍길동');
  });
});

describe('mapShopbyOrdersToPreviewRows', () => {
  it('maps normalized orders to preview rows', () => {
    const rows = mapShopbyOrdersToPreviewRows([
      {
        orderNo: '1',
        orderOptionNo: '2',
        orderStatusType: 'PRODUCT_PREPARE',
        productName: '샘플',
        orderCnt: '1',
        orderYmdt: '2026-07-01 10:00:00',
        payYmdt: '2026-07-01 10:01:00',
        receiverName: 'Kim',
        receiverPhone: '01011112222',
        receiverZip: '12345',
        receiverAddr1: '서울',
        receiverAddr2: '1층',
        deliveryMemo: '빠른 배송',
        payAmt: '10000',
        raw: {},
      },
    ]);

    expect(rows[0]?.['주문번호']).toBe('1');
    expect(rows[0]?.['주문상태']).toBe('PRODUCT_PREPARE');
    expect(rows[0]?.['상품명']).toBe('샘플');
  });
});
