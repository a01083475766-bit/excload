import { describe, expect, it } from 'vitest';
import {
  formatAuthorizationDate,
  parseAuthorizationPeriodInput,
  resolveAuthorizationPeriodNotice,
} from './authorization-period';

/** KST 특정 날짜의 정오 시각을 now로 사용(경계 흔들림 방지). */
function kstNoon(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0)); // 12:00 KST = 03:00 UTC
}

/** @db.Date에서 온 값처럼 UTC 자정 Date를 만든다(날짜만). */
function dbDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

describe('parseAuthorizationPeriodInput', () => {
  it('시작일·종료일 정상 저장', () => {
    const r = parseAuthorizationPeriodInput({ start: '2027-01-14', end: '2027-01-27' });
    expect(r.ok).toBe(true);
    if (r.ok && !r.value.clear) {
      expect(formatAuthorizationDate(r.value.start)).toBe('2027-01-14');
      expect(formatAuthorizationDate(r.value.end)).toBe('2027-01-27');
    }
  });

  it('둘 다 비면 삭제(clear)', () => {
    const r = parseAuthorizationPeriodInput({ start: '', end: '' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.clear).toBe(true);
    const r2 = parseAuthorizationPeriodInput({ start: null, end: null });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value.clear).toBe(true);
  });

  it('시작일만 또는 종료일만 입력하면 차단', () => {
    expect(parseAuthorizationPeriodInput({ start: '2027-01-14', end: '' }).ok).toBe(false);
    expect(parseAuthorizationPeriodInput({ start: '', end: '2027-01-27' }).ok).toBe(false);
  });

  it('종료일이 시작일보다 빠르면 차단', () => {
    expect(parseAuthorizationPeriodInput({ start: '2027-01-27', end: '2027-01-14' }).ok).toBe(false);
  });

  it('잘못된 날짜 형식 차단', () => {
    expect(parseAuthorizationPeriodInput({ start: '2027-02-30', end: '2027-03-01' }).ok).toBe(false);
    expect(parseAuthorizationPeriodInput({ start: '20270114', end: '2027-01-27' }).ok).toBe(false);
  });

  it('입력 2027-01-14 → 저장(UTC 자정) → 재포맷 2027-01-14 (하루 이동 없음)', () => {
    const r = parseAuthorizationPeriodInput({ start: '2027-01-14', end: '2027-01-14' });
    expect(r.ok).toBe(true);
    if (r.ok && !r.value.clear) {
      // 저장값은 UTC 자정이어야 @db.Date에서 날짜가 밀리지 않는다.
      expect(r.value.start.toISOString()).toBe('2027-01-14T00:00:00.000Z');
      expect(formatAuthorizationDate(r.value.start)).toBe('2027-01-14');
    }
  });
});

describe('날짜 저장/포맷 타임존 불변', () => {
  it('formatAuthorizationDate는 UTC 파트만 사용해 서버 타임존과 무관', () => {
    // @db.Date는 UTC 자정 Date로 반환됨. 어떤 서버 타임존이든 같은 문자열이어야 한다.
    expect(formatAuthorizationDate(dbDate('2027-01-14'))).toBe('2027-01-14');
    expect(formatAuthorizationDate(new Date('2027-01-14T00:00:00.000Z'))).toBe('2027-01-14');
  });
});

describe('resolveAuthorizationPeriodNotice', () => {
  it('기간 미등록 → NONE', () => {
    const n = resolveAuthorizationPeriodNotice({ periodStart: null, periodEnd: null });
    expect(n.state).toBe('NONE');
    expect(n.level).toBe('none');
  });

  it('D-31 NONE / D-30 UPCOMING(info)', () => {
    const args = { periodStart: dbDate('2027-02-15'), periodEnd: dbDate('2027-02-28') };
    const d31 = resolveAuthorizationPeriodNotice({ ...args, now: kstNoon('2027-01-15') }); // 31일 전
    expect(d31.state).toBe('NONE');
    const d30 = resolveAuthorizationPeriodNotice({ ...args, now: kstNoon('2027-01-16') }); // 30일 전
    expect(d30.state).toBe('UPCOMING');
    expect(d30.level).toBe('info');
    expect(d30.daysUntilStart).toBe(30);
  });

  it('강조 단계: D-8 info / D-7 notice / D-2 notice / D-1 important', () => {
    const args = { periodStart: dbDate('2027-02-15'), periodEnd: dbDate('2027-02-28') };
    expect(resolveAuthorizationPeriodNotice({ ...args, now: kstNoon('2027-02-07') }).level).toBe('info'); // D-8
    expect(resolveAuthorizationPeriodNotice({ ...args, now: kstNoon('2027-02-08') }).level).toBe('notice'); // D-7
    expect(resolveAuthorizationPeriodNotice({ ...args, now: kstNoon('2027-02-13') }).level).toBe('notice'); // D-2
    expect(resolveAuthorizationPeriodNotice({ ...args, now: kstNoon('2027-02-14') }).level).toBe('important'); // D-1
  });

  it('시작일 당일·종료일 당일 IN_PERIOD, 종료 다음 날부터 ENDED', () => {
    const args = { periodStart: dbDate('2027-02-15'), periodEnd: dbDate('2027-02-28') };
    expect(resolveAuthorizationPeriodNotice({ ...args, now: kstNoon('2027-02-15') }).state).toBe('IN_PERIOD');
    expect(resolveAuthorizationPeriodNotice({ ...args, now: kstNoon('2027-02-20') }).level).toBe('important');
    expect(resolveAuthorizationPeriodNotice({ ...args, now: kstNoon('2027-02-28') }).state).toBe('IN_PERIOD'); // 종료일 당일
    const ended = resolveAuthorizationPeriodNotice({ ...args, now: kstNoon('2027-03-01') }); // 종료 다음 날
    expect(ended.state).toBe('ENDED');
    expect(ended.level).toBe('check');
  });

  it('KST 자정 경계: UTC 15:00을 기준으로 오늘 날짜가 바뀐다', () => {
    const args = { periodStart: dbDate('2027-02-15'), periodEnd: dbDate('2027-02-28') };
    // 2027-01-15 14:30 UTC = 2027-01-15 23:30 KST → 오늘=1/15 → 시작 31일 전 → NONE
    const beforeMidnight = resolveAuthorizationPeriodNotice({
      ...args,
      now: new Date(Date.UTC(2027, 0, 15, 14, 30)),
    });
    expect(beforeMidnight.state).toBe('NONE');
    // 2027-01-15 15:30 UTC = 2027-01-16 00:30 KST → 오늘=1/16 → 30일 전 → UPCOMING
    const afterMidnight = resolveAuthorizationPeriodNotice({
      ...args,
      now: new Date(Date.UTC(2027, 0, 15, 15, 30)),
    });
    expect(afterMidnight.state).toBe('UPCOMING');
    expect(afterMidnight.daysUntilStart).toBe(30);
  });
});
