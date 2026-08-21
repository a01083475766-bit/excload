/**
 * Asia/Seoul 달력 기준 개월 가산.
 * 저장은 UTC instant. 시작 포함·종료 제외(now < endsAt)와 함께 사용.
 */

const SEOUL = 'Asia/Seoul';

type SeoulParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

/** Instant → Seoul wall-clock parts */
export function getSeoulParts(date: Date): SeoulParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: SEOUL,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => {
    const v = parts.find((p) => p.type === type)?.value;
    if (!v) throw new Error(`Missing datetime part: ${type}`);
    return Number(v);
  };
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
    millisecond: date.getUTCMilliseconds(),
  };
}

/**
 * Seoul wall-clock → UTC Date.
 * 해당 시각의 KST 오프셋을 포맷터로 구해 변환.
 */
export function seoulWallTimeToUtc(parts: SeoulParts): Date {
  const isoLocal = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}.${pad(parts.millisecond, 3)}`;
  // Asia/Seoul has no DST; offset is +09:00 year-round
  return new Date(`${isoLocal}+09:00`);
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/** Seoul 기준 N개월 가산 (월말 clamp, 시·분·초 유지) */
export function addCalendarMonthsSeoul(from: Date, months: number): Date {
  if (!Number.isInteger(months) || months < 0) {
    throw new Error('months must be a non-negative integer');
  }
  const p = getSeoulParts(from);
  const totalMonths = p.year * 12 + (p.month - 1) + months;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  const dim = daysInMonth(year, month);
  const day = Math.min(p.day, dim);
  return seoulWallTimeToUtc({
    year,
    month,
    day,
    hour: p.hour,
    minute: p.minute,
    second: p.second,
    millisecond: p.millisecond,
  });
}

/** startsAt <= now < endsAt */
export function isWithinHalfOpenRange(
  now: Date,
  startsAt: Date | null | undefined,
  endsAt: Date | null | undefined,
): boolean {
  if (!startsAt || !endsAt) return false;
  const t = now.getTime();
  return startsAt.getTime() <= t && t < endsAt.getTime();
}
