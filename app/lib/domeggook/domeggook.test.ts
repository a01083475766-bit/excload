import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertIntegrationProxyUrlAllowed,
  isIntegrationProxyHostAllowed,
} from '@/app/lib/integration-proxy/allowed-domains';
import {
  extractDomeggookOrderRecords,
  extractDomeggookSessionId,
  isDomeggookSuccessCode,
  parseDomeggookEnvelope,
  redactDomeggookSecrets,
  resolveDomeggookOutboundIp,
  testDomeggookConnection,
  toUserFacingDomeggookErrorMessage,
} from '@/app/lib/domeggook/client';
import { mapDomeggookOrdersToPreviewRows } from '@/app/lib/domeggook/map-domeggook-orders';

const credentials = {
  memberId: 'seller-demo',
  password: 'pw-secret-value',
  apiKey: 'aid-secret-value',
};

describe('integration proxy — domeggook host', () => {
  it('allows domeggook.com over https', () => {
    expect(isIntegrationProxyHostAllowed('domeggook.com')).toBe(true);
    expect(() =>
      assertIntegrationProxyUrlAllowed('https://domeggook.com/ssl/api/?mode=getOrderList'),
    ).not.toThrow();
  });
});

describe('resolveDomeggookOutboundIp', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP and does not invent an IP', () => {
    vi.stubEnv('NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP', '54.180.45.46');
    expect(resolveDomeggookOutboundIp()).toBe('54.180.45.46');
  });

  it('fails clearly when outbound IP env is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP', '');
    expect(() => resolveDomeggookOutboundIp()).toThrow(/NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP/);
  });
});

describe('domeggook response parsing', () => {
  it('treats common success codes as ok', () => {
    expect(isDomeggookSuccessCode('0')).toBe(true);
    expect(isDomeggookSuccessCode('00')).toBe(true);
    expect(isDomeggookSuccessCode('200')).toBe(true);
    expect(isDomeggookSuccessCode('E401')).toBe(false);
  });

  it('extracts sId without requiring a fixed envelope shape', () => {
    const envelope = parseDomeggookEnvelope(
      JSON.stringify({
        domeggook: {
          header: { code: '0', message: 'ok' },
          login: { sId: 'SESSION-XYZ', cId: 'CART-ABC' },
        },
      }),
    );
    expect(envelope.code).toBe('0');
    expect(extractDomeggookSessionId(envelope.root)).toBe('SESSION-XYZ');
  });

  it('extracts sell order list and maps preview rows', () => {
    const orders = extractDomeggookOrderRecords({
      header: { code: '0', message: 'ok', numberOfItems: 1 },
      items: [
        {
          orderNo: 'DG-100',
          itemTitle: '테스트상품',
          orderQty: 2,
          status: '결제완료',
          date: '2026-08-01',
          consumer: { deliReq: '문 앞' },
        },
      ],
    });
    expect(orders).toHaveLength(1);
    expect(orders[0]?.receiverName).toBe('');
    expect(orders[0]?.receiverPhone).toBe('');
    expect(orders[0]?.receiverAddress).toBe('');
    const rows = mapDomeggookOrdersToPreviewRows(orders);
    expect(rows[0]?.['주문번호']).toBe('DG-100');
    expect(rows[0]?.['상품명']).toBe('테스트상품');
    expect(rows[0]?.['받는사람']).toBe('');
    expect(rows[0]?.['수량']).toBe('2');
  });

  it('treats single-item items object as one order (not inventing address)', () => {
    const orders = extractDomeggookOrderRecords({
      header: { code: '0', numberOfItems: 1 },
      items: {
        orderNo: 2001,
        orderUid: 'uid-2001',
        itemTitle: '단건상품',
        orderQty: 1,
        status: '배송준비중',
        date: '20260802',
      },
    });
    expect(orders).toHaveLength(1);
    expect(orders[0]?.orderNo).toBe('2001');
    expect(orders[0]?.productName).toBe('단건상품');
    expect(orders[0]?.receiverName).toBe('');
    expect(orders[0]?.receiverAddress).toBe('');
  });

  it('parses multi-item items array', () => {
    const orders = extractDomeggookOrderRecords({
      header: { code: '0', numberOfItems: 2 },
      items: [
        { orderNo: 'A-1', itemTitle: '상품A', orderQty: 1, status: '결제완료' },
        { orderNo: 'A-2', itemTitle: '상품B', orderQty: 3, status: '배송중' },
      ],
    });
    expect(orders.map((o) => o.orderNo)).toEqual(['A-1', 'A-2']);
  });

  it('returns empty list for success with no orders', () => {
    expect(
      extractDomeggookOrderRecords({
        header: { code: '0', message: 'ok', numberOfItems: 0 },
        items: [],
      }),
    ).toEqual([]);
  });

  it('does not invent quantity when orderQty is missing', () => {
    const orders = extractDomeggookOrderRecords({
      header: { code: '0' },
      items: { orderNo: 'Q-1', itemTitle: '수량없음', status: '결제완료' },
    });
    expect(orders[0]?.quantity).toBe('');
  });
});

