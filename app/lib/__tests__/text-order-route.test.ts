import { describe, it, expect } from 'vitest';
import {
  TEXT_ORDER_PARCEL_HEADERS,
  TEXT_ORDER_SIMPLE_CORE_HEADERS,
} from '../normalize-29/text-order-route';

describe('TEXT_ORDER_PARCEL_HEADERS', () => {
  it('29개 택배 추출 필드', () => {
    expect(TEXT_ORDER_PARCEL_HEADERS).toHaveLength(29);
    expect(TEXT_ORDER_PARCEL_HEADERS[0]).toBe('주문번호');
    expect(TEXT_ORDER_PARCEL_HEADERS).toContain('보내는사람');
    expect(TEXT_ORDER_PARCEL_HEADERS).toContain('택배사');
  });

  it('TEXT_ORDER_SIMPLE_CORE_HEADERS는 parcel과 동일 (호환)', () => {
    expect(TEXT_ORDER_SIMPLE_CORE_HEADERS).toEqual(TEXT_ORDER_PARCEL_HEADERS);
  });
});
