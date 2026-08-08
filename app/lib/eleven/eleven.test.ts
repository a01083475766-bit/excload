import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  assertIntegrationProxyUrlAllowed,
  isIntegrationProxyHostAllowed,
} from '@/app/lib/integration-proxy/allowed-domains';
import {
  decodeResponseBody,
  detectCharsetFromContentType,
  detectCharsetFromXmlDeclaration,
} from '@/app/lib/integration-proxy/decode-response-body';
import {
  ORDER_STATUS_ENDPOINTS,
  buildElevenDateWindows,
  buildElevenOrderDedupeKey,
  buildElevenOrderPath,
  dedupeElevenOrders,
  extractElevenErrorEndpoint,
  formatElevenApiDateTime,
  formatElevenEndpointErrorMessage,
  parseElevenOrdersXml,
  splitElevenErrorCode,
  ElevenRequestError,
  ELEVEN_MAX_RANGE_DAYS,
} from '@/app/lib/eleven/client';
import { extractElevenApiError, parseElevenApiError } from '@/app/lib/eleven/xml-parser';
import { mapElevenOrdersToPreviewRows } from '@/app/lib/eleven/map-eleven-orders';
import { resolveElevenConnectionNotice } from '@/app/lib/eleven/connection-notice';
import { sanitizePublicIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';
import { buildConnectionHelp } from '@/app/lib/order-integration/connection-health/provider-connection-help';

describe('integration proxy — 11st host', () => {
  it('allows api.11st.co.kr over http and https', () => {
    expect(isIntegrationProxyHostAllowed('api.11st.co.kr')).toBe(true);
    expect(() =>
      assertIntegrationProxyUrlAllowed('http://api.11st.co.kr/rest/ordservices/complete'),
    ).not.toThrow();
    expect(() =>
      assertIntegrationProxyUrlAllowed('https://api.11st.co.kr/rest/ordservices/complete'),
    ).not.toThrow();
  });
});

describe('ORDER_STATUS_ENDPOINTS — official paths', () => {
  it('uses complete and packaging only (no standing)', () => {
    expect([...ORDER_STATUS_ENDPOINTS]).toEqual(['complete', 'packaging']);
    expect(ORDER_STATUS_ENDPOINTS.join(',')).not.toContain('standing');
  });

  it('builds complete and packaging URLs with 12-digit times', () => {
    const start = new Date('2026-07-01T01:00:00.000Z');
    const end = new Date('2026-07-02T01:00:00.000Z');
    const complete = buildElevenOrderPath('complete', start, end);
    const packaging = buildElevenOrderPath('packaging', start, end);
    expect(complete).toMatch(/^\/rest\/ordservices\/complete\/\d{12}\/\d{12}$/);
    expect(packaging).toMatch(/^\/rest\/ordservices\/packaging\/\d{12}\/\d{12}$/);
    expect(complete).not.toContain('standing');
    expect(packaging).not.toContain('standing');
  });
});

describe('buildElevenDateWindows', () => {
  it('keeps ranges within 7 days as a single window', () => {
    const start = new Date('2026-07-01T00:00:00.000Z');
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const windows = buildElevenDateWindows(start, end);
    expect(windows).toHaveLength(1);
    expect(windows[0]?.start.getTime()).toBe(start.getTime());
    expect(windows[0]?.end.getTime()).toBe(end.getTime());
  });

  it('splits 30-day range into 5 contiguous windows of at most 7 days', () => {
    const end = new Date('2026-08-01T12:00:00.000Z');
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const windows = buildElevenDateWindows(start, end);
    // 30일 / 7일 = 4.28… → 5구간
    expect(windows).toHaveLength(5);

    const maxMs = ELEVEN_MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;
    expect(windows[0]?.start.getTime()).toBe(start.getTime());
    expect(windows[windows.length - 1]?.end.getTime()).toBe(end.getTime());

    for (let i = 0; i < windows.length; i += 1) {
      const w = windows[i]!;
      expect(w.end.getTime() - w.start.getTime()).toBeLessThanOrEqual(maxMs);
      if (i > 0) {
        // 경계 공유: 누락 없이 이어지고, 중복은 주문 키 dedupe로 처리
        expect(w.start.getTime()).toBe(windows[i - 1]!.end.getTime());
      }
    }
  });

  it('covers 14-day range without gaps beyond shared boundaries', () => {
    const end = new Date('2026-07-15T00:00:00.000Z');
    const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
    const windows = buildElevenDateWindows(start, end);
    expect(windows).toHaveLength(2);
    expect(windows[0]!.end.getTime()).toBe(windows[1]!.start.getTime());
  });
});

describe('dedupeElevenOrders', () => {
  const base = {
    ordStat: '',
    ordStatNm: '',
    ordPrdNm: '',
    slctPrdOptNm: '',
    ordOptWonStl: '',
    ordQty: '1',
    rcvrNm: '',
    rcvrTlphn: '',
    rcvrPrtblNo: '',
    rcvrMailNo: '',
    rcvrBaseAddr: '',
    rcvrDtlsAddr: '',
    ordDlvReqCont: '',
    dlvMsg: '',
    ordNm: '',
    ordTlphnNo: '',
    ordPrtblTel: '',
    ordDt: '',
    ordStlEndDt: '',
    ordPayAmt: '',
    memID: '',
  };

  it('removes boundary duplicates by ordNo|ordPrdSeq', () => {
    const orders = dedupeElevenOrders([
      { ...base, ordNo: 'A', ordPrdSeq: '1', ordPrdNm: '상품1' },
      { ...base, ordNo: 'A', ordPrdSeq: '1', ordPrdNm: '상품1-중복' },
      { ...base, ordNo: 'A', ordPrdSeq: '2', ordPrdNm: '상품2' },
    ]);
    expect(orders).toHaveLength(2);
    expect(orders.map((o) => o.ordPrdSeq)).toEqual(['1', '2']);
  });

  it('does not merge different products when ordPrdSeq is missing', () => {
    const a = { ...base, ordNo: 'A', ordPrdSeq: '', ordPrdNm: '상품1', slctPrdOptNm: '빨강' };
    const b = { ...base, ordNo: 'A', ordPrdSeq: '', ordPrdNm: '상품2', slctPrdOptNm: '파랑' };
    expect(buildElevenOrderDedupeKey(a, 0)).not.toBe(buildElevenOrderDedupeKey(b, 1));
    expect(dedupeElevenOrders([a, b])).toHaveLength(2);
  });
});

describe('-997 user guidance', () => {
  it('keeps original [-997] text and endpoint after public sanitize', () => {
    const raw = '[-997] 등록된 API 정보가 존재하지 않습니다 (endpoint:complete)';
    const sanitized = sanitizePublicIntegrationErrorMessage(raw);
    expect(sanitized).toContain('[-997]');
    expect(sanitized).toContain('등록된 API 정보가 존재하지 않습니다');
    expect(sanitized).toContain('(endpoint:complete)');
    expect(sanitized).not.toMatch(/잘못됐/);
  });

  it('AUTH help for eleven does not assert that the API key is wrong', () => {
    const help = buildConnectionHelp({ mallId: 'eleven', status: 'AUTH_REQUIRED' });
    expect(help?.description).toContain('API 키');
    expect(help?.description).toContain('Seller 주문 API');
    expect(help?.description).toMatch(/등록/);
    expect(help?.description).toMatch(/승인/);
    expect(help?.description).toMatch(/권한/);
    expect(help?.description).not.toMatch(/잘못/);
    expect(help?.description).not.toMatch(/오입력/);
    expect(help?.checks).toEqual(
      expect.arrayContaining(['API 키', 'Seller 주문 API 등록 상태', 'Seller 주문 API 승인 상태', '주문조회 권한']),
    );
  });
});

describe('decodeResponseBody — 11st encodings', () => {
  it('decodes EUC-KR success XML by XML declaration', () => {
    const asciiPart = Buffer.from(
      '<?xml version="1.0" encoding="EUC-KR"?><Orders><resultCode>0</resultCode><note>',
      'ascii',
    );
    const korean = Buffer.from([0xc1, 0xa4, 0xbb, 0xf3]); // 정상 in EUC-KR
    const tail = Buffer.from('</note></Orders>', 'ascii');
    const bytes = Buffer.concat([asciiPart, korean, tail]);

    const decoded = decodeResponseBody(bytes, 'application/xml');
    expect(decoded.encoding).toBe('euc-kr');
    expect(decoded.text).toContain('encoding="EUC-KR"');
    expect(decoded.text).toContain('정상');
    expect(parseElevenOrdersXml(decoded.text)).toEqual([]);
  });

  it('decodes EUC-KR error XML and extracts readable code/message', () => {
    const head = Buffer.from(
      '<?xml version="1.0" encoding="EUC-KR"?><ResultOrder><resultCode>-1</resultCode><resultMessage>',
      'ascii',
    );
    const message = Buffer.from([0xc0, 0xce, 0xc1, 0xf5, 0xc5, 0xb0, 0x20, 0xbf, 0xc0, 0xb7, 0xf9]); // 인증키 오류
    const tail = Buffer.from('</resultMessage></ResultOrder>', 'ascii');
    const bytes = Buffer.concat([head, message, tail]);

    const decoded = decodeResponseBody(bytes, 'text/xml; charset=EUC-KR');
    expect(decoded.encoding).toBe('euc-kr');
    const err = extractElevenApiError(decoded.text);
    expect(err?.code).toBe('-1');
    expect(err?.message).toBe('인증키 오류');
    expect(err?.displayMessage).toBe('[-1] 인증키 오류');
  });

  it('keeps UTF-8 responses intact', () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?><Orders><resultCode>0</resultCode><Order><ordNo>1</ordNo><ordPrdSeq>1</ordPrdSeq><ordStat></ordStat><ordStatNm></ordStatNm><ordPrdNm>한글상품</ordPrdNm><slctPrdOptNm></slctPrdOptNm><ordOptWonStl></ordOptWonStl><ordQty>1</ordQty><rcvrNm></rcvrNm><rcvrTlphn></rcvrTlphn><rcvrPrtblNo></rcvrPrtblNo><rcvrMailNo></rcvrMailNo><rcvrBaseAddr></rcvrBaseAddr><rcvrDtlsAddr></rcvrDtlsAddr><ordDlvReqCont></ordDlvReqCont><dlvMsg></dlvMsg><ordNm></ordNm><ordTlphnNo></ordTlphnNo><ordPrtblTel></ordPrtblTel><ordDt></ordDt><ordStlEndDt></ordStlEndDt><ordPayAmt></ordPayAmt><memID></memID></Order></Orders>';
    const decoded = decodeResponseBody(Buffer.from(xml, 'utf8'), 'application/xml; charset=utf-8');
    expect(decoded.encoding).toBe('utf-8');
    const orders = parseElevenOrdersXml(decoded.text);
    expect(orders).toHaveLength(1);
    expect(orders[0]?.ordPrdNm).toBe('한글상품');
  });

  it('treats empty success XML as 0 orders', () => {
    const xml = '<?xml version="1.0" encoding="EUC-KR"?><Orders><resultCode>0</resultCode></Orders>';
    expect(parseElevenOrdersXml(xml)).toEqual([]);
  });

  it('detects charset helpers', () => {
    expect(detectCharsetFromContentType('text/xml; charset=EUC-KR')).toBe('euc-kr');
    expect(
      detectCharsetFromXmlDeclaration(
        Buffer.from('<?xml version="1.0" encoding="EUC-KR"?><a/>', 'ascii'),
      ),
    ).toBe('euc-kr');
  });
});

