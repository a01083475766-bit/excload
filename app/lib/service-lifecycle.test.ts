import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPEN_BETA_ENDS_AT_ISO,
  getOpenBetaEndsAt,
  isBeforeOpenBetaEnd,
} from '@/app/lib/service-lifecycle';
import {
  getEffectivePlanForPolicy,
  getMonthlyGrantForPlan,
  getNewSignupPlan,
  isOpenBetaMode,
  shouldChargeDownloadPointsForPlan,
} from '@/app/lib/open-beta-policy';

describe('service-lifecycle / open-beta date SSOT', () => {
  const endsAt = getOpenBetaEndsAt();

  it('uses default end instant when env unset', () => {
    expect(endsAt.toISOString()).toBe(new Date(DEFAULT_OPEN_BETA_ENDS_AT_ISO).toISOString());
  });

  it('is open beta just before end', () => {
    const justBefore = new Date(endsAt.getTime() - 1);
    expect(isBeforeOpenBetaEnd(justBefore)).toBe(true);
    expect(isOpenBetaMode(justBefore)).toBe(true);
    expect(getNewSignupPlan(justBefore)).toBe('BETA');
  });

  it('ends exactly at end instant (end-exclusive)', () => {
    expect(isBeforeOpenBetaEnd(endsAt)).toBe(false);
    expect(isOpenBetaMode(endsAt)).toBe(false);
    expect(getNewSignupPlan(endsAt)).toBe('FREE');
  });

  it('treats existing BETA plan as FREE after end without DB rewrite', () => {
    expect(getEffectivePlanForPolicy('BETA', endsAt)).toBe('FREE');
    expect(getMonthlyGrantForPlan('BETA', endsAt)?.amount).toBe(5_000);
    expect(shouldChargeDownloadPointsForPlan('BETA', false, endsAt)).toBe(true);
  });

  it('keeps beta download free before end', () => {
    const before = new Date(endsAt.getTime() - 1);
    expect(shouldChargeDownloadPointsForPlan('BETA', false, before)).toBe(false);
    expect(getMonthlyGrantForPlan('BETA', before)?.amount).toBe(50_000);
  });
});
