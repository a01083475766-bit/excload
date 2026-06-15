import { describe, expect, it } from 'vitest';
import { isMonthlyGrantDue } from '@/app/lib/grant-monthly-points-core';

describe('isMonthlyGrantDue', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  it('nextPointDate가 없으면 지급 대상', () => {
    expect(isMonthlyGrantDue({ nextPointDate: null }, now)).toBe(true);
  });

  it('nextPointDate가 과거면 지급 대상', () => {
    expect(
      isMonthlyGrantDue({ nextPointDate: new Date('2026-06-01T00:00:00.000Z') }, now),
    ).toBe(true);
  });

  it('nextPointDate가 미래면 지급 대상 아님', () => {
    expect(
      isMonthlyGrantDue({ nextPointDate: new Date('2026-07-01T00:00:00.000Z') }, now),
    ).toBe(false);
  });
});
