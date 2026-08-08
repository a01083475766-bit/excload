import { describe, expect, it } from 'vitest';
import {
  assertIntegrationProxyUrlAllowed,
  isIntegrationProxyHostAllowed,
} from '@/app/lib/integration-proxy/allowed-domains';
import {
  decodeResponseBody,
  detectCharsetFromContentType,
  detectCharsetFromXmlDeclaration,
} from '@/app/lib/integration-proxy/decode-response-body';
import { parseElevenOrdersXml, formatElevenApiDateTime, splitElevenErrorCode } from '@/app/lib/eleven/client';
import { extractElevenApiError, parseElevenApiError } from '@/app/lib/eleven/xml-parser';
import { mapElevenOrdersToPreviewRows } from '@/app/lib/eleven/map-eleven-orders';

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

describe('decodeResponseBody — 11st encodings', () => {
  it('decodes EUC-KR success XML by XML declaration', () => {
    const xmlUtf8 =
      '<?xml version="1.0" encoding="EUC-KR"?><Orders><resultCode>0</resultCode></Orders>';
    // Build realistic EUC-KR payload: ASCII declaration + euc-kr Korean elsewhere is enough for detection.
    const asciiPart = Buffer.from('<?xml version="1.0" encoding="EUC-KR"?><Orders><resultCode>0</resultCode><note>', 'ascii');
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

  it('detects legacy Error/Code blocks', () => {
    const err = extractElevenApiError(
      '<Error><Code>005</Code><Message>accessDeny</Message></Error>',
    );
    expect(err?.code).toBe('005');
    expect(err?.message).toBe('accessDeny');
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

  it('returns empty array when no orders exist', () => {
    const xml = '<Orders><resultCode>0</resultCode></Orders>';
    expect(parseElevenOrdersXml(xml)).toEqual([]);
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
