import type { OrderIntegrationMallId } from '@/app/lib/order-integration/malls';

/** 날짜 직접 선택(시작~종료)으로 조회 가능한 최대 기간(일, 포함 기준). */
export const MAX_FETCH_RANGE_DAYS = 30;

/**
 * 날짜 범위(from~to) 조회를 지원하는 몰.
 * 스마트스토어는 lastChangedFrom/To + 24시간 분할 호출을 이미 사용하므로 우선 지원한다.
 * 다른 몰은 어댑터가 날짜 범위를 지원하도록 개별 작업된 뒤 이 집합에 추가한다.
 */
export const DATE_RANGE_SUPPORTED_MALL_IDS: ReadonlySet<OrderIntegrationMallId> = new Set<OrderIntegrationMallId>([
  'smartstore',
]);

export function isDateRangeSupportedMall(mallId: OrderIntegrationMallId): boolean {
  return DATE_RANGE_SUPPORTED_MALL_IDS.has(mallId);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 날짜 범위 검증 실패를 사용자 메시지와 함께 던진다. */
export class OrderFetchRangeError extends Error {}

type ParsedDate = { year: number; month: number; day: number };

function parseDateString(value: unknown): ParsedDate | null {
  if (typeof value !== 'string') return null;
  const match = DATE_PATTERN.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // 실제 존재하는 날짜인지 확인 (예: 2026-02-30 거부)
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

/** 해당 KST 날짜의 00:00:00.000 시각을 epoch ms로 반환. */
function kstStartOfDayMs(date: ParsedDate): number {
  return Date.UTC(date.year, date.month - 1, date.day, 0, 0, 0, 0) - KST_OFFSET_MS;
}

/** 해당 KST 날짜의 23:59:59.999 시각을 epoch ms로 반환. */
function kstEndOfDayMs(date: ParsedDate): number {
  return Date.UTC(date.year, date.month - 1, date.day, 23, 59, 59, 999) - KST_OFFSET_MS;
}

/** now(epoch)를 KST 기준 날짜 파트로 변환. */
function kstDatePartsOf(now: Date): ParsedDate {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return { year: kst.getUTCFullYear(), month: kst.getUTCMonth() + 1, day: kst.getUTCDate() };
}

/** 오늘(KST) 날짜를 YYYY-MM-DD로 반환. date input의 max 등에 사용. */
export function kstTodayDateString(now: Date = new Date()): string {
  const { year, month, day } = kstDatePartsOf(now);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 포함 기준 일수 (같은 날이면 1일). */
function inclusiveDayCount(fromStartMs: number, toStartMs: number): number {
  return Math.round((toStartMs - fromStartMs) / DAY_MS) + 1;
}

/**
 * 날짜 범위 입력 검증. 문제가 없으면 null, 있으면 사용자 메시지를 반환한다.
 * UI(즉시 피드백)와 서버(resolve) 양쪽에서 사용한다. KST 계산은 UTC 연산으로 처리해 브라우저 타임존 영향을 받지 않는다.
 */
export function getOrderFetchRangeError(input: { from: unknown; to: unknown; now?: Date }): string | null {
  const from = parseDateString(input.from);
  const to = parseDateString(input.to);
  if (!from) return '시작일을 올바른 날짜로 선택해 주세요.';
  if (!to) return '종료일을 올바른 날짜로 선택해 주세요.';

  const now = input.now ?? new Date();
  const todayStartMs = kstStartOfDayMs(kstDatePartsOf(now));
  const fromStartMs = kstStartOfDayMs(from);
  const toStartMs = kstStartOfDayMs(to);

  if (fromStartMs > todayStartMs) return '시작일은 오늘보다 미래일 수 없습니다.';
  if (toStartMs > todayStartMs) return '종료일은 오늘보다 미래일 수 없습니다.';
  if (toStartMs < fromStartMs) return '종료일은 시작일보다 빠를 수 없습니다.';
  if (inclusiveDayCount(fromStartMs, toStartMs) > MAX_FETCH_RANGE_DAYS) {
    return `조회 기간은 한 번에 최대 ${MAX_FETCH_RANGE_DAYS}일까지 선택할 수 있습니다.`;
  }
  return null;
}

export type ResolvedOrderFetchRange = { fromMs: number; toMs: number };

/**
 * 날짜 범위 입력을 실제 조회 시각(epoch ms)으로 변환한다.
 * - 시작일: 00:00:00.000 (KST)
 * - 종료일: 23:59:59.999 (KST). 단 종료일이 오늘이면 현재 시각(now)까지.
 * 검증 실패 시 OrderFetchRangeError를 던진다.
 */
export function resolveOrderFetchRange(input: {
  from: string;
  to: string;
  now?: Date;
}): ResolvedOrderFetchRange {
  const error = getOrderFetchRangeError(input);
  if (error) throw new OrderFetchRangeError(error);

  const now = input.now ?? new Date();
  const from = parseDateString(input.from) as ParsedDate;
  const to = parseDateString(input.to) as ParsedDate;

  const todayStartMs = kstStartOfDayMs(kstDatePartsOf(now));
  const toStartMs = kstStartOfDayMs(to);

  const fromMs = kstStartOfDayMs(from);
  const toMs = toStartMs === todayStartMs ? now.getTime() : kstEndOfDayMs(to);

  return { fromMs, toMs };
}

/** 요청 body에서 날짜 범위 입력({from,to})을 추출. 없으면 null. */
export function extractDateRangeInput(body: unknown): { from: string; to: string } | null {
  if (!body || typeof body !== 'object') return null;
  const from = (body as { from?: unknown }).from;
  const to = (body as { to?: unknown }).to;
  if (typeof from === 'string' && typeof to === 'string' && from && to) {
    return { from, to };
  }
  return null;
}
