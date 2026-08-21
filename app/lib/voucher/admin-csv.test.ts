import { describe, expect, it } from 'vitest';
import {
  buildCsvWithBom,
  parseCsvText,
  sanitizeCsvCell,
  stripBom,
} from '@/app/lib/voucher/csv-parse';
import { buildIssuePreviewFromCsv } from '@/app/lib/voucher/admin-csv-issue';
import { pickInitialLifecycle } from '@/app/lib/voucher/resolve-entitlements';
import { ENTITLEMENT_LIFECYCLE } from '@/app/lib/voucher/constants';
import { getSafeCallbackPath } from '@/app/lib/auth/post-login-redirect';
import { canStartPaidCheckout, getEffectivePlanForPolicy } from '@/app/lib/open-beta-policy';
import { getOpenBetaEndsAt } from '@/app/lib/service-lifecycle';
import { isPaidDbPlan } from '@/app/lib/subscription/plan-change';

describe('csv-parse', () => {
  it('parses quotes, commas, newlines, BOM', () => {
    const text = '\uFEFF"a,b","line\n2"\n1,"x,y"\n';
    const { headers, rows } = parseCsvText(text);
    expect(headers).toEqual(['a,b', 'line\n2']);
    expect(rows[0]).toEqual(['1', 'x,y']);
  });

  it('sanitizes formula injection and adds BOM on export', () => {
    expect(sanitizeCsvCell('=cmd')).toBe("'=cmd");
    expect(buildCsvWithBom(['h'], [['+1']]).startsWith('\uFEFF')).toBe(true);
    expect(buildCsvWithBom(['h'], [['+1']]).includes("'+1")).toBe(true);
  });

  it('stripBom', () => {
    expect(stripBom('\uFEFFab')).toBe('ab');
  });
});

describe('csv issue preview mapping', () => {
  const csv = [
    '주문번호,리워드명,수량,금액',
    'ORD-1,3개월 슈퍼 얼리버드,2,8800',
    'ORD-2,12개월 와디즈 특별가,1,33000',
  ].join('\n');

  it('maps external names and expands quantity to unitIndex', () => {
    const preview = buildIssuePreviewFromCsv({
      csvText: csv,
      mapping: {
        externalOrderId: '주문번호',
        rewardKey: '리워드명',
        quantity: '수량',
        purchaseAmount: '금액',
      },
      rewardNameMap: {
        '3개월 슈퍼 얼리버드': 'policy-3m',
        '12개월 와디즈 특별가': 'policy-12',
      },
    });
    expect(preview.errors).toBe(0);
    expect(preview.estimatedCodes).toBe(3);
    expect(preview.units.map((u) => `${u.externalOrderId}#${u.unitIndex}`)).toEqual([
      'ORD-1#0',
      'ORD-1#1',
      'ORD-2#0',
    ]);
    expect(preview.units.every((u) => u.purchaseAmount !== 29000)).toBe(true);
  });

  it('blocks unmapped reward and empty order', () => {
    const bad = '주문번호,리워드명,수량\n,미매핑,1\n';
    const preview = buildIssuePreviewFromCsv({
      csvText: bad,
      mapping: { externalOrderId: '주문번호', rewardKey: '리워드명', quantity: '수량' },
      rewardNameMap: {},
    });
    expect(preview.errors).toBeGreaterThan(0);
  });
});

describe('phase1 regressions helpers', () => {
  it('blocks external callbackUrl', () => {
    expect(getSafeCallbackPath('https://evil.test')).toBeNull();
    expect(getSafeCallbackPath('/redeem/wadiz-2026-01')).toBe('/redeem/wadiz-2026-01');
  });

  it('BETA becomes FREE for policy after end; paid checkout opens', () => {
    const end = getOpenBetaEndsAt();
    expect(getEffectivePlanForPolicy('BETA', end)).toBe('FREE');
    expect(canStartPaidCheckout('FREE', end)).toBe(true);
    expect(canStartPaidCheckout('BETA', end)).toBe(true);
  });

  it('subscription gates stay on isPaidDbPlan', () => {
    expect(isPaidDbPlan('PRO')).toBe(true);
    expect(isPaidDbPlan('BETA')).toBe(false);
    expect(pickInitialLifecycle({ paidActive: true, hasBlockingPriorVoucher: false })).toBe(
      ENTITLEMENT_LIFECYCLE.WAITING_FOR_PAID_END,
    );
  });
});
