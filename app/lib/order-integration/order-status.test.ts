import { describe, expect, it } from 'vitest';
import {
  isClaimStatus,
  isShipmentTarget,
  matchesWorkTarget,
  normalizeOrderStatusFromKoreanLabel,
  normalizeSmartstoreOrderStatus,
  normalizeSmartstorePlaceOrderStatus,
  ORDER_WORK_TARGET_LABEL,
  resolveInvoiceInfoDisplay,
  resolvePlaceOrderSecondaryHint,
} from '@/app/lib/order-integration/order-status';

describe('normalizeSmartstoreOrderStatus', () => {
  it('maps known smartstore status codes', () => {
    expect(normalizeSmartstoreOrderStatus('PAYED')).toBe('PAYED');
    expect(normalizeSmartstoreOrderStatus('DELIVERING')).toBe('DELIVERING');
    expect(normalizeSmartstoreOrderStatus('DELIVERED')).toBe('DELIVERED');
    expect(normalizeSmartstoreOrderStatus('PURCHASE_DECIDED')).toBe('PURCHASE_DECIDED');
    expect(normalizeSmartstoreOrderStatus('RETURNED')).toBe('RETURNED');
    expect(normalizeSmartstoreOrderStatus('EXCHANGED')).toBe('EXCHANGED');
  });

  it('maps both cancel codes to CANCELED', () => {
    expect(normalizeSmartstoreOrderStatus('CANCELED')).toBe('CANCELED');
    expect(normalizeSmartstoreOrderStatus('CANCELED_BY_NOPAYMENT')).toBe('CANCELED');
  });

  it('returns UNKNOWN for empty or unknown values', () => {
    expect(normalizeSmartstoreOrderStatus(undefined)).toBe('UNKNOWN');
    expect(normalizeSmartstoreOrderStatus('')).toBe('UNKNOWN');
    expect(normalizeSmartstoreOrderStatus('SOMETHING_NEW')).toBe('UNKNOWN');
  });
});

describe('normalizeSmartstorePlaceOrderStatus', () => {
  it('maps place order status', () => {
    expect(normalizeSmartstorePlaceOrderStatus('OK')).toBe('OK');
    expect(normalizeSmartstorePlaceOrderStatus('NOT_YET')).toBe('NOT_YET');
    expect(normalizeSmartstorePlaceOrderStatus(undefined)).toBe('UNKNOWN');
  });
});

describe('normalizeOrderStatusFromKoreanLabel', () => {
  it('maps korean labels back to common status', () => {
    expect(normalizeOrderStatusFromKoreanLabel('결제완료')).toBe('PAYED');
    expect(normalizeOrderStatusFromKoreanLabel('배송중')).toBe('DELIVERING');
    expect(normalizeOrderStatusFromKoreanLabel('배송완료')).toBe('DELIVERED');
    expect(normalizeOrderStatusFromKoreanLabel('취소')).toBe('CANCELED');
    expect(normalizeOrderStatusFromKoreanLabel('반품요청')).toBe('RETURNED');
    expect(normalizeOrderStatusFromKoreanLabel('')).toBe('UNKNOWN');
  });
});

describe('isShipmentTarget / isClaimStatus', () => {
  it('treats PAYED as shipment target', () => {
    expect(isShipmentTarget({ status: 'PAYED' })).toBe(true);
    expect(isShipmentTarget({ status: 'DELIVERING' })).toBe(false);
    expect(isShipmentTarget({ status: 'CANCELED' })).toBe(false);
  });

  it('부분 취소(remain 2, PAYED)는 전체 제외하지 않고 송장 처리 대상', () => {
    expect(isShipmentTarget({ status: 'PAYED', remainQuantity: 2 })).toBe(true);
  });

  it('전체 취소(remain 0)는 송장 처리 대상이 아니다', () => {
    expect(isShipmentTarget({ status: 'PAYED', remainQuantity: 0 })).toBe(false);
  });

  it('잔여 수량 정보가 없으면 수량 조건은 통과한다', () => {
    expect(isShipmentTarget({ status: 'PAYED', remainQuantity: undefined })).toBe(true);
  });

  it('detects claim statuses', () => {
    expect(isClaimStatus('CANCELED')).toBe(true);
    expect(isClaimStatus('RETURNED')).toBe(true);
    expect(isClaimStatus('EXCHANGED')).toBe(true);
    expect(isClaimStatus('PAYED')).toBe(false);
  });
});