describe('parseElevenApiError', () => {
  it('detects resultCode errors with code prefix', () => {
    const message = parseElevenApiError(
      '<ResultOrder><resultCode>-1</resultCode><resultMessage>인증키 오류</resultMessage></ResultOrder>',
    );
    expect(message).toBe('[-1] 인증키 오류');
  });

  it('detects official result_code / result_text', () => {
    const err = extractElevenApiError(
      '<ResultOrder><result_code>-997</result_code><result_text>등록된 API 정보가 존재하지 않습니다</result_text></ResultOrder>',
    );
    expect(err?.code).toBe('-997');
    expect(err?.message).toBe('등록된 API 정보가 존재하지 않습니다');
    expect(err?.displayMessage).toBe('[-997] 등록된 API 정보가 존재하지 않습니다');
  });

  it('treats result_code 0 and 00 as success (null error)', () => {
    expect(extractElevenApiError('<Orders><result_code>0</result_code></Orders>')).toBeNull();
    expect(extractElevenApiError('<Orders><result_code>00</result_code></Orders>')).toBeNull();
  });

  it('detects legacy Error/Code blocks', () => {
    const err = extractElevenApiError(
      '<Error><Code>005</Code><Message>accessDeny</Message></Error>',
    );
    expect(err?.code).toBe('005');
    expect(err?.message).toBe('accessDeny');
  });

  it('parses namespaced result tags', () => {
    const err = extractElevenApiError(
      '<ns:ResultOrder><ns:result_code>-1</ns:result_code><ns:result_text>실패</ns:result_text></ns:ResultOrder>',
    );
    expect(err?.code).toBe('-1');
    expect(err?.message).toBe('실패');
  });
});

