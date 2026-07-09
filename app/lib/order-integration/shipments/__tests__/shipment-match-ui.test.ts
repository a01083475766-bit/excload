import { describe, expect, it } from 'vitest';

import type { ShipmentMatchDisplayRow } from '@/app/lib/order-integration/shipments/shipment-match-ui';
import {
  buildShipmentMatchDisplayRows,
  buildShipmentMatchSummaryCards,
  filterShipmentMatchDisplayRows,
  getShipmentMatchStatusMeta,
  maskShipmentAddress,
  maskShipmentPhone,
  maskShipmentTrackingNumber,
} from '@/app/lib/order-integration/shipments/shipment-match-ui';

function buildDisplayRow(
  overrides: Partial<ShipmentMatchDisplayRow> = {},
): ShipmentMatchDisplayRow {
  return {
    shipmentRowIndex: 0,
    matchStatus: 'NOT_MATCHED',
    matchReason: 'none',
    providerLabel: null,
    mallOrderNo: null,
    excloadOrderNo: null,
    receiverName: null,
    receiverPhoneMasked: null,
    receiverAddressMasked: null,
    productSummary: null,
    carrierName: null,
    trackingNumberMasked: null,
    ...overrides,
  };
}

describe('getShipmentMatchStatusMeta', () => {
  it('maps MATCHED_CONFIDENT to 자동 매칭', () => {
    expect(getShipmentMatchStatusMeta('MATCHED_CONFIDENT').label).toBe('자동 매칭');
  });

  it('maps MATCHED_WARNING to 확인 필요', () => {
    expect(getShipmentMatchStatusMeta('MATCHED_WARNING').label).toBe('확인 필요');
  });

  it('maps NOT_MATCHED to 매칭 실패', () => {
    expect(getShipmentMatchStatusMeta('NOT_MATCHED').label).toBe('매칭 실패');
  });

  it('maps DUPLICATE_TRACKING_NUMBER to 중복 송장', () => {
    expect(getShipmentMatchStatusMeta('DUPLICATE_TRACKING_NUMBER').label).toBe('중복 송장');
  });
});

describe('masking helpers', () => {
  it('masks phone numbers', () => {
    expect(maskShipmentPhone('01012345678')).toBe('010-****-5678');
  });

  it('masks tracking numbers', () => {
    expect(maskShipmentTrackingNumber('12345678901234')).toBe('1234****1234');
  });

  it('masks addresses with head and tail', () => {
    expect(maskShipmentAddress('인천 미추홀구 주안동 101호')).toBe('인천 미추홀구 ... 101호');
  });
});

describe('buildShipmentMatchSummaryCards', () => {
  it('builds summary cards from counts', () => {
    const cards = buildShipmentMatchSummaryCards({
      totalRows: 10,
      matchedConfidentCount: 4,
      matchedWarningCount: 2,
      multipleCandidatesCount: 1,
      notMatchedCount: 3,
      duplicateTrackingNumberCount: 1,
      alreadyShippedCount: 0,
      cancelledOrInvalidOrderCount: 0,
    });

    expect(cards.find((card) => card.key === 'matchedConfidentCount')?.count).toBe(4);
    expect(cards.find((card) => card.key === 'notMatchedCount')?.count).toBe(3);
  });
});

describe('filterShipmentMatchDisplayRows', () => {
  const rows = [
    buildDisplayRow({ matchStatus: 'MATCHED_CONFIDENT' }),
    buildDisplayRow({ shipmentRowIndex: 1, matchStatus: 'MATCHED_WARNING' }),
    buildDisplayRow({ shipmentRowIndex: 2, matchStatus: 'NOT_MATCHED' }),
    buildDisplayRow({ shipmentRowIndex: 3, matchStatus: 'DUPLICATE_TRACKING_NUMBER' }),
  ];

  it('returns all rows for all tab', () => {
    expect(filterShipmentMatchDisplayRows(rows, 'all')).toHaveLength(4);
  });

  it('filters confident rows', () => {
    expect(filterShipmentMatchDisplayRows(rows, 'confident')).toHaveLength(1);
  });

  it('filters duplicate and multiple candidate rows together', () => {
    const extended = [
      ...rows,
      buildDisplayRow({ shipmentRowIndex: 4, matchStatus: 'MULTIPLE_CANDIDATES' }),
    ];
    expect(filterShipmentMatchDisplayRows(extended, 'duplicate_error')).toHaveLength(2);
  });
});

describe('buildShipmentMatchDisplayRows', () => {
  it('merges shipment and matched order fields with masking', () => {
    const rows = buildShipmentMatchDisplayRows({
      shipments: [
        {
          originalRowIndex: 0,
          trackingNumber: '12345678901234',
          trackingNumberNormalized: '12345678901234',
          carrierName: 'CJ대한통운',
          excloadOrderNo: 'EXC-1',
          mallOrderNo: 'ORD-1',
          receiverName: '홍길동',
          receiverPhone: '01012345678',
          receiverPhoneNormalized: '01012345678',
          receiverAddress: '인천 미추홀구 주안동 101호',
          receiverAddressNormalized: '인천미추홀구주안동101호',
          productText: '티셔츠',
          standardCarrierCode: '04',
          shippedAt: '',
          parseWarnings: [],
        },
      ],
      orders: [
        {
          id: 'order-1',
          userId: 'user-a',
          provider: 'SMARTSTORE',
          excloadOrderNo: 'EXC-1',
          mallOrderNo: 'ORD-1',
          receiverName: '홍길동',
          receiverPhone: '01012345678',
          receiverAddress: '인천 미추홀구 주안동 101호',
          productSummary: '티셔츠 x1',
        },
      ],
      matchRows: [
        {
          shipmentRowIndex: 0,
          matchStatus: 'MATCHED_CONFIDENT',
          matchScore: 100,
          matchReason: 'ok',
          mismatchFields: [],
          matchedOrderId: 'order-1',
          candidates: [],
          transmissionStatus: 'NOT_READY',
        },
      ],
    });

    expect(rows[0]?.providerLabel).toBe('스마트스토어');
    expect(rows[0]?.receiverPhoneMasked).toBe('010-****-5678');
    expect(rows[0]?.trackingNumberMasked).toBe('1234****1234');
    expect(rows[0]?.receiverAddressMasked).toContain('인천');
  });
});