describe('matchesWorkTarget', () => {
  it('ALL matches every order', () => {
    expect(matchesWorkTarget('ALL', { status: 'CANCELED' })).toBe(true);
    expect(matchesWorkTarget('ALL', { status: 'PAYED' })).toBe(true);
  });

  it('SHIPMENT_TARGET only matches PAYED', () => {
    expect(matchesWorkTarget('SHIPMENT_TARGET', { status: 'PAYED' })).toBe(true);
    expect(matchesWorkTarget('SHIPMENT_TARGET', { status: 'DELIVERING' })).toBe(false);
  });

  it('distinguishes place order not-yet vs waiting', () => {
    expect(
      matchesWorkTarget('PLACE_ORDER_NOT_YET', { status: 'PAYED', placeOrderStatus: 'NOT_YET' }),
    ).toBe(true);
    expect(
      matchesWorkTarget('PLACE_ORDER_NOT_YET', { status: 'PAYED', placeOrderStatus: 'OK' }),
    ).toBe(false);
    expect(
      matchesWorkTarget('PLACE_ORDER_WAITING', { status: 'PAYED', placeOrderStatus: 'OK' }),
    ).toBe(true);
  });

  it('CLAIM matches cancel/return/exchange', () => {
    expect(matchesWorkTarget('CLAIM', { status: 'CANCELED' })).toBe(true);
    expect(matchesWorkTarget('CLAIM', { status: 'RETURNED' })).toBe(true);
    expect(matchesWorkTarget('CLAIM', { status: 'PAYED' })).toBe(false);
  });

  it('DELIVERING / DELIVERED match respective statuses', () => {
    expect(matchesWorkTarget('DELIVERING', { status: 'DELIVERING' })).toBe(true);
    expect(matchesWorkTarget('DELIVERED', { status: 'DELIVERED' })).toBe(true);
    expect(matchesWorkTarget('DELIVERING', { status: 'DELIVERED' })).toBe(false);
  });

  it('DELIVERED work target includes PURCHASE_DECIDED and excludes others', () => {
    expect(matchesWorkTarget('DELIVERED', { status: 'DELIVERED' })).toBe(true);
    expect(matchesWorkTarget('DELIVERED', { status: 'PURCHASE_DECIDED' })).toBe(true);
    expect(matchesWorkTarget('DELIVERED', { status: 'DELIVERING' })).toBe(false);
    expect(matchesWorkTarget('DELIVERED', { status: 'PAYED' })).toBe(false);
    expect(matchesWorkTarget('DELIVERED', { status: 'CANCELED' })).toBe(false);
    expect(ORDER_WORK_TARGET_LABEL.DELIVERED).toBe('배송 완료·구매확정');
  });

  it('does not put PURCHASE_DECIDED into shipment/new-paid/place-order targets', () => {
    const decided = { status: 'PURCHASE_DECIDED' as const, placeOrderStatus: 'OK' as const };
    expect(matchesWorkTarget('SHIPMENT_TARGET', decided)).toBe(false);
    expect(matchesWorkTarget('NEW_PAID', decided)).toBe(false);
    expect(matchesWorkTarget('PLACE_ORDER_WAITING', decided)).toBe(false);
    expect(matchesWorkTarget('PLACE_ORDER_NOT_YET', decided)).toBe(false);
    expect(isShipmentTarget(decided)).toBe(false);
  });
});

describe('resolvePlaceOrderSecondaryHint', () => {
  it('shows hints only for PAYED', () => {
    expect(resolvePlaceOrderSecondaryHint({ status: 'PAYED', placeOrderStatus: 'OK' })).toBe('OK');
    expect(
      resolvePlaceOrderSecondaryHint({ status: 'PAYED', placeOrderStatus: 'NOT_YET' }),
    ).toBe('NOT_YET');
  });

  it('hides hints for delivering / delivered / purchase-decided even when placeOrder is OK', () => {
    expect(
      resolvePlaceOrderSecondaryHint({ status: 'DELIVERING', placeOrderStatus: 'OK' }),
    ).toBeNull();
    expect(
      resolvePlaceOrderSecondaryHint({ status: 'DELIVERED', placeOrderStatus: 'OK' }),
    ).toBeNull();
    expect(
      resolvePlaceOrderSecondaryHint({ status: 'PURCHASE_DECIDED', placeOrderStatus: 'OK' }),
    ).toBeNull();
    expect(
      resolvePlaceOrderSecondaryHint({ status: 'CANCELED', placeOrderStatus: 'OK' }),
    ).toBeNull();
  });
});

describe('resolveInvoiceInfoDisplay', () => {
  it('shows 등록됨 whenever hasTracking is true', () => {
    expect(resolveInvoiceInfoDisplay({ hasTracking: true, status: 'PAYED' }).text).toBe('등록됨');
    expect(
      resolveInvoiceInfoDisplay({ hasTracking: true, status: 'PURCHASE_DECIDED' }).text,
    ).toBe('등록됨');
    expect(resolveInvoiceInfoDisplay({ hasTracking: true, status: 'DELIVERING' }).text).toBe(
      '등록됨',
    );
  });

  it('shows 미등록 for PAYED without tracking', () => {
    expect(resolveInvoiceInfoDisplay({ hasTracking: false, status: 'PAYED' })).toEqual({
      text: '미등록',
    });
  });

  it('shows 송장번호 없음 for post-ship statuses without tracking', () => {
    for (const status of ['DELIVERING', 'DELIVERED', 'PURCHASE_DECIDED'] as const) {
      const display = resolveInvoiceInfoDisplay({ hasTracking: false, status });
      expect(display.text).toBe('송장번호 없음');
      expect(display.title).toMatch(/송장번호가 없습니다/);
    }
  });

  it('keeps 미등록 for other statuses without tracking', () => {
    expect(resolveInvoiceInfoDisplay({ hasTracking: false, status: 'CANCELED' }).text).toBe(
      '미등록',
    );
  });
});
