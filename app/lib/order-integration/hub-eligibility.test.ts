import { describe, expect, it } from 'vitest';

import { isRowHubEligible } from '@/app/lib/order-integration/hub-eligibility';

describe('isRowHubEligible', () => {
  it('requires true for coupang/lotteon/cafe24 and allows undefined for others', () => {
    expect(isRowHubEligible({ mallId: 'coupang', hubEligible: true })).toBe(true);
    expect(isRowHubEligible({ mallId: 'coupang', hubEligible: undefined })).toBe(false);
    expect(isRowHubEligible({ mallId: 'lotteon', hubEligible: true })).toBe(true);
    expect(isRowHubEligible({ mallId: 'cafe24', hubEligible: true })).toBe(true);
    expect(isRowHubEligible({ mallId: 'cafe24', hubEligible: false })).toBe(false);
    expect(isRowHubEligible({ mallId: 'cafe24', hubEligible: undefined })).toBe(false);
    expect(isRowHubEligible({ mallId: 'smartstore', hubEligible: undefined })).toBe(true);
    expect(isRowHubEligible({ mallId: 'eleven', hubEligible: undefined })).toBe(true);
  });
});
