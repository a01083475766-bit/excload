import { describe, expect, it } from 'vitest';
import { isTextConvertUsageExemptEmail } from '@/app/lib/text-convert-usage-exempt';

describe('isTextConvertUsageExemptEmail', () => {
  it('matches the exempt account regardless of case or surrounding spaces', () => {
    expect(isTextConvertUsageExemptEmail('ksl3339@naver.com')).toBe(true);
    expect(isTextConvertUsageExemptEmail('  KSL3339@naver.com  ')).toBe(true);
    expect(isTextConvertUsageExemptEmail('ksl3399@naver.com')).toBe(false);
  });

  it('does not match other accounts', () => {
    expect(isTextConvertUsageExemptEmail('other@naver.com')).toBe(false);
    expect(isTextConvertUsageExemptEmail(null)).toBe(false);
    expect(isTextConvertUsageExemptEmail(undefined)).toBe(false);
    expect(isTextConvertUsageExemptEmail('')).toBe(false);
  });
});
