import { describe, expect, it } from 'vitest';
import { buildMatchFingerprintHmac } from '@/app/lib/order-integration/courier-download/match-fingerprint';
import {
  normalizePhoneDigits,
  normalizeShipmentRow,
  normalizeTrackingNumber,
} from '@/app/lib/order-integration/shipments/normalize-shipment-row';
import {
  isCancelledOrInvalidOrderStatus,
  isOrderAlreadyShipped,
  matchShipmentRow,
  matchShipmentRows,
  scoreShipmentOrderPair,
} from '@/app/lib/order-integration/shipments/match-shipment-row';
import type { OrderSyncOrderSnapshot } from '@/app/lib/order-integration/shipments/types';

function buildOrder(overrides: Partial<OrderSyncOrderSnapshot> = {}): OrderSyncOrderSnapshot {
  return {
    id: 'order-1',
    userId: 'user-a',
    provider: 'COUPANG',
    accountId: 'acc-coupang',
    batchId: 'batch-1',
    excloadOrderNo: 'EXC-20260709-000001',
    mallOrderNo: 'ORD-1001',
    receiverName: '홍길동',
    receiverPhone: '01012345678',
    receiverAddress: '서울시 강남구 테헤란로 123',
    productSummary: '티셔츠 x1',
    orderStatus: 'PAID',
    ...overrides,
  };
}

describe('normalizeShipmentRow', () => {
  it('parses shipment headers and preserves tracking leading zeros', () => {
    const row = normalizeShipmentRow({
      originalRowIndex: 0,
      rawRow: {
        송장번호: '0123456789',
        받는분전화번호: '010-1234-5678',
        주문번호: 'ORD-1001',
        엑클로드관리번호: 'EXC-20260709-000001',
        택배사: 'CJ대한통운',
      },
    });

    expect(row.trackingNumber).toBe('0123456789');
    expect(row.trackingNumberNormalized).toBe('0123456789');
    expect(row.receiverPhone).toBe('010-1234-5678');
    expect(row.receiverPhoneNormalized).toBe('01012345678');
    expect(row.excloadOrderNo).toBe('EXC-20260709-000001');
    expect(row.standardCarrierCode).toBe('CJ');
  });
});

describe('normalizeTrackingNumber', () => {
  it('does not convert tracking number to number type', () => {
    expect(normalizeTrackingNumber('0123456789')).toBe('0123456789');
  });
});

describe('normalizePhoneDigits', () => {
  it('preserves leading zero in normalized phone digits', () => {
    expect(normalizePhoneDigits('010-1234-5678')).toBe('01012345678');
  });
});

