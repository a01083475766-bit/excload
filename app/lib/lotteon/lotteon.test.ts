import { describe, expect, it } from 'vitest';
import {
  assertIntegrationProxyUrlAllowed,
  isIntegrationProxyHostAllowed,
} from '@/app/lib/integration-proxy/allowed-domains';
import {
  buildLotteonDateWindows,
  buildLotteonRequestHeaders,
  buildLotteonSearchBody,
  extractLotteonIdentityData,
  extractLotteonOrderList,
  formatLotteonApiDateTime,
  interpretLotteonHttpResponse,
  LOTTEON_IDENTITY_PATH,
  LOTTEON_SELLER_DELIVERY_ORDER_SEARCH_PATH,
  parseLotteonApiResponse,
} from '@/app/lib/lotteon/client';
import { mapLotteonOrdersToPreviewRows } from '@/app/lib/lotteon/map-lotteon-orders';
import { getAllowedHostnames } from '../../../services/coupang-proxy/allowed-hosts.mjs';

describe('integration proxy — lotteon host', () => {
  it('allows openapi.lotteon.com over https', () => {
    expect(isIntegrationProxyHostAllowed('openapi.lotteon.com')).toBe(true);
    expect(() =>
      assertIntegrationProxyUrlAllowed(
        `https://openapi.lotteon.com${LOTTEON_IDENTITY_PATH}`,
      ),
    ).not.toThrow();
    expect(() =>
      assertIntegrationProxyUrlAllowed(
        `https://openapi.lotteon.com${LOTTEON_SELLER_DELIVERY_ORDER_SEARCH_PATH}`,
      ),
    ).not.toThrow();
  });

  it('lists openapi.lotteon.com in Lightsail allowed-hosts', () => {
    expect(getAllowedHostnames()).toContain('openapi.lotteon.com');
  });
});

describe('buildLotteonRequestHeaders', () => {
  it('uses Bearer Authorization and common Accept headers', () => {
    expect(buildLotteonRequestHeaders('secret-key')).toEqual({
      Authorization: 'Bearer secret-key',
      Accept: 'application/json',
      'Accept-Language': 'ko',
      'X-Timezone': 'GMT+09:00',
    });
  });
});

describe('lotteon search datetime', () => {
  it('formats yyyymmddhhmmss with start/end bounds', () => {
    const kstMidnight = new Date('2026-07-14T15:00:00.000Z');
    expect(formatLotteonApiDateTime(kstMidnight, 'start')).toBe('20260715000000');
    expect(formatLotteonApiDateTime(kstMidnight, 'end')).toBe('20260715235959');
    expect(formatLotteonApiDateTime(kstMidnight, 'exact')).toBe('20260715000000');
  });

  it('splits a 30-day range into one window per KST calendar day', () => {
    const end = new Date('2026-08-12T12:00:00.000Z');
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const windows = buildLotteonDateWindows(start, end);
    expect(windows.length).toBeGreaterThanOrEqual(30);
    expect(windows.length).toBeLessThanOrEqual(31);
    expect(formatLotteonApiDateTime(windows[0]!.start, 'start')).toHaveLength(14);
    expect(formatLotteonApiDateTime(windows[0]!.end, 'end')).toMatch(/235959$/);
  });

  it('builds official search body without tr_no and with 14-digit datetimes', () => {
    const body = buildLotteonSearchBody({
      credentials: { apiKey: 'k', trNo: 'LO10178207', shopId: 'LO999' },
      start: new Date('2026-07-14T15:00:00.000Z'),
      end: new Date('2026-07-14T15:00:00.000Z'),
      odPrgsStepCd: '11',
    });
    expect(body).toEqual({
      srchStrtDt: '20260715000000',
      srchEndDt: '20260715235959',
      odPrgsStepCd: '11',
      lrtrNo: 'LO999',
    });
    expect(body).not.toHaveProperty('tr_no');
  });
});

describe('interpretLotteonHttpResponse', () => {
  it('maps 401 to auth key error before parsing', () => {
    expect(() =>
      interpretLotteonHttpResponse({ httpStatus: 401, bodyText: 'unauthorized', contentType: 'text/plain' }),
    ).toThrow(/인증키 오류/);
  });

  it('maps 403 to IP mismatch message before parsing', () => {
    expect(() =>
      interpretLotteonHttpResponse({ httpStatus: 403, bodyText: 'forbidden', contentType: 'text/plain' }),
    ).toThrow(/고정 IP\(54\.180\.45\.46\)/);
  });

  it('detects proxy domain rejection', () => {
    expect(() =>
      interpretLotteonHttpResponse({
        httpStatus: 502,
        bodyText: 'domain not allowed',
        contentType: 'text/plain',
      }),
    ).toThrow(/프록시에서 롯데ON 도메인/);
  });

  it('detects empty body', () => {
    expect(() => interpretLotteonHttpResponse({ httpStatus: 200, bodyText: '  ' })).toThrow(/비어 있습니다/);
  });

  it('detects HTML body', () => {
    expect(() =>
      interpretLotteonHttpResponse({
        httpStatus: 404,
        bodyText: '<html><body>Not Found</body></html>',
        contentType: 'text/html',
      }),
    ).toThrow(/HTML을 반환/);
  });

  it('detects non-json body', () => {
    expect(() =>
      interpretLotteonHttpResponse({
        httpStatus: 200,
        bodyText: 'not-json',
        contentType: 'application/json',
      }),
    ).toThrow(/JSON 형식이 아닙니다/);
  });

  it('parses successful identity payload', () => {
    const envelope = interpretLotteonHttpResponse({
      httpStatus: 200,
      bodyText: JSON.stringify({
        returnCode: '0000',
        data: { trNo: 'LO10178207', trNm: '테스트' },
      }),
      contentType: 'application/json',
    });
    expect(extractLotteonIdentityData(envelope)?.trNo).toBe('LO10178207');
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

  it('parses official deliveryOrderList field names', () => {
    const orders = extractLotteonOrderList({
      returnCode: '0000',
      data: {
        deliveryOrderList: [
          {
            odNo: 'od001',
            odSeq: 1,
            odPrgsStepCd: '11',
            spdNm: '공식상품명',
            odQty: 2,
            dvpCustNm: '홍길동',
            dvpMphnNo: '01012345678',
            dvpStnmZipAddr: '서울시 강남구',
            dvpStnmDtlAddr: '101호',
            dvMsg: '문 앞',
            odCmptDttm: '20260708103000',
          },
        ],
      },
    });
    expect(orders).toHaveLength(1);
    expect(orders[0]?.pdNm).toBe('공식상품명');
    expect(orders[0]?.rcvrNm).toBe('홍길동');
    expect(orders[0]?.rcvrPhone).toBe('01012345678');
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
