import { describe, expect, it } from 'vitest';
import { presetRangeDates } from './order-fetch-range';
import { buildOrderFetchRequestBody } from './order-fetch-request';

const NOW = new Date('2026-07-18T06:00:00.000Z'); // 2026-07-18 15:00 KST

describe('buildOrderFetchRequestBody', () => {
  it.each([
    [1, '2026-07-18'],
    [3, '2026-07-16'],
    [7, '2026-07-12'],
    [14, '2026-07-05'],
    [30, '2026-06-19'],
  ])('스마트스토어 최근 %i일 프리셋은 표시된 KST 날짜 범위를 그대로 전송한다', (days, from) => {
    const range = presetRangeDates(days, NOW);
    expect(range).toEqual({ start: from, end: '2026-07-18' });
    expect(
      buildOrderFetchRequestBody({
        mallId: 'smartstore',
        days,
        from: range.start,
        to: range.end,
      }),
    ).toEqual({ from, to: '2026-07-18' });
  });

  it('다른 쇼핑몰은 기존 days 요청을 유지한다', () => {
    expect(
      buildOrderFetchRequestBody({
        mallId: 'coupang',
        days: 7,
        from: '2026-07-12',
        to: '2026-07-18',
      }),
    ).toEqual({ days: 7 });
  });
});
