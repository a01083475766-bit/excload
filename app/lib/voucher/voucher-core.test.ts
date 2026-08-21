import { describe, expect, it, beforeAll } from 'vitest';
import {
  generateVoucherCodePlaintext,
  hashVoucherCode,
  normalizeVoucherCodeInput,
  safeEqualHex,
  voucherCodeLast4,
} from '@/app/lib/voucher/code-crypto';
import { pickInitialLifecycle, computeReadyWindow } from '@/app/lib/voucher/resolve-entitlements';
import { ENTITLEMENT_LIFECYCLE } from '@/app/lib/voucher/constants';
import { getSafeCallbackPath } from '@/app/lib/auth/post-login-redirect';
import { seoulWallTimeToUtc } from '@/app/lib/voucher/calendar-months-seoul';

describe('voucher code crypto', () => {
  beforeAll(() => {
    process.env.VOUCHER_CODE_HMAC_SECRET = 'test-voucher-hmac-secret-32chars-min!!';
  });

  it('generates high-entropy grouped codes', () => {
    const a = generateVoucherCodePlaintext();
    const b = generateVoucherCodePlaintext();
    expect(a).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);
    expect(a).not.toBe(b);
  });

  it('hashes normalized input stably', () => {
    const h1 = hashVoucherCode('abcd-efgh-ijkl-mnop');
    const h2 = hashVoucherCode('ABCD EFGH IJKL MNOP');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
    expect(voucherCodeLast4('ABCD-EFGH-IJKL-MNOP')).toBe('MNOP');
  });

  it('timing-safe compares hashes', () => {
    const h = hashVoucherCode('TESTCODE12345678');
    expect(safeEqualHex(h, h)).toBe(true);
    expect(safeEqualHex(h, hashVoucherCode('OTHERCODE1234567'))).toBe(false);
  });

  it('normalize strips separators', () => {
    expect(normalizeVoucherCodeInput(' ab-cd ')).toBe('ABCD');
  });
});

describe('entitlement lifecycle helpers', () => {
  it('picks WAITING_FOR_PAID_END when paid', () => {
    expect(pickInitialLifecycle({ paidActive: true, hasBlockingPriorVoucher: false })).toBe(
      ENTITLEMENT_LIFECYCLE.WAITING_FOR_PAID_END,
    );
  });

  it('picks prior wait when another voucher blocks', () => {
    expect(pickInitialLifecycle({ paidActive: false, hasBlockingPriorVoucher: true })).toBe(
      ENTITLEMENT_LIFECYCLE.WAITING_FOR_PRIOR_VOUCHER,
    );
  });

  it('READY window uses max(redeemedAt, serviceGaAt)', () => {
    const ga = seoulWallTimeToUtc({
      year: 2026,
      month: 10,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
    const early = new Date(ga.getTime() - 86400000);
    const { startsAt, endsAt } = computeReadyWindow({
      redeemedAt: early,
      serviceGaAt: ga,
      durationMonths: 3,
    });
    expect(startsAt.getTime()).toBe(ga.getTime());
    expect(endsAt.getTime()).toBeGreaterThan(startsAt.getTime());
  });
});

describe('redeem callback safety', () => {
  it('allows relative redeem paths only', () => {
    expect(getSafeCallbackPath('/redeem/wadiz-2026-01')).toBe('/redeem/wadiz-2026-01');
    expect(getSafeCallbackPath('https://evil.example/')).toBeNull();
    expect(getSafeCallbackPath('//evil.example/')).toBeNull();
  });
});
