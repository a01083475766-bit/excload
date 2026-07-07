import { describe, expect, it } from 'vitest';
import { getAllPlannedProxyDomains } from '@/app/lib/order-integration/mall-integration-specs';
import {
  CJONSTYLE_DEFAULT_DELIVERY_METHOD_CODES,
  extractCjonstyleOrderList,
  mapRawCjonstyleOrders,
  parseCjonstyleApiResponse,
  resolveCjonstyleDeliveryMethodCodes,
} from '@/app/lib/cjonstyle/client';
import { mapCjonstyleOrdersToPreviewRows } from '@/app/lib/cjonstyle/map-cjonstyle-orders';

describe('cjonstyle proxy registry', () => {
  it('tracks api.cjonstyle.com as planned before Lightsail 1-shot deploy', () => {
    const planned = getAllPlannedProxyDomains();
    expect(planned.some((d) => d.hostname === 'api.cjonstyle.com')).toBe(true);
  });
});

describe('resolveCjonstyleDeliveryMethodCodes', () => {
  it('defaults to 20,30,35,40 when empty', () => {
    expect(resolveCjonstyleDeliveryMethodCodes()).toEqual([...CJONSTYLE_DEFAULT_DELIVERY_METHOD_CODES]);
  });

  it('dedupes custom codes', () => {
    expect(resolveCjonstyleDeliveryMethodCodes(['20', '20', '35'])).toEqual(['20', '35']);
  });
});

describe('parseCjonstyleApiResponse', () => {
  it('parses result envelope', () => {
    const envelope = parseCjonstyleApiResponse(JSON.stringify({ resultCode: '00', resultMessage: 'SUCCESS' }));
    expect(envelope.resultCode).toBe('00');
  });
});

describe('extractCjonstyleOrderList', () => {
  it('unwraps orderList payload', () => {
    const payload = {
      resultCode: '00',
      orderList: [
        {
          order: {
            ordNo: '20260708001',
            ordItemSeq: '1',
            itemNm: '테스트상품',
            ordQty: '2',
            rcvrNm: '홍길동',
            rcvrPhone: '01012345678',
            rcvrAddr1: '서울시 강남구',
            rcvrAddr2: '101호',
            dlvMsg: '문 앞',
            ordDate: '20260708103000',
          },
        },
      ],
    };

    const rows = extractCjonstyleOrderList(payload);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ordNo).toBe('20260708001');
  });
});

describe('mapCjonstyleOrdersToPreviewRows', () => {
  it('maps normalized orders to preview rows', () => {
    const orders = mapRawCjonstyleOrders(
      [
        {
          ordNo: '1',
          ordItemSeq: '2',
          itemNm: '샘플',
          ordQty: '1',
          ordDate: '20260708103000',
          rcvrNm: 'Kim',
          rcvrPhone: '01011112222',
          rcvrZip: '12345',
          rcvrAddr1: '서울',
          rcvrAddr2: '1층',
          dlvMsg: '빠른 배송',
          payAmt: '10000',
          ordStatNm: '출고대기',
        },
      ],
      '20',
    );

    const rows = mapCjonstyleOrdersToPreviewRows(orders);
    expect(rows[0]?.['주문번호']).toBe('1');
    expect(rows[0]?.['배송타입']).toBe('20');
    expect(rows[0]?.['주문상태']).toBe('출고대기');
  });
});
