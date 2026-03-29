/**
 * EXCLOAD 기준헤더 정의 (컬럼 기반 v3.0)
 *
 * ⚠️ 기준헤더는 내부 전용 Base Header입니다.
 * - UI 노출 금지
 * - 한글 컬럼 기준 구조
 * - v2: 29개 → v3: 3PL 확장 9개 추가 (총 38개)
 */

/**
 * 기준헤더 배열
 * 내부 표준 컬럼 집합으로, 모든 입력의 1차 통일 구조입니다.
 */
export const BASE_HEADERS = [
  '주문번호',
  '보내는사람',
  '보내는사람전화1',
  '보내는사람전화2',
  '보내는사람우편번호',
  '보내는사람주소1',
  '보내는사람주소2',
  '받는사람',
  '받는사람전화1',
  '받는사람전화2',
  '받는사람우편번호',
  '받는사람주소1',
  '받는사람주소2',
  '주문자',
  '주문자연락처',
  '주문일시',
  '결제금액',
  '상품명',
  '추가상품',
  '상품옵션',
  '상품옵션1',
  '수량',
  '배송메시지',
  '운임구분',
  '운임',
  '운송장번호',
  '창고메모',
  '내부메모',
  '출고번호',
  // v3 확장 — 3PL 물류
  '상품코드',
  '옵션코드',
  '센터코드',
  '박스수량',
  '출고타입',
  '출고요청일',
  '주문ID',
  '출고지시사항',
  '판매처',
] as const;

/** 기준헤더 개수 (프롬프트·검증용) */
export const BASE_HEADER_COUNT = BASE_HEADERS.length;

export type BaseHeaderKey = (typeof BASE_HEADERS)[number];

/** 기준헤더 키 → 문자열 값 (행 1건) */
export type BaseHeaderRow = Record<BaseHeaderKey, string>;

/** 빈 기준헤더 행 (모든 키 빈 문자열) */
export function createEmptyBaseHeaderRow(): BaseHeaderRow {
  const row = {} as BaseHeaderRow;
  for (const h of BASE_HEADERS) {
    row[h] = '';
  }
  return row;
}

/**
 * normalize-29 AI 프롬프트용 예시 JSON: { orders: [ { ...빈 필드 } ] }
 */
export function buildNormalize29OrdersJsonExample(): string {
  return JSON.stringify({ orders: [createEmptyBaseHeaderRow()] }, null, 2);
}

/**
 * 행 객체에 BASE_HEADERS 키가 모두 있는지 검사 (개수 비교가 아닌 키 존재 여부).
 * 누락 시에만 console.warn — 변환 파이프라인은 계속 진행한다.
 */
export function warnIfBaseHeaderKeysMissing(
  row: Record<string, unknown>,
  context: string
): void {
  const missing = BASE_HEADERS.filter(
    (k) => !Object.prototype.hasOwnProperty.call(row, k)
  );
  if (missing.length > 0) {
    console.warn(`[${context}] BASE_HEADERS 키 누락`, { missing });
  }
}
