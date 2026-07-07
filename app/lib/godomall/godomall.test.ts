import { describe, expect, it, vi, afterEach } from 'vitest';
import { getAllPlannedProxyDomains } from '@/app/lib/order-integration/mall-integration-specs';
import {
  EXCLOAD_GODOMALL_OUTBOUND_IP,
  GODOMALL_DEFAULT_ORDER_STATUSES,
} from '@/app/lib/godomall/api-spec';
import {
  flattenGodomallOrderRows,
  resolveGodomallOrderStatuses,
  validateGodomallApiEnvelope,
} from '@/app/lib/godomall/client';
import { resolveGodomallPartnerKey } from '@/app/lib/godomall/partner-key';
import { buildGodomallRequestXml, parseGodomallResponseXml } from '@/app/lib/godomall/xml';
import { mapGodomallOrdersToPreviewRows } from '@/app/lib/godomall/map-godomall-orders';

describe('godomall proxy registry', () => {
  it('tracks openhub.godo.co.kr as planned before Lightsail 1-shot deploy', () => {
    const planned = getAllPlannedProxyDomains();
    expect(planned.some((d) => d.hostname === 'openhub.godo.co.kr')).toBe(true);
  });
});

describe('resolveGodomallPartnerKey', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers override over env', () => {
    vi.stubEnv('GODOMALL_PARTNER_KEY', 'env-partner');
    expect(resolveGodomallPartnerKey('override-partner')).toBe('override-partner');
  });

  it('reads from GODOMALL_PARTNER_KEY env', () => {
    vi.stubEnv('GODOMALL_PARTNER_KEY', 'env-partner');
    expect(resolveGodomallPartnerKey()).toBe('env-partner');
  });

  it('throws when neither env nor override is set', () => {
    expect(() => resolveGodomallPartnerKey()).toThrow(/GODOMALL_PARTNER_KEY/);
  });
});

describe('godomall XML helpers', () => {
  it('builds request XML with partner_key and key', () => {
    const xml = buildGodomallRequestXml({
      partner_key: 'partner-abc',
      key: 'user-key-xyz',
      dateType: 'order',
      startDate: '2026-07-01',
      endDate: '2026-07-08',
      size: 1,
      orderStatus: 'p1',
    });

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<partner_key>partner-abc</partner_key>');
    expect(xml).toContain('<key>user-key-xyz</key>');
    expect(xml).toContain('<orderStatus>p1</orderStatus>');
  });

  it('parses order_data response envelope', () => {
    const envelope = parseGodomallResponseXml(`<?xml version="1.0" encoding="UTF-8"?>
<data>
  <code>000</code>
  <msg>success</msg>
  <lastOrder>false</lastOrder>
  <order_data>
    <orderNo>20260708001</orderNo>
    <orderDate>2026-07-08 10:00:00</orderDate>
    <orderInfoData>
      <receiverName>홍길동</receiverName>
      <receiverCellPhone>010-1234-5678</receiverCellPhone>
      <receiverAddress>서울시 강남구</receiverAddress>
    </orderInfoData>
    <orderGoodsData>
      <sno>1</sno>
      <goodsNm>테스트상품</goodsNm>
      <goodsCnt>2</goodsCnt>
      <orderStatus>p1</orderStatus>
      <goodsPrice>20000</goodsPrice>
    </orderGoodsData>
  </order_data>
</data>`);

    expect(envelope.code).toBe('000');
    expect(Array.isArray(envelope.order_data)).toBe(true);
  });
});

describe('resolveGodomallOrderStatuses', () => {
  it('defaults to safe fetch statuses', () => {
    expect(resolveGodomallOrderStatuses()).toEqual([...GODOMALL_DEFAULT_ORDER_STATUSES]);
  });

  it('normalizes custom status codes', () => {
    expect(resolveGodomallOrderStatuses(['P1', 'g1', 'd2'])).toEqual(['p1', 'g1', 'd2']);
  });
});

describe('validateGodomallApiEnvelope', () => {
  it('throws IP whitelist guidance for code 996', () => {
    expect(() =>
      validateGodomallApiEnvelope({ code: '996', msg: 'IP not allowed' }, 200),
    ).toThrow(`NHN에 엑클로드 호출 IP ${EXCLOAD_GODOMALL_OUTBOUND_IP} 등록이 필요합니다`);
  });

  it('passes for success code 000', () => {
    expect(() => validateGodomallApiEnvelope({ code: '000', msg: 'ok' }, 200)).not.toThrow();
  });
});

describe('flattenGodomallOrderRows', () => {
  it('flattens order_data with orderInfoData and orderGoodsData', () => {
    const rows = flattenGodomallOrderRows([
      {
        orderNo: '20260708001',
        orderDate: '2026-07-08 10:00:00',
        orderInfoData: [
          {
            receiverName: '홍길동',
            receiverCellPhone: '010-1234-5678',
            receiverAddress: '서울시 강남구',
          },
        ],
        orderGoodsData: [
          {
            sno: '10',
            goodsNm: '테스트상품',
            goodsCnt: '2',
            orderStatus: 'p1',
            goodsPrice: '20000',
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

describe('mapGodomallOrdersToPreviewRows', () => {
  it('maps normalized orders to preview rows', () => {
    const rows = mapGodomallOrdersToPreviewRows([
      {
        orderNo: '1',
        orderGoodsSno: '2',
        orderStatus: 'p1',
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
    expect(rows[0]?.['주문상태']).toBe('p1');
    expect(rows[0]?.['상품명']).toBe('샘플');
  });
});
