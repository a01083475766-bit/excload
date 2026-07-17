/**
 * 쇼핑몰 "인증기간"(예: 네이버 커머스API센터에 표시된 인증기간)을 사용자가 직접 등록·관리하기 위한
 * 순수 로직 모음. 자동 조회 값이 아니며, 토큰/키 만료(expiresAt) 및 실제 연결 상태(healthStatus)와
 * 완전히 분리한다. 날짜만 다루고(KST 기준) 시간은 저장/판정에 사용하지 않는다.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

type DateParts = { year: number; month: number; day: number };

function parseDateParts(value: unknown): DateParts | null {
  if (typeof value !== 'string') return null;
  const match = DATE_PATTERN.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/**
 * 저장용 값: 달력 날짜의 UTC 자정 Date.
 * Prisma @db.Date(PostgreSQL DATE)는 이 값을 시간 없이 그대로 저장/반환하므로
 * 서버 타임존과 무관하게 입력한 날짜(YYYY-MM-DD)가 그대로 유지된다.
 */
function utcMidnight(parts: DateParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

/** 달력 날짜를 정수 day 번호로(자정 UTC epoch / 하루). 타임존 영향 없이 날짜만 비교하기 위함. */
function dayNumberUtc(parts: DateParts): number {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS);
}

/** @db.Date에서 온 Date(=UTC 자정)의 달력 날짜 파트. */
function utcDatePartsOf(date: Date): DateParts {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** 현재 시각을 KST 달력 날짜 파트로. 서버가 UTC여도 한국 날짜 기준 유지. */
function kstDatePartsOf(now: Date): DateParts {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return { year: kst.getUTCFullYear(), month: kst.getUTCMonth() + 1, day: kst.getUTCDate() };
}

/**
 * 저장된 Date(@db.Date, UTC 자정)를 YYYY-MM-DD로. UTC 파트만 사용하므로
 * 서버/클라이언트 타임존과 무관하게 저장한 날짜 그대로 반환한다.
 */
export function formatAuthorizationDate(date: Date | null | undefined): string | null {
  if (!date) return null;
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export type AuthorizationPeriodInput = {
  /** YYYY-MM-DD (KST). null/미지정은 "삭제" 의도로 본다. */
  start?: unknown;
  end?: unknown;
};

export type AuthorizationPeriodParsed =
  | { clear: true }
  | { clear: false; start: Date; end: Date };

/**
 * 인증기간 입력을 검증한다. 시작·종료를 함께 다루며, 시간은 받지 않는다.
 * - 둘 다 비었으면(빈 문자열/null) 삭제(clear) 의도로 처리
 * - 하나만 입력되면 오류
 * - 종료일이 시작일보다 빠르면 오류
 * 미래 날짜는 허용한다(인증기간은 미래일 수 있음).
 * 성공 시 파싱 결과, 실패 시 사용자 메시지를 반환한다.
 */
export function parseAuthorizationPeriodInput(
  input: AuthorizationPeriodInput,
): { ok: true; value: AuthorizationPeriodParsed } | { ok: false; error: string } {
  const rawStart = typeof input.start === 'string' ? input.start.trim() : input.start == null ? '' : input.start;
  const rawEnd = typeof input.end === 'string' ? input.end.trim() : input.end == null ? '' : input.end;

  const startEmpty = rawStart === '' || rawStart == null;
  const endEmpty = rawEnd === '' || rawEnd == null;

  if (startEmpty && endEmpty) {
    return { ok: true, value: { clear: true } };
  }
  if (startEmpty || endEmpty) {
    return { ok: false, error: '인증 시작일과 종료일을 함께 입력해 주세요.' };
  }

  const start = parseDateParts(rawStart);
  const end = parseDateParts(rawEnd);
  if (!start) return { ok: false, error: '인증 시작일을 올바른 날짜로 입력해 주세요.' };
  if (!end) return { ok: false, error: '인증 종료일을 올바른 날짜로 입력해 주세요.' };

  if (dayNumberUtc(end) < dayNumberUtc(start)) {
    return { ok: false, error: '인증 종료일은 시작일보다 빠를 수 없습니다.' };
  }

  return { ok: true, value: { clear: false, start: utcMidnight(start), end: utcMidnight(end) } };
}

export type AuthorizationPeriodState = 'NONE' | 'UPCOMING' | 'IN_PERIOD' | 'ENDED';

/**
 * 안내 강조 수준.
 * - none: 표시 안 함
 * - info: 일반 안내(시작 30~8일 전)
 * - notice: 주의(시작 7~2일 전)
 * - important: 중요(시작 1일 전 · 기간 중)
 * - check: 확인 필요(종료 후)
 */
export type AuthorizationPeriodLevel = 'none' | 'info' | 'notice' | 'important' | 'check';

export type AuthorizationPeriodNotice = {
  state: AuthorizationPeriodState;
  level: AuthorizationPeriodLevel;
  /** 오늘(KST)부터 시작일까지 남은 일수(과거면 음수). 미등록/판정불가면 null. */
  daysUntilStart: number | null;
  /** 오늘(KST)부터 종료일까지 남은 일수(과거면 음수). */
  daysUntilEnd: number | null;
  startDate: string | null;
  endDate: string | null;
  title: string;
  description: string;
};

/** 시작 30일 전부터 안내를 시작한다. */
export const AUTHORIZATION_NOTICE_LEAD_DAYS = 30;

const EMPTY_NOTICE: AuthorizationPeriodNotice = {
  state: 'NONE',
  level: 'none',
  daysUntilStart: null,
  daysUntilEnd: null,
  startDate: null,
  endDate: null,
  title: '',
  description: '',
};

/**
 * 인증기간 알림 상태를 계산하는 순수 함수. 실제 연결 상태(healthStatus)와 독립적이며,
 * 기간이 지났다는 이유만으로 연결 오류로 단정하지 않는다.
 */
export function resolveAuthorizationPeriodNotice(input: {
  periodStart: Date | null | undefined;
  periodEnd: Date | null | undefined;
  now?: Date;
}): AuthorizationPeriodNotice {
  const { periodStart, periodEnd } = input;
  if (!periodStart || !periodEnd) return EMPTY_NOTICE;

  const now = input.now ?? new Date();
  // 오늘: 사용자 기준(KST) 달력 날짜. 기간: @db.Date(UTC 자정)의 달력 날짜.
  // 둘 다 "달력 날짜 → day 번호"로 변환해 순수 정수 비교(타임존/시각 영향 없음).
  const todayNum = dayNumberUtc(kstDatePartsOf(now));
  const startNum = dayNumberUtc(utcDatePartsOf(periodStart));
  const endNum = dayNumberUtc(utcDatePartsOf(periodEnd));

  const daysUntilStart = startNum - todayNum;
  const daysUntilEnd = endNum - todayNum;
  const startDate = formatAuthorizationDate(periodStart);
  const endDate = formatAuthorizationDate(periodEnd);
  const base = { daysUntilStart, daysUntilEnd, startDate, endDate };

  if (todayNum < startNum) {
    // 시작 전. 30일 이내부터만 안내.
    if (daysUntilStart > AUTHORIZATION_NOTICE_LEAD_DAYS) {
      return { ...EMPTY_NOTICE, ...base, state: 'NONE', level: 'none', title: '', description: '' };
    }
    const level: AuthorizationPeriodLevel = daysUntilStart <= 1 ? 'important' : daysUntilStart <= 7 ? 'notice' : 'info';
    return {
      ...base,
      state: 'UPCOMING',
      level,
      title: '네이버 인증기간이 다가오고 있습니다.',
      description: '커머스API센터에서 인증기간과 애플리케이션 상태를 확인해 주세요.',
    };
  }

  if (todayNum <= endNum) {
    return {
      ...base,
      state: 'IN_PERIOD',
      level: 'important',
      title: '현재 네이버 인증기간입니다.',
      description: '커머스API센터에서 필요한 인증 절차를 확인해 주세요.',
    };
  }

  return {
    ...base,
    state: 'ENDED',
    level: 'check',
    title: '등록한 네이버 인증기간이 지났습니다.',
    description: '커머스API센터에서 애플리케이션 상태를 확인한 뒤 인증기간 정보를 갱신해 주세요.',
  };
}