describe('endpoint error identification', () => {
  it('appends and extracts endpoint from error message', () => {
    const msg = formatElevenEndpointErrorMessage('complete', '[-997] 등록된 API 정보가 존재하지 않습니다');
    expect(msg).toContain('(endpoint:complete)');
    expect(extractElevenErrorEndpoint(msg)).toBe('complete');

    const packagingMsg = formatElevenEndpointErrorMessage(
      'packaging',
      '[-997] 등록된 API 정보가 존재하지 않습니다',
    );
    expect(extractElevenErrorEndpoint(packagingMsg)).toBe('packaging');
  });

  it('ElevenRequestError preserves endpoint for complete and packaging', () => {
    const completeErr = new ElevenRequestError({
      endpoint: 'complete',
      message: '[-997] 등록된 API 정보가 존재하지 않습니다',
      apiCode: '-997',
    });
    expect(completeErr.endpoint).toBe('complete');
    expect(completeErr.message).toContain('(endpoint:complete)');
    expect(completeErr.message).not.toContain('openapikey');

    const packagingErr = new ElevenRequestError({
      endpoint: 'packaging',
      message: '[-997] 등록된 API 정보가 존재하지 않습니다',
      apiCode: '-997',
    });
    expect(packagingErr.endpoint).toBe('packaging');
    expect(packagingErr.message).toContain('(endpoint:packaging)');
  });

  it('splitElevenErrorCode keeps endpoint suffix and ignores endpoint as code', () => {
    expect(splitElevenErrorCode('[-997] 등록된 API 정보가 존재하지 않습니다 (endpoint:complete)')).toEqual({
      code: '-997',
      message: '등록된 API 정보가 존재하지 않습니다 (endpoint:complete)',
    });
    expect(splitElevenErrorCode('[complete] something')).toEqual({
      message: '[complete] something',
    });
  });
});

