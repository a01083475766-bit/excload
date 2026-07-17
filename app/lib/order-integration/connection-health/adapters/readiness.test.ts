import { afterEach, describe, expect, it } from 'vitest';
import {
  clearHealthAdaptersForTest,
  getProviderReadiness,
  isProviderAutoCheckable,
  registerHealthAdapter,
} from '../provider-health-registry';
import { smartstoreHealthAdapter } from './smartstore';
import { coupangHealthAdapter } from './coupang';
import { elevenHealthAdapter } from './eleven';
import { cafe24HealthAdapter } from './cafe24';
import { lotteonHealthAdapter } from './lotteon';
import { ssgHealthAdapter } from './ssg';
import { cjonstyleHealthAdapter } from './cjonstyle';
import { shopbyHealthAdapter } from './shopby';
import { godomallHealthAdapter } from './godomall';
import { makeshopHealthAdapter } from './makeshop';

afterEach(() => clearHealthAdaptersForTest());

describe('provider readiness', () => {
  it('실계정/공식 사양이 확인된 몰은 VERIFIED, CJ온스타일은 PROVISIONAL', () => {
    expect(smartstoreHealthAdapter.readiness).toBe('VERIFIED');
    expect(coupangHealthAdapter.readiness).toBe('VERIFIED');
    expect(elevenHealthAdapter.readiness).toBe('VERIFIED');
    expect(cafe24HealthAdapter.readiness).toBe('VERIFIED');
    expect(lotteonHealthAdapter.readiness).toBe('VERIFIED');
    expect(ssgHealthAdapter.readiness).toBe('VERIFIED');
    expect(shopbyHealthAdapter.readiness).toBe('VERIFIED');
    expect(godomallHealthAdapter.readiness).toBe('VERIFIED');
    expect(makeshopHealthAdapter.readiness).toBe('VERIFIED');
    // placeholder 스펙 → 운영 자동 확인 제외
    expect(cjonstyleHealthAdapter.readiness).toBe('PROVISIONAL');
  });

  it('isProviderAutoCheckable은 VERIFIED만 true (PROVISIONAL·미등록 제외)', () => {
    registerHealthAdapter(smartstoreHealthAdapter);
    registerHealthAdapter(cjonstyleHealthAdapter);

    expect(getProviderReadiness('SMARTSTORE')).toBe('VERIFIED');
    expect(isProviderAutoCheckable('SMARTSTORE')).toBe(true);

    expect(getProviderReadiness('CJONSTYLE')).toBe('PROVISIONAL');
    expect(isProviderAutoCheckable('CJONSTYLE')).toBe(false);

    // 미등록 provider는 자동 확인 대상 아님
    expect(getProviderReadiness('MAKESHOP')).toBeNull();
    expect(isProviderAutoCheckable('MAKESHOP')).toBe(false);
  });
});
