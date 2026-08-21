import { describe, expect, it } from 'vitest';
import {
  addCalendarMonthsSeoul,
  getSeoulParts,
  isWithinHalfOpenRange,
  seoulWallTimeToUtc,
} from '@/app/lib/voucher/calendar-months-seoul';

describe('addCalendarMonthsSeoul', () => {
  it('adds 3 months keeping Seoul wall time', () => {
    const start = seoulWallTimeToUtc({
      year: 2026,
      month: 10,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
    const end = addCalendarMonthsSeoul(start, 3);
    const p = getSeoulParts(end);
    expect(p).toMatchObject({ year: 2027, month: 1, day: 1, hour: 0, minute: 0, second: 0 });
  });

  it('clamps Jan 31 + 1 month to Feb end (non-leap)', () => {
    const start = seoulWallTimeToUtc({
      year: 2025,
      month: 1,
      day: 31,
      hour: 15,
      minute: 30,
      second: 0,
      millisecond: 0,
    });
    const end = addCalendarMonthsSeoul(start, 1);
    const p = getSeoulParts(end);
    expect(p.year).toBe(2025);
    expect(p.month).toBe(2);
    expect(p.day).toBe(28);
    expect(p.hour).toBe(15);
    expect(p.minute).toBe(30);
  });

  it('clamps Jan 31 + 1 month to Feb 29 on leap year', () => {
    const start = seoulWallTimeToUtc({
      year: 2024,
      month: 1,
      day: 31,
      hour: 9,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
    const end = addCalendarMonthsSeoul(start, 1);
    const p = getSeoulParts(end);
    expect(p).toMatchObject({ year: 2024, month: 2, day: 29, hour: 9 });
  });

  it('half-open range includes start excludes end', () => {
    const start = seoulWallTimeToUtc({
      year: 2026,
      month: 10,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
    const end = addCalendarMonthsSeoul(start, 12);
    expect(isWithinHalfOpenRange(start, start, end)).toBe(true);
    expect(isWithinHalfOpenRange(end, start, end)).toBe(false);
    expect(isWithinHalfOpenRange(new Date(end.getTime() - 1), start, end)).toBe(true);
  });
});