describe('splitElevenErrorCode', () => {
  it('splits bracketed code', () => {
    expect(splitElevenErrorCode('[-1] 인증키 오류')).toEqual({ code: '-1', message: '인증키 오류' });
  });
});

describe('parseElevenOrdersXml', () => {
  it('parses order blocks from seller REST XML', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Orders>
  <Order>
    <ordNo>20260701001</ordNo>
    <ordPrdSeq>1</ordPrdSeq>
    <ordStat>101</ordStat>
    <ordPrdNm>테스트상품</ordPrdNm>
    <slctPrdOptNm>옵션A</slctPrdOptNm>
    <ordQty>2</ordQty>
    <rcvrNm>홍길동</rcvrNm>
    <rcvrPrtblNo>010-1234-5678</rcvrPrtblNo>
    <rcvrBaseAddr>서울시</rcvrBaseAddr>
    <rcvrDtlsAddr>101호</rcvrDtlsAddr>
    <ordDlvReqCont>문 앞</ordDlvReqCont>
    <ordStlEndDt>20260701103000</ordStlEndDt>
  </Order>
</Orders>`;

    const orders = parseElevenOrdersXml(xml);
    expect(orders).toHaveLength(1);
    expect(orders[0]?.ordNo).toBe('20260701001');
    expect(orders[0]?.ordPrdNm).toBe('테스트상품');
  });

  it('prefers prdNm over ordPrdNm', () => {
    const xml = `<Orders><Order>
      <ordNo>1</ordNo><ordPrdSeq>1</ordPrdSeq>
      <prdNm>공식상품명</prdNm>
      <ordPrdNm>구상품명</ordPrdNm>
    </Order></Orders>`;
    const orders = parseElevenOrdersXml(xml);
    expect(orders[0]?.ordPrdNm).toBe('공식상품명');
  });

  it('falls back to ordPrdNm when prdNm is absent', () => {
    const xml = `<Orders><Order>
      <ordNo>1</ordNo><ordPrdSeq>1</ordPrdSeq>
      <ordPrdNm>호환상품명</ordPrdNm>
    </Order></Orders>`;
    expect(parseElevenOrdersXml(xml)[0]?.ordPrdNm).toBe('호환상품명');
  });

  it('returns empty array when no orders exist (success 0건)', () => {
    const xml = '<Orders><resultCode>0</resultCode></Orders>';
    expect(parseElevenOrdersXml(xml)).toEqual([]);
  });

  it('treats result_code 00 with no orders as success empty list', () => {
    expect(parseElevenOrdersXml('<Orders><result_code>00</result_code></Orders>')).toEqual([]);
  });
});

describe('mapElevenOrdersToPreviewRows', () => {
  it('maps eleven order to preview rows', () => {
    const rows = mapElevenOrdersToPreviewRows([
      {
        ordNo: 'ORD-1',
        ordPrdSeq: '2',
        ordStat: '101',
        ordStatNm: '',
        ordPrdNm: '테스트상품',
        slctPrdOptNm: '옵션',
        ordOptWonStl: '',
        ordQty: '1',
        rcvrNm: '홍길동',
        rcvrTlphn: '',
        rcvrPrtblNo: '010-1234-5678',
        rcvrMailNo: '',
        rcvrBaseAddr: '서울시',
        rcvrDtlsAddr: '101호',
        ordDlvReqCont: '문 앞',
        dlvMsg: '',
        ordNm: '',
        ordTlphnNo: '',
        ordPrtblTel: '',
        ordDt: '',
        ordStlEndDt: '20260701103000',
        ordPayAmt: '',
        memID: '',
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.['주문번호']).toBe('ORD-1');
    expect(rows[0]?.['상품주문번호']).toBe('ORD-1-2');
    expect(rows[0]?.['받는사람']).toBe('홍길동');
    expect(rows[0]?.['주문상태']).toBe('결제완료');
  });
});

describe('formatElevenApiDateTime', () => {
  it('formats KST datetime as yyyyMMddHHmm', () => {
    const formatted = formatElevenApiDateTime(new Date('2026-07-01T01:30:00.000Z'));
    expect(formatted).toBe('202607011030');
  });
});

describe('resolveElevenConnectionNotice', () => {
  it('설정만 저장됨 → settings_saved', () => {
    expect(
      resolveElevenConnectionNotice({
        status: 'inactive',
        lastErrorMessage: null,
        lastTestedAt: null,
      }),
    ).toBe('settings_saved');
  });

  it('최신 연결 테스트 성공 → test_success', () => {
    expect(
      resolveElevenConnectionNotice({
        status: 'active',
        lastErrorMessage: null,
        lastTestedAt: '2026-08-01T00:00:00.000Z',
      }),
    ).toBe('test_success');
  });

  it('과거 lastTestedAt이 있어도 최신 테스트 실패 → 초록 성공 없음', () => {
    expect(
      resolveElevenConnectionNotice({
        status: 'active',
        lastErrorMessage: '[-997] 등록된 API 정보가 존재하지 않습니다 (endpoint:complete)',
        lastTestedAt: '2026-08-01T00:00:00.000Z',
      }),
    ).toBe('settings_saved');
  });

  it('성공 후 다시 실패하고 계정 재조회한 상태 → 이전 성공 표시 없음', () => {
    expect(
      resolveElevenConnectionNotice({
        status: 'error',
        lastErrorMessage: '[-997] 등록된 API 정보가 존재하지 않습니다 (endpoint:packaging)',
        lastTestedAt: '2026-08-02T00:00:00.000Z',
      }),
    ).toBe('settings_saved');
  });

  it('로컬 테스트 오류가 있는 동안 → 초록 성공 표시 없음', () => {
    expect(
      resolveElevenConnectionNotice(
        {
          status: 'active',
          lastErrorMessage: null,
          lastTestedAt: '2026-08-01T00:00:00.000Z',
        },
        { hasLocalError: true },
      ),
    ).toBe('settings_saved');
  });
});

describe('fetchElevenOrders — endpoint URLs and error preservation', () => {
  const originalEnv = process.env.INTEGRATION_PROXY_BASE_URL;

  beforeEach(() => {
    process.env.INTEGRATION_PROXY_BASE_URL = 'https://proxy.example.test';
    process.env.INTEGRATION_PROXY_SHARED_SECRET = 'test-secret';
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.INTEGRATION_PROXY_BASE_URL;
    } else {
      process.env.INTEGRATION_PROXY_BASE_URL = originalEnv;
    }
    delete process.env.INTEGRATION_PROXY_SHARED_SECRET;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('calls complete then packaging and never standing for 1-day fetch', async () => {
    const http = vi.fn().mockResolvedValue({
      httpStatus: 200,
      bodyText: '<Orders><result_code>0</result_code></Orders>',
    });
    vi.doMock('@/app/lib/integration-proxy/http-transport', () => ({
      invokeIntegrationHttp: http,
    }));
    vi.doMock('@/app/lib/integration-proxy/config', () => ({
      isIntegrationProxyConfigured: () => true,
      assertIntegrationProxyConfigReady: () => undefined,
    }));

    const client = await import('@/app/lib/eleven/client');
    await client.fetchElevenOrders({ credentials: { openapikey: 'secret-key' }, days: 1 });

    expect(http.mock.calls.length).toBeGreaterThanOrEqual(2);
    const urls = http.mock.calls.map((c) => String((c[0] as { url: string }).url));
    expect(urls.some((u: string) => u.includes('/rest/ordservices/complete/'))).toBe(true);
    expect(urls.some((u: string) => u.includes('/rest/ordservices/packaging/'))).toBe(true);
    expect(urls.every((u: string) => !u.includes('/standing/'))).toBe(true);
  });

  it('splits 30-day fetch into 5 windows × complete/packaging with 12-digit times', async () => {
    const http = vi.fn().mockResolvedValue({
      httpStatus: 200,
      bodyText: '<Orders><result_code>0</result_code></Orders>',
    });
    vi.doMock('@/app/lib/integration-proxy/http-transport', () => ({
      invokeIntegrationHttp: http,
    }));
    vi.doMock('@/app/lib/integration-proxy/config', () => ({
      isIntegrationProxyConfigured: () => true,
      assertIntegrationProxyConfigReady: () => undefined,
    }));

    const client = await import('@/app/lib/eleven/client');
    await client.fetchElevenOrders({ credentials: { openapikey: 'k' }, days: 30 });

    const urls = http.mock.calls.map((c) => String((c[0] as { url: string }).url));
    const completeUrls = urls.filter((u: string) => u.includes('/complete/'));
    const packagingUrls = urls.filter((u: string) => u.includes('/packaging/'));
    expect(completeUrls).toHaveLength(5);
    expect(packagingUrls).toHaveLength(5);
    expect(urls.every((u: string) => !u.includes('/standing/'))).toBe(true);

    for (const url of urls) {
      const match = /\/(\d{12})\/(\d{12})$/.exec(url);
      expect(match).toBeTruthy();
      expect(match![2]! >= match![1]!).toBe(true);
    }
  });

  it('preserves complete endpoint when complete request fails', async () => {
    const http = vi.fn().mockResolvedValue({
      httpStatus: 200,
      bodyText:
        '<ResultOrder><result_code>-997</result_code><result_text>등록된 API 정보가 존재하지 않습니다</result_text></ResultOrder>',
    });
    vi.doMock('@/app/lib/integration-proxy/http-transport', () => ({
      invokeIntegrationHttp: http,
    }));
    vi.doMock('@/app/lib/integration-proxy/config', () => ({
      isIntegrationProxyConfigured: () => true,
      assertIntegrationProxyConfigReady: () => undefined,
    }));

    const client = await import('@/app/lib/eleven/client');
    await expect(
      client.fetchElevenOrdersByEndpoint({
        credentials: { openapikey: 'k' },
        endpoint: 'complete',
        start: new Date('2026-07-01T00:00:00.000Z'),
        end: new Date('2026-07-02T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({
      name: 'ElevenRequestError',
      endpoint: 'complete',
    });

    try {
      await client.fetchElevenOrdersByEndpoint({
        credentials: { openapikey: 'k' },
        endpoint: 'complete',
        start: new Date('2026-07-01T00:00:00.000Z'),
        end: new Date('2026-07-02T00:00:00.000Z'),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(client.ElevenRequestError);
      expect(String((error as Error).message)).toContain('(endpoint:complete)');
      expect(String((error as Error).message)).not.toContain('k');
    }
  });

  it('preserves packaging endpoint when packaging request fails', async () => {
    const http = vi.fn().mockResolvedValue({
      httpStatus: 200,
      bodyText:
        '<ResultOrder><result_code>-997</result_code><result_text>등록된 API 정보가 존재하지 않습니다</result_text></ResultOrder>',
    });
    vi.doMock('@/app/lib/integration-proxy/http-transport', () => ({
      invokeIntegrationHttp: http,
    }));
    vi.doMock('@/app/lib/integration-proxy/config', () => ({
      isIntegrationProxyConfigured: () => true,
      assertIntegrationProxyConfigReady: () => undefined,
    }));

    const client = await import('@/app/lib/eleven/client');
    await expect(
      client.fetchElevenOrdersByEndpoint({
        credentials: { openapikey: 'k' },
        endpoint: 'packaging',
        start: new Date('2026-07-01T00:00:00.000Z'),
        end: new Date('2026-07-02T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({
      name: 'ElevenRequestError',
      endpoint: 'packaging',
    });
  });
});
