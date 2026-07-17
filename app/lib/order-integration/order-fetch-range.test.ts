import { describe, expect, it } from 'vitest';
import {
  getOrderFetchRangeError,
  isDateRangeSupportedMall,
  kstDateStringDaysAgo,
  kstTodayDateString,
  MAX_FETCH_RANGE_DAYS,
  OrderFetchRangeError,
  presetRangeDates,
  resolveOrderFetchRange,
} from '@/app/lib/order-integration/order-fetch-range';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const FIXED_NOW = new Date('2026-07-16T12:00:00.000+09:00');

function kstStart(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d, 0, 0, 0, 0) - KST_OFFSET_MS;
}
function kstEnd(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d, 23, 59, 59, 999) - KST_OFFSET_MS;
}

describe('isDateRangeSupportedMall', () => {
  it('스마트스토어만 날짜 범위를 지원한다', () => {
    expect(isDateRangeSupportedMall('smartstore')).toBe(true);
    expect(isDateRangeSupportedMall('coupang')).toBe(false);
    expect(isDateRangeSupportedMall('eleven')).toBe(false);
  });
});

describe('kstTodayDateString', () => {
  it('now를 KST 날짜 문자열로 반환한다', () => {
    expect(kstTodayDateString(FIXED_NOW)).toBe('2026-07-16');
    // UTC 23:30 → KST 다음날 08:30
    expect(kstTodayDateString(new Date('2026-07-16T23:30:00.000Z'))).toBe('2026-07-17');
  });
});

describe('kstDateStringDaysAgo', () => {
  it('오늘 기준 N일 전 날짜(월 경계 포함)를 반환한다', () => {
    expect(kstDateStringDaysAgo(0, FIXED_NOW)).toBe('2026-07-16');
    expect(kstDateStringDaysAgo(6, FIXED_NOW)).toBe('2026-07-10');
    // 월 경계
    expect(kstDateStringDaysAgo(16, FIXED_NOW)).toBe('2026-06-30');
  });
});

describe('presetRangeDates', () => {
  it('오늘 포함 최근 N일의 시작·종료를 반환한다', () => {
    expect(presetRangeDates(1, FIXED_NOW)).toEqual({ start: '2026-07-16', end: '2026-07-16' });
    expect(presetRangeDates(7, FIXED_NOW)).toEqual({ start: '2026-07-10', end: '2026-07-16' });
    expect(presetRangeDates(30, FIXED_NOW)).toEqual({ start: '2026-06-17', end: '2026-07-16' });
  });
});

describe('getOrderFetchRangeError', () => {
  it('정상 범위는 null', () => {
    expect(getOrderFetchRangeError({ from: '2026-07-01', to: '2026-07-05', now: FIXED_NOW })).toBeNull();
  });

  it('형식이 잘못되면 메시지', () => {
    expect(getOrderFetchRangeError({ from: '2026/07/01', to: '2026-07-05', now: FIXED_NOW })).toMatch(/시작일/);
    expect(getOrderFetchRangeError({ from: '2026-07-01', to: '2026-13-05', now: FIXED_NOW })).toMatch(/종료일/);
    expect(getOrderFetchRangeError({ from: '2026-02-30', to: '2026-03-01', now: FIXED_NOW })).toMatch(/시작일/);
  });

  it('미래 날짜는 거부', () => {
    expect(getOrderFetchRangeError({ from: '2026-07-17', to: '2026-07-17', now: FIXED_NOW })).toMatch(/미래/);
    expect(getOrderFetchRangeError({ from: '2026-07-10', to: '2026-07-17', now: FIXED_NOW })).toMatch(/미래/);
  });

  it('종료일이 시작일보다 빠르면 거부', () => {
    expect(getOrderFetchRangeError({ from: '2026-07-05', to: '2026-07-01', now: FIXED_NOW })).toMatch(/빠를/);
  });

  it('최대 30일(포함) 경계', () => {
    // 2026-06-17 ~ 2026-07-16 = 30일 → 허용
    expect(getOrderFetchRangeError({ from: '2026-06-17', to: '2026-07-16', now: FIXED_NOW })).toBeNull();
    // 2026-06-16 ~ 2026-07-16 = 31일 → 거부
    expect(getOrderFetchRangeError({ from: '2026-06-16', to: '2026-07-16', now: FIXED_NOW })).toMatch(
      new RegExp(`${MAX_FETCH_RANGE_DAYS}일`),
    );
  });
});

describe('resolveOrderFetchRange', () => {
  it('과거 범위는 시작 00:00:00, 종료 23:59:59.999', () => {
    const { fromMs, toMs } = resolveOrderFetchRange({ from: '2026-07-01', to: '2026-07-05', now: FIXED_NOW });
    expect(fromMs).toBe(kstStart(2026, 7, 1));
    expect(toMs).toBe(kstEnd(2026, 7, 5));
  });

  it('종료일이 오늘이면 종료 시각은 now', () => {
    const { fromMs, toMs } = resolveOrderFetchRange({ from: '2026-07-10', to: '2026-07-16', now: FIXED_NOW });
    expect(fromMs).toBe(kstStart(2026, 7, 10));
    expect(toMs).toBe(FIXED_NOW.getTime());
  });

  it('검증 실패 시 OrderFetchRangeError를 던진다', () => {
    expect(() => resolveOrderFetchRange({ from: '2026-07-05', to: '2026-07-01', now: FIXED_NOW })).toThrow(
      OrderFetchRangeError,
    );
  });
});