describe('redactDomeggookSecrets', () => {
  it('redacts password, api key, and sId/cId fragments', () => {
    const text = redactDomeggookSecrets(
      'login fail pw=pw-secret-value aid=aid-secret-value sId=SESSION-XYZ cId=CART-ABC',
      ['pw-secret-value', 'aid-secret-value', 'SESSION-XYZ'],
    );
    expect(text).not.toContain('pw-secret-value');
    expect(text).not.toContain('aid-secret-value');
    expect(text).not.toContain('SESSION-XYZ');
    expect(text).not.toContain('CART-ABC');
    expect(text).toContain('[보호됨]');
  });
});

describe('toUserFacingDomeggookErrorMessage', () => {
  it('distinguishes api key, permission, login, and rate limit', () => {
    expect(toUserFacingDomeggookErrorMessage({ httpStatus: 401 })).toMatch(/API Key/);
    expect(toUserFacingDomeggookErrorMessage({ httpStatus: 403, message: '권한 없음' })).toMatch(/권한/);
    expect(toUserFacingDomeggookErrorMessage({ message: '로그인 실패' })).toMatch(/로그인/);
    expect(toUserFacingDomeggookErrorMessage({ httpStatus: 429 })).toMatch(/호출 제한/);
  });
});

describe('testDomeggookConnection', () => {
  it('requires setLogin then getOrderList and treats empty list as success', async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({
          header: { code: '0', message: 'ok' },
          login: { sId: 'SESSION-ONLY-IN-MEMORY', cId: 'CID-SECRET' },
        }),
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({
          header: { code: '0', message: 'ok', numberOfItems: 0 },
          items: [],
        }),
      });

    const result = await testDomeggookConnection({
      credentials,
      outboundIp: '54.180.45.46',
      http,
    });

    expect(result).toEqual({ ok: true, orderCount: 0 });
    expect(http).toHaveBeenCalledTimes(2);

    const loginCall = http.mock.calls[0]![0];
    expect(loginCall.method).toBe('POST');
    expect(loginCall.url).toContain('domeggook.com/ssl/api');
    expect(String(loginCall.body)).toContain('mode=setLogin');
    expect(String(loginCall.body)).toContain('ip=54.180.45.46');
    expect(String(loginCall.body)).toContain('userAgent=EXCLOAD');
    expect(String(loginCall.body)).not.toContain('setOrdChk');
    expect(String(loginCall.body)).not.toContain('setOrdOkDeli');

    const orderCall = http.mock.calls[1]![0];
    expect(orderCall.method).toBe('GET');
    expect(String(orderCall.url)).toContain('mode=getOrderList');
    expect(String(orderCall.url)).toContain('for=sell');
    expect(String(orderCall.url)).toContain('sId=SESSION-ONLY-IN-MEMORY');

    // 반환값에 세션 원문 없음
    expect(JSON.stringify(result)).not.toContain('SESSION-ONLY-IN-MEMORY');
    expect(JSON.stringify(result)).not.toContain('CID-SECRET');
  });

  it('maps HTTP 200 body error code to failure', async () => {
    const http = vi.fn().mockResolvedValue({
      httpStatus: 200,
      bodyText: JSON.stringify({
        header: { code: 'E401', message: 'API Key invalid aid=aid-secret-value' },
      }),
    });

    await expect(
      testDomeggookConnection({
        credentials,
        outboundIp: '54.180.45.46',
        http,
      }),
    ).rejects.toThrow(/API Key/);

    const thrown = await testDomeggookConnection({
      credentials,
      outboundIp: '54.180.45.46',
      http,
    }).catch((error: unknown) => error);
    expect(String(thrown)).not.toContain('aid-secret-value');
  });

  it('never calls mutation modes', async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({ header: { code: '0' }, login: { sId: 'S1' } }),
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({ header: { code: '0' }, list: [] }),
      });

    await testDomeggookConnection({
      credentials,
      outboundIp: '54.180.45.46',
      http,
    });

    const payloads = http.mock.calls.map((call) => `${call[0].url}\n${call[0].body ?? ''}`);
    for (const payload of payloads) {
      expect(payload).not.toMatch(/setOrdChk|setOrdOkDeli|setOrdDeny/);
    }
  });
});
