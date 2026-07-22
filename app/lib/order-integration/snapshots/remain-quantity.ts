/**
 * 스마트스토어 remainQuantity 정규화.
 * 내부 키는 표준행/다운로드에 넣지 않는다 — 메타 채널로만 전달한다.
 */

/** 레거시·실수 유입 검출용. 공개 출력·표준행에 넣지 말 것 */
export const EXCLOAD_REMAIN_QUANTITY_ROW_KEY = '__excloadRemainQuantity';

/**
 * 저장·UI용 remainQuantity 정규화.
 * 허용: JavaScript number 이면서 유한한 정수이며 0 이상.
 * 문자열("1" 포함)·NaN·Infinity·음수·소수·기타 타입 → null.
 * Number(value)로 문자열을 강제 변환하지 않음. 1로 추정하지 않음.
 */
export function normalizeRemainQuantityForPersist(value: unknown): number | null {
  if (typeof value !== 'number') {
    return null;
  }
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

export function isSmartstoreProviderForRemainQuantity(
  provider: string | null | undefined,
): boolean {
  const raw = String(provider ?? '').trim();
  if (!raw) return false;
  const upper = raw.toUpperCase();
  return upper === 'SMARTSTORE' || raw === '스마트스토어' || raw.toLowerCase() === 'smartstore';
}

/** 표준행·다운로드 행에서 내부 remain 키를 제거한다. */
export function stripExcloadRemainQuantityRowKey(
  row: Record<string, string>,
): Record<string, string> {
  if (!(EXCLOAD_REMAIN_QUANTITY_ROW_KEY in row)) {
    return row;
  }
  const next = { ...row };
  delete next[EXCLOAD_REMAIN_QUANTITY_ROW_KEY];
  return next;
}

export function stripExcloadRemainQuantityFromRows(
  rows: ReadonlyArray<Record<string, string>>,
): Record<string, string>[] {
  return rows.map((row) => stripExcloadRemainQuantityRowKey(row));
}

/**
 * 그룹(합쳐진 소스 행)의 remainQuantity.
 * 스마트스토어가 아니면 null.
 * 한 행이라도 불명확하면 null (합산 추정 금지).
 * remainQuantities는 이미 number|null 로 정규화된 메타(문자열 아님).
 */
export function resolveGroupedRemainQuantityForPersist(input: {
  provider: string | null | undefined;
  sourceRowIndexes: ReadonlyArray<number>;
  remainQuantities?: ReadonlyArray<number | null> | null;
}): number | null {
  if (!isSmartstoreProviderForRemainQuantity(input.provider)) {
    return null;
  }
  if (!input.remainQuantities || input.sourceRowIndexes.length === 0) {
    return null;
  }

  let sum = 0;
  for (const index of input.sourceRowIndexes) {
    const raw = input.remainQuantities[index];
    const value = normalizeRemainQuantityForPersist(raw);
    if (value === null) return null;
    sum += value;
  }
  return sum;
}
