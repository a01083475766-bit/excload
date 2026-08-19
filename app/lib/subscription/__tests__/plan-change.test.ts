import { describe, it, expect } from 'vitest';
import {
  addBillingPeriod,
  resolveEffectivePlanAtRenewal,
  intervalKeyToDbPlan,
  PAID_MONTHLY_POINTS,
} from '../plan-change';

describe('plan-change', () => {
  it('PAID_MONTHLY_POINTS is 100_000 (PRO/YEARLY 월간 텍스트 변환 한도)', () => {
    expect(PAID_MONTHLY_POINTS).toBe(100_000);
  });

  it('intervalKeyToDbPlan', () => {
    expect(intervalKeyToDbPlan('monthly')).toBe('PRO');
    expect(intervalKeyToDbPlan('yearly')).toBe('YEARLY');
  });

  it('addBillingPeriod yearly adds one year', () => {
    const from = new Date('2026-01-15T00:00:00Z');
    const next = addBillingPeriod(from, 'YEARLY');
    expect(next.getFullYear()).toBe(2027);
  });

  it('resolveEffectivePlanAtRenewal applies pending when due', () => {
    const applyAt = new Date('2026-05-01T00:00:00Z');
    const asOf = new Date('2026-05-02T00:00:00Z');
    const r = resolveEffectivePlanAtRenewal('PRO', 'YEARLY', applyAt, asOf);
    expect(r.chargePlan).toBe('YEARLY');
    expect(r.clearPending).toBe(true);
  });

  it('resolveEffectivePlanAtRenewal keeps current when pending not due', () => {
    const applyAt = new Date('2026-06-01T00:00:00Z');
    const asOf = new Date('2026-05-02T00:00:00Z');
    const r = resolveEffectivePlanAtRenewal('PRO', 'YEARLY', applyAt, asOf);
    expect(r.chargePlan).toBe('PRO');
    expect(r.clearPending).toBe(false);
  });
});