describe('matchShipmentRow', () => {
  const scope = { userId: 'user-a' };

  it('matches exactly when excloadOrderNo is present', () => {
    const shipment = normalizeShipmentRow({
      originalRowIndex: 0,
      rawRow: {
        송장번호: '1234567890',
        엑클로드관리번호: 'EXC-20260709-000001',
      },
    });

    const result = matchShipmentRow({
      shipment,
      orders: [buildOrder()],
      scope,
    });

    expect(result.matchStatus).toBe('MATCHED_CONFIDENT');
    expect(result.matchedOrderId).toBe('order-1');
  });

  it('matches by mallOrderNo + phone when excloadOrderNo is missing', () => {
    const shipment = normalizeShipmentRow({
      originalRowIndex: 0,
      rawRow: {
        송장번호: '1234567890',
        주문번호: 'ORD-1001',
        받는분전화번호: '01012345678',
      },
    });

    const result = matchShipmentRow({
      shipment,
      orders: [buildOrder({ excloadOrderNo: '' })],
      scope,
    });

    expect(result.matchStatus).toBe('MATCHED_CONFIDENT');
    expect(result.matchedOrderId).toBe('order-1');
  });

  it('returns warning when mall order matches but phone differs', () => {
    const shipment = normalizeShipmentRow({
      originalRowIndex: 0,
      rawRow: {
        송장번호: '1234567890',
        주문번호: 'ORD-1001',
        받는분전화번호: '01099998888',
      },
    });

    const result = matchShipmentRow({
      shipment,
      orders: [buildOrder()],
      scope,
    });

    expect(result.matchStatus).toBe('MATCHED_WARNING');
    expect(result.mismatchFields).toContain('receiverPhone');
  });

  it('marks duplicate tracking numbers in the same upload batch', () => {
    const shipments = [
      normalizeShipmentRow({ originalRowIndex: 0, rawRow: { 송장번호: '1234567890' } }),
      normalizeShipmentRow({ originalRowIndex: 1, rawRow: { 송장번호: '1234567890' } }),
    ];

    const results = matchShipmentRows({
      shipments,
      orders: [buildOrder()],
      scope,
    });

    expect(results[0]?.matchStatus).toBe('DUPLICATE_TRACKING_NUMBER');
    expect(results[1]?.matchStatus).toBe('DUPLICATE_TRACKING_NUMBER');
  });

  it('marks already shipped orders', () => {
    const shipment = normalizeShipmentRow({
      originalRowIndex: 0,
      rawRow: {
        송장번호: '1234567890',
        엑클로드관리번호: 'EXC-20260709-000001',
      },
    });

    const result = matchShipmentRow({
      shipment,
      orders: [buildOrder({ existingTrackingNumber: '9999999999' })],
      scope,
    });

    expect(result.matchStatus).toBe('ALREADY_SHIPPED');
  });

  it('marks cancelled orders as invalid', () => {
    const shipment = normalizeShipmentRow({
      originalRowIndex: 0,
      rawRow: {
        송장번호: '1234567890',
        엑클로드관리번호: 'EXC-20260709-000001',
      },
    });

    const result = matchShipmentRow({
      shipment,
      orders: [buildOrder({ orderStatus: 'cancelled' })],
      scope,
    });

    expect(result.matchStatus).toBe('CANCELLED_OR_INVALID_ORDER');
    expect(isCancelledOrInvalidOrderStatus('취소완료')).toBe(true);
  });

  it('returns MULTIPLE_CANDIDATES when top scores tie', () => {
    const shipment = normalizeShipmentRow({
      originalRowIndex: 0,
      rawRow: {
        송장번호: '1234567890',
        주문번호: 'ORD-1001',
        받는분전화번호: '01012345678',
      },
    });

    const result = matchShipmentRow({
      shipment,
      orders: [
        buildOrder({ id: 'order-1' }),
        buildOrder({ id: 'order-2', excloadOrderNo: 'EXC-20260709-000002' }),
      ],
      scope,
    });

    expect(result.matchStatus).toBe('MULTIPLE_CANDIDATES');
    expect(result.matchedOrderId).toBeNull();
  });

  it('does not auto-confirm when only row order matches', () => {
    const shipment = normalizeShipmentRow({
      originalRowIndex: 3,
      rawRow: { 송장번호: '1234567890' },
    });

    const result = matchShipmentRow({
      shipment,
      orders: [buildOrder({ exportedRowIndex: 3, mallOrderNo: 'OTHER', excloadOrderNo: '' })],
      scope,
    });

    expect(result.matchStatus).toBe('NOT_MATCHED');
    expect(result.matchReason).toContain('행 순서');
  });

  it('never matches orders from a different userId', () => {
    const shipment = normalizeShipmentRow({
      originalRowIndex: 0,
      rawRow: {
        송장번호: '1234567890',
        엑클로드관리번호: 'EXC-20260709-000001',
      },
    });

    const result = matchShipmentRow({
      shipment,
      orders: [buildOrder({ userId: 'user-b' })],
      scope,
    });

    expect(result.matchStatus).toBe('NOT_MATCHED');
    expect(result.candidates).toHaveLength(0);
  });

  it('isolates by provider when scope.provider is set', () => {
    const shipment = normalizeShipmentRow({
      originalRowIndex: 0,
      rawRow: {
        송장번호: '1234567890',
        엑클로드관리번호: 'EXC-20260709-000001',
      },
    });

    const result = matchShipmentRow({
      shipment,
      orders: [
        buildOrder({ provider: 'COUPANG' }),
        buildOrder({ id: 'order-smart', provider: 'SMARTSTORE', excloadOrderNo: 'EXC-20260709-000001' }),
      ],
      scope: { userId: 'user-a', provider: 'SMARTSTORE' },
    });

    expect(result.matchStatus).toBe('MATCHED_CONFIDENT');
    expect(result.matchedOrderId).toBe('order-smart');
  });

  it('can match across multiple providers when scope.provider is omitted', () => {
    const shipment = normalizeShipmentRow({
      originalRowIndex: 0,
      rawRow: {
        송장번호: '1234567890',
        주문번호: 'ORD-2002',
        받는분전화번호: '01022223333',
      },
    });

    const result = matchShipmentRow({
      shipment,
      orders: [
        buildOrder({ id: 'order-coupang', provider: 'COUPANG', mallOrderNo: 'ORD-1001' }),
        buildOrder({
          id: 'order-smart',
          provider: 'SMARTSTORE',
          mallOrderNo: 'ORD-2002',
          receiverPhone: '01022223333',
        }),
      ],
      scope,
    });

    expect(result.matchStatus).toBe('MATCHED_CONFIDENT');
    expect(result.matchedOrderId).toBe('order-smart');
  });

  it('isolates by accountId when provided', () => {
    const shipment = normalizeShipmentRow({
      originalRowIndex: 0,
      rawRow: {
        송장번호: '1234567890',
        엑클로드관리번호: 'EXC-20260709-000001',
      },
    });

    const result = matchShipmentRow({
      shipment,
      orders: [
        buildOrder({ accountId: 'acc-1' }),
        buildOrder({ id: 'order-2', accountId: 'acc-2', excloadOrderNo: 'EXC-20260709-000001' }),
      ],
      scope: { userId: 'user-a', accountId: 'acc-2' },
    });

    expect(result.matchedOrderId).toBe('order-2');
  });

  it('marks CONFIDENT when mallOrderNo and phone HMAC both match (work-item candidate)', () => {
    const SECRET = 'test-match-fingerprint-secret-confident';
    const prev = process.env.EXCLOAD_MATCH_FINGERPRINT_SECRET;
    process.env.EXCLOAD_MATCH_FINGERPRINT_SECRET = SECRET;
    try {
      const hmac = buildMatchFingerprintHmac(
        { receiverPhone: '010-7001-0001', receiverName: '가상수령인갑' },
        SECRET,
      );
      const shipment = normalizeShipmentRow({
        originalRowIndex: 0,
        rawRow: {
          송장번호: '880012340001',
          주문번호: 'VIRT-ORD-001',
          수취인: '가상수령인갑',
          전화번호: '010-7001-0001',
        },
      });
      const result = matchShipmentRow({
        shipment,
        orders: [
          buildOrder({
            id: 'wi-1',
            mallOrderNo: 'VIRT-ORD-001',
            receiverName: null,
            receiverPhone: null,
            matchFingerprintHmac: hmac,
            workItemCandidate: true,
            excloadOrderNo: 'EXC-INTERNAL-ONLY',
          }),
        ],
        scope,
      });
      expect(result.matchStatus).toBe('MATCHED_CONFIDENT');
      expect(result.matchReason).toContain('mallOrderNo');
      expect(result.matchReason).toContain('phone');
      expect(result.matchedOrderId).toBe('wi-1');
    } finally {
      if (prev === undefined) delete process.env.EXCLOAD_MATCH_FINGERPRINT_SECRET;
      else process.env.EXCLOAD_MATCH_FINGERPRINT_SECRET = prev;
    }
  });

  it('stays WARNING when phone+name match but mallOrderNo is missing on candidate', () => {
    const SECRET = 'test-match-fingerprint-secret-warning';
    const prev = process.env.EXCLOAD_MATCH_FINGERPRINT_SECRET;
    process.env.EXCLOAD_MATCH_FINGERPRINT_SECRET = SECRET;
    try {
      const hmac = buildMatchFingerprintHmac(
        { receiverPhone: '010-7001-0001', receiverName: '가상수령인갑' },
        SECRET,
      );
      const shipment = normalizeShipmentRow({
        originalRowIndex: 0,
        rawRow: {
          송장번호: '880012340001',
          주문번호: 'VIRT-ORD-001',
          수취인: '가상수령인갑',
          전화번호: '010-7001-0001',
        },
      });
      const result = matchShipmentRow({
        shipment,
        orders: [
          buildOrder({
            id: 'wi-2',
            mallOrderNo: '',
            receiverName: null,
            receiverPhone: null,
            matchFingerprintHmac: hmac,
            workItemCandidate: true,
          }),
        ],
        scope,
      });
      expect(result.matchStatus).toBe('MATCHED_WARNING');
      expect(result.matchReason).not.toContain('mallOrderNo');
    } finally {
      if (prev === undefined) delete process.env.EXCLOAD_MATCH_FINGERPRINT_SECRET;
      else process.env.EXCLOAD_MATCH_FINGERPRINT_SECRET = prev;
    }
  });
});

describe('scoreShipmentOrderPair', () => {
  it('detects already shipped helper', () => {
    expect(isOrderAlreadyShipped(buildOrder({ existingTrackingNumber: '111' }))).toBe(true);
  });
});
