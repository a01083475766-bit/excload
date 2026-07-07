import { describe, expect, it } from 'vitest';
import {
  assertIntegrationProxyUrlAllowed,
  isIntegrationProxyHostAllowed,
} from '@/app/lib/integration-proxy/allowed-domains';
import {
  extractSsgShppDirectionList,
  extractSsgWarehouseOutList,
  mapRawSsgOrders,
  parseSsgApiResponse,
} from '@/app/lib/ssg/client';
import { mapSsgOrdersToPreviewRows } from '@/app/lib/ssg/map-ssg-orders';

describe('integration proxy — ssg host', () => {
  it('allows eapi.ssgadm.com over https', () => {
    expect(isIntegrationProxyHostAllowed('eapi.ssgadm.com')).toBe(true);
    expect(() =>
      assertIntegrationProxyUrlAllowed('https://eapi.ssgadm.com/api/pd/1/listShppDirection.ssg'),
    ).not.toThrow();
  });
});

describe('parseSsgApiResponse', () => {
  it('parses result envelope', () => {
    const envelope = parseSsgApiResponse(
      JSON.stringify({ resultCode: '00', resultMessage: 'SUCCESS', resultDesc: '' }),
    );
    expect(envelope.resultCode).toBe('00');
  });
});

describe('extractSsgShppDirectionList', () => {
  it('unwraps shppDirection objects', () => {
    const payload = {
      resultCode: '00',
      shppDirections: [
        {
          shppDirection: {
            ordNo: '20260708001',
            ordItemSeq: 1,
            shppNo: 'SHP001',
            shppSeq: 1,
            shppStatNm: '정상',
            itemNm: '테스트상품',
            ordQty: 2,
            rcptpeNm: '홍길동',
            rcptpeHpno: '01012345678',
            shpplocBascAddr: '서울시 강남구',
            shpplocDtlAddr: '101호',
            ordMemoCntt: '문 앞',
            ordCmplDts: '20260708103000',
          },
        },
      ],
    };

    const rows = extractSsgShppDirectionList(payload);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ordNo).toBe('20260708001');
  });
});

describe('extractSsgWarehouseOutList', () => {
  it('unwraps warehouseOut objects', () => {
    const payload = {
      resultCode: '00',
      warehouseOuts: [
        {
          warehouseOut: {
            ordNo: '20260708002',
            ordItemSeq: 2,
            lastShppProgStatDtlNm: '피킹완료',
            itemNm: '출고상품',
          },
        },
      ],
    };

    const rows = extractSsgWarehouseOutList(payload);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ordNo).toBe('20260708002');
  });
});

describe('mapSsgOrdersToPreviewRows', () => {
  it('maps normalized orders to preview rows', () => {
    const orders = mapRawSsgOrders(
      [
        {
          ordNo: '1',
          ordItemSeq: '2',
          shppNo: 'S1',
          shppSeq: '1',
          shppStatNm: '배송지시',
          itemNm: '샘플',
          ordQty: '1',
          ordCmplDts: '20260708103000',
          rcptpeNm: 'Kim',
          rcptpeHpno: '01011112222',
          shpplocZipcd: '12345',
          shpplocBascAddr: '서울',
          shpplocDtlAddr: '1층',
          ordMemoCntt: '빠른 배송',
          sellprc: '10000',
        },
      ],
      'shpp_direction',
    );

    const rows = mapSsgOrdersToPreviewRows(orders);
    expect(rows[0]?.['주문번호']).toBe('1');
    expect(rows[0]?.['주문상태']).toBe('배송지시');
    expect(rows[0]?.['상품명']).toBe('샘플');
  });
});
