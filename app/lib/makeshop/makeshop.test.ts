import { describe, expect, it, vi, afterEach } from 'vitest';
import { getAllPlannedProxyDomains } from '@/app/lib/order-integration/mall-integration-specs';
import {
  EXCLOAD_MAKESHOP_OUTBOUND_IP,
  MAKESHOP_DEFAULT_FETCH_DAYS,
} from '@/app/lib/makeshop/api-spec';
import {
  clearMakeshopTokenCacheForTests,
  flattenMakeshopOrderRows,
  formatMakeshopApiDate,
  mapMakeshopApiError,
  mapMakeshopOAuthError,
  parseMakeshopApiResponse,
  validateMakeshopApiEnvelope,
} from '@/app/lib/makeshop/client';
import {
  isMakeshopOAuthConfigured,
  resolveMakeshopClientId,
  resolveMakeshopClientSecret,
} from '@/app/lib/makeshop/oauth-credentials';
import { mapMakeshopOrdersToPreviewRows } from '@/app/lib/makeshop/map-makeshop-orders';

describe('makeshop proxy registry', () => {
  it('tracks connect.makeshop.co.kr as planned before Lightsail 1-shot deploy', () => {
    const planned = getAllPlannedProxyDomains();
    expect(planned.some((d) => d.hostname === 'connect.makeshop.co.kr')).toBe(true);
  });
});

describe('resolveMakeshop OAuth credentials', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers override over env for client id', () => {
    vi.stubEnv('MAKESHOP_CLIENT_ID', 'env-client-id');
    expect(resolveMakeshopClientId('override-id')).toBe('override-id');
  });

  it('reads client secret from env', () => {
    vi.stubEnv('MAKESHOP_CLIENT_SECRET', 'env-secret');
    expect(resolveMakeshopClientSecret()).toBe('env-secret');
  });

  it('detects oauth env configuration', () => {
    vi.stubEnv('MAKESHOP_CLIENT_ID', 'id');
    vi.stubEnv('MAKESHOP_CLIENT_SECRET', 'secret');
    expect(isMakeshopOAuthConfigured()).toBe(true);
  });
});

describe('parseMakeshopApiResponse', () => {
  it('parses success envelope', () => {
    const envelope = parseMakeshopApiResponse(
      JSON.stringify({ success: true, code: 'OK', data: { list: [] } }),
    );
    expect(envelope.code).toBe('OK');
  });
});

describe('mapMakeshopOAuthError', () => {
  it('maps invalid_client', () => {
    expect(mapMakeshopOAuthError('invalid_client')).toContain('Client ID/Client Secret');
  });

  it('maps IP whitelist guidance via api error', () => {
    expect(
      mapMakeshopApiError({
        httpStatus: 403,
        envelope: { success: false, code: 'ERROR', message: '허가된 IP가 아닙니다 9009' },
      }),
    ).toContain(EXCLOAD_MAKESHOP_OUTBOUND_IP);
  });
});

describe('validateMakeshopApiEnvelope', () => {
  afterEach(() => {
    clearMakeshopTokenCacheForTests();
  });

  it('passes for OK code', () => {
    expect(() => validateMakeshopApiEnvelope({ success: true, code: 'OK' }, 200)).not.toThrow();
  });

  it('throws oauth error envelope', () => {
    expect(() =>
      validateMakeshopApiEnvelope({ error: 'invalid_client', error_description: 'bad creds' }, 401),
    ).toThrow(/Client ID/);
  });
});

describe('flattenMakeshopOrderRows', () => {
  it('flattens order with products and delivery join', () => {
    const deliveryMap = new Map<string, Record<string, unknown>>([
      [
        'ORD-1',
        {
          receiver_name: '홍길동',
          receiver_mobile: '010-1234-5678',
          receiver_address: '서울시 강남구',
        },
      ],
    ]);

    const rows = flattenMakeshopOrderRows(
      [
        {
          order_no: 'ORD-1',
          order_date: '2026-07-08 10:00:00',
          products: [
            {
              basket_no: '10',
              product_name: '테스트상품',
              quantity: '2',
              basket_status: 'D11',
              product_price: '20000',
            },
          ],
        },
      ],
      deliveryMap,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.orderNo).toBe('ORD-1');
    expect(rows[0]?.receiverName).toBe('홍길동');
    expect(rows[0]?.productName).toBe('테스트상품');
  });
});

describe('formatMakeshopApiDate', () => {
  it('formats date as YYYY-MM-DD', () => {
    const formatted = formatMakeshopApiDate(new Date('2026-07-08T00:00:00.000Z'));
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('mapMakeshopOrdersToPreviewRows', () => {
  it('maps normalized orders to preview rows', () => {
    const rows = mapMakeshopOrdersToPreviewRows([
      {
        orderNo: '1',
        orderItemNo: '2',
        orderStatus: 'D11',
        productName: '샘플',
        orderQty: '1',
        orderDate: '2026-07-01 10:00:00',
        paymentDt: '2026-07-01 10:01:00',
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
    expect(rows[0]?.['주문상태']).toBe('D11');
  });
});

describe('fetch defaults', () => {
  it('uses 7-day default fetch window constant', () => {
    expect(MAKESHOP_DEFAULT_FETCH_DAYS).toBe(7);
  });
});
