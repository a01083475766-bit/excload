import { describe, it, expect } from 'vitest';
import {
  SUBSCRIPTION_GRACE_DAYS,
  isPastDueStatus,
  paymentFailureClearData,
} from '../payment-failure';

describe('payment-failure', () => {
  it('isPastDueStatus', () => {
    expect(isPastDueStatus('past_due')).toBe(true);
    expect(isPastDueStatus('active')).toBe(false);
    expect(isPastDueStatus(null)).toBe(false);
  });

  it('paymentFailureClearData resets fields', () => {
    expect(paymentFailureClearData()).toEqual({
      subscriptionStatus: 'active',
      paymentFailedAt: null,
      paymentFailureReason: null,
      paymentRetryCount: 0,
      gracePeriodUntil: null,
    });
  });

  it('grace period is 3 days', () => {
    expect(SUBSCRIPTION_GRACE_DAYS).toBe(3);
  });
});
