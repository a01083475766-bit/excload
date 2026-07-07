import { describe, expect, it } from 'vitest';
import {
  assertIntegrationProxyUrlAllowed,
  isIntegrationProxyHostAllowed,
} from '@/app/lib/integration-proxy/allowed-domains';
import { parseElevenOrdersXml, formatElevenApiDateTime } from '@/app/lib/eleven/client';
import { parseElevenApiError } from '@/app/lib/eleven/xml-parser';
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

describe('parseElevenApiError', () => {
  it('detects resultCode errors', () => {
    const message = parseElevenApiError(
      '<ResultOrder><resultCode>-1</resultCode><resultMessage>인증키 오류</resultMessage></ResultOrder>',
    );
    expect(message).toBe('인증키 오류');
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
