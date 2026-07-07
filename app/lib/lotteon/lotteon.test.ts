import { describe, expect, it } from 'vitest';
import {
  assertIntegrationProxyUrlAllowed,
  isIntegrationProxyHostAllowed,
} from '@/app/lib/integration-proxy/allowed-domains';
import {
  extractLotteonOrderList,
  parseLotteonApiResponse,
} from '@/app/lib/lotteon/client';
import { mapLotteonOrdersToPreviewRows } from '@/app/lib/lotteon/map-lotteon-orders';

describe('integration proxy — lotteon host', () => {
  it('allows openapi.lotteon.com over https', () => {
    expect(isIntegrationProxyHostAllowed('openapi.lotteon.com')).toBe(true);
    expect(() =>
      assertIntegrationProxyUrlAllowed(
        'https://openapi.lotteon.com/v1/openapi/delivery/v1/SellerDeliveryOrderSearch?Key=test',
      ),
    ).not.toThrow();
  });
});

describe('parseLotteonApiResponse', () => {
  it('detects returnCode errors', () => {
    expect(() =>
      parseLotteonApiResponse(JSON.stringify({ returnCode: '1004', message: '일 호출 회수 제한' })),
    ).not.toThrow();

    const envelope = parseLotteonApiResponse(
      JSON.stringify({ returnCode: '1004', message: '일 호출 회수 제한' }),
    );
    expect(envelope.returnCode).toBe('1004');
  });
});

describe('extractLotteonOrderList', () => {
  it('parses deliveryOrderList payload', () => {
    const payload = {
      returnCode: '0000',
      data: {
        deliveryOrderList: [
          {
            odNo: '20260708001',
            odSeq: '1',
            odPrgsStepCd: '11',
            odPrgsStepNm: '출고지시',
            pdNm: '테스트상품',
            odQty: '2',
            rcvrNm: '홍길동',
            rcvrMbNo: '01012345678',
            rcvrZipAddr: '서울시 강남구',
            rcvrDtlAddr: '101호',
            odMsg: '문 앞',
            odCmptDttm: '20260708103000',
          },
        ],
      },
    };

    const orders = extractLotteonOrderList(payload);
    expect(orders).toHaveLength(1);
    expect(orders[0]?.odNo).toBe('20260708001');
    expect(orders[0]?.pdNm).toBe('테스트상품');
  });

  it('returns empty array when list is missing', () => {
    expect(extractLotteonOrderList({ returnCode: '0000', data: {} })).toEqual([]);
  });
});

describe('mapLotteonOrdersToPreviewRows', () => {
  it('maps to preview table rows', () => {
    const rows = mapLotteonOrdersToPreviewRows([
      {
        odNo: '1',
        odSeq: '2',
        odPrgsStepCd: '12',
        odPrgsStepNm: '상품준비',
        pdNm: '샘플',
        odQty: '1',
        odCmptDttm: '20260708103000',
        odAcptDttm: '',
        rcvrNm: 'Kim',
        rcvrPhone: '01011112222',
        rcvrZipNo: '12345',
        rcvrBaseAddr: '서울',
        rcvrDtlAddr: '1층',
        dlvMsg: '빠른 배송',
        odAmt: '10000',
        raw: {},
      },
    ]);

    expect(rows[0]?.['주문번호']).toBe('1');
    expect(rows[0]?.['상품주문번호']).toBe('1-2');
    expect(rows[0]?.['주문상태']).toBe('상품준비');
  });
});
