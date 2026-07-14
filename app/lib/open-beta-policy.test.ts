import { describe, expect, it } from 'vitest';
import {
  canStartPaidCheckout,
  getMonthlyGrantForPlan,
  getNewSignupPlan,
  getSignupBonusPoints,
  isOpenBetaMode,
  shouldChargeDownloadPointsForPlan,
} from '@/app/lib/open-beta-policy';

describe('open-beta-policy', () => {
  it('enables beta mode with BETA signup and 50000 points', () => {
    expect(isOpenBetaMode()).toBe(true);
    expect(getNewSignupPlan()).toBe('BETA');
    expect(getSignupBonusPoints()).toBe(50_000);
  });

  it('grants 50000 monthly reset for BETA during beta', () => {
    expect(getMonthlyGrantForPlan('BETA')).toEqual({
      amount: 50_000,
      reason: 'BETA플랜_월간사용량리셋지급',
      mode: 'reset',
    });
    expect(getMonthlyGrantForPlan('FREE')).toEqual({
      amount: 5_000,
      reason: 'FREE플랜_월간사용량리셋지급',
      mode: 'reset',
    });
    expect(getMonthlyGrantForPlan('PRO')).toBeNull();
  });

  it('does not charge download for FREE/BETA during beta', () => {
    expect(shouldChargeDownloadPointsForPlan('FREE', false)).toBe(false);
    expect(shouldChargeDownloadPointsForPlan('BETA', false)).toBe(false);
    expect(shouldChargeDownloadPointsForPlan('PRO', true)).toBe(false);
  });

  it('blocks new paid checkout for FREE/BETA but allows existing paid', () => {
    expect(canStartPaidCheckout('FREE')).toBe(false);
    expect(canStartPaidCheckout('BETA')).toBe(false);
    expect(canStartPaidCheckout('PRO')).toBe(true);
    expect(canStartPaidCheckout('YEARLY')).toBe(true);
  });
});
