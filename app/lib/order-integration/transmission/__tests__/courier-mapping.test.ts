import { describe, expect, it } from 'vitest';

import {
  resolveCommonCourierCode,
  resolveProviderCourierCode,
} from '@/app/lib/order-integration/transmission/courier-mapping';

describe('resolveProviderCourierCode (COUPANG)', () => {
  it('maps LOTTE to HYUNDAI for Coupang', () => {
    expect(
      resolveProviderCourierCode({
        provider: 'COUPANG',
        courierCode: 'LOTTE',
        courierName: null,
      }),
    ).toBe('HYUNDAI');
  });

  it('maps LOTTE by courier name alias', () => {
    expect(
      resolveProviderCourierCode({
        provider: 'COUPANG',
        courierCode: null,
        courierName: '롯데택배',
      }),
    ).toBe('HYUNDAI');
  });

  it('keeps CJ, HANJIN, LOGEN, and EPOST mappings', () => {
    expect(
      resolveProviderCourierCode({ provider: 'COUPANG', courierCode: 'CJ', courierName: null }),
    ).toBe('CJGLS');
    expect(
      resolveProviderCourierCode({
        provider: 'COUPANG',
        courierCode: 'HANJIN',
        courierName: null,
      }),
    ).toBe('HANJIN');
    expect(
      resolveProviderCourierCode({
        provider: 'COUPANG',
        courierCode: 'LOGEN',
        courierName: null,
      }),
    ).toBe('KGB');
    expect(
      resolveProviderCourierCode({
        provider: 'COUPANG',
        courierCode: 'EPOST',
        courierName: null,
      }),
    ).toBe('EPOST');
  });

  it('returns null for unsupported couriers', () => {
    expect(
      resolveProviderCourierCode({
        provider: 'COUPANG',
        courierCode: 'UNKNOWN',
        courierName: '알수없는택배',
      }),
    ).toBeNull();
  });

  it('maps SMARTSTORE LOTTE to HYUNDAI (Naver deliveryCompanyCode)', () => {
    expect(
      resolveProviderCourierCode({
        provider: 'SMARTSTORE',
        courierCode: 'LOTTE',
        courierName: null,
      }),
    ).toBe('HYUNDAI');
    expect(
      resolveProviderCourierCode({
        provider: 'SMARTSTORE',
        courierCode: null,
        courierName: '롯데택배',
      }),
    ).toBe('HYUNDAI');
  });
});

describe('resolveCommonCourierCode', () => {
  it('recognizes common aliases', () => {
    expect(resolveCommonCourierCode({ courierCode: 'CJ', courierName: null })).toBe('CJ');
    expect(resolveCommonCourierCode({ courierCode: null, courierName: 'CJ대한통운' })).toBe('CJ');
  });
});
