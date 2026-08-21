import { describe, expect, it } from 'vitest';
import {
  canStartPaidCheckout,
  getMonthlyGrantForPlan,
  getNewSignupPlan,
  getSignupBonusPoints,
  isOpenBetaMode,
  shouldChargeDownloadPointsForPlan,
} from '@/app/lib/open-beta-policy';
import { getOpenBetaEndsAt } from '@/app/lib/service-lifecycle';

describe('open-beta-policy (date-aware)', () => {
  const beforeEnd = new Date(getOpenBetaEndsAt().getTime() - 1);

  it('enables beta mode with BETA signup and 50000 points before end', () => {
    expect(isOpenBetaMode(beforeEnd)).toBe(true);
    expect(getNewSignupPlan(beforeEnd)).toBe('BETA');
    expect(getSignupBonusPoints(beforeEnd)).toBe(50_000);
  });

  it('grants 50000 monthly reset for BETA during beta', () => {
    expect(getMonthlyGrantForPlan('BETA', beforeEnd)).toEqual({
      amount: 50_000,
      reason: 'BETA플랜_월간사용량리셋지급',
      mode: 'reset',
    });
    expect(getMonthlyGrantForPlan('FREE', beforeEnd)).toEqual({
      amount: 5_000,
      reason: 'FREE플랜_월간사용량리셋지급',
      mode: 'reset',
    });
    expect(getMonthlyGrantForPlan('PRO', beforeEnd)).toBeNull();
  });

  it('does not charge download for FREE/BETA during beta', () => {
    expect(shouldChargeDownloadPointsForPlan('FREE', false, beforeEnd)).toBe(false);
    expect(shouldChargeDownloadPointsForPlan('BETA', false, beforeEnd)).toBe(false);
    expect(shouldChargeDownloadPointsForPlan('PRO', true, beforeEnd)).toBe(false);
  });

  it('blocks new paid checkout for FREE/BETA but allows existing paid during beta', () => {
    expect(canStartPaidCheckout('FREE', beforeEnd)).toBe(false);
    expect(canStartPaidCheckout('BETA', beforeEnd)).toBe(false);
    expect(canStartPaidCheckout('PRO', beforeEnd)).toBe(true);
    expect(canStartPaidCheckout('YEARLY', beforeEnd)).toBe(true);
  });
});
