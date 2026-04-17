/**
 * EXCLOAD 기준헤더 정의 (컬럼 기반 v3.0)
 *
 * ⚠️ 기준헤더는 내부 전용 Base Header입니다.
 * - UI 노출 금지
 * - 한글 컬럼 기준 구조
 * - 코어: 위 항목 + 쇼핑몰·쿠팡/사이소 확장 열(주문상태·상품주문번호·할인/포인트·배송첨부 등) → 코어 64개 + v3 3PL 10개 = 총 74개
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
  /** 결제수단/결제형태(신용카드, 가상계좌, 포인트 등). 운임구분과 분리 */
  '결제구분',
  '상품명',
  '추가상품',
  '상품옵션',
  '상품옵션1',
  '수량',
  '배송메시지',
  /** 쇼핑몰·쿠팡 등: 배송메시지와 별도 열로 오는 부가 요청사항 */
  '상품별추가메시지',
  '주문자추가메시지',
  /** 쇼핑몰·주문 파일에 표시된 배송비(고객 청구/안내 금액 등) — 실제 택배 계약 운임은 `운임` */
  '주문배송비구분',
  '주문배송비',
  '운임구분',
  '운임',
  '운송장번호',
  '창고메모',
  '내부메모',
  '출고번호',
  // 쇼핑몰·쿠팡 등 주문 파일 확장 (모호한 열 `--번호`·`기타`·`결제위치` 류는 제외)
  '택배사',
  '묶음배송번호',
  '분리배송여부',
  '분리배송출고예정일',
  '주문시출고예정일',
  '출고발송일',
  '등록상품명',
  '등록옵션명',
  '노출상품명',
  '노출상품ID',
  '옵션ID',
  '최초등록옵션명',
  '도서산간추가배송비',
  '옵션판매가',
  '배송완료일',
  '구매확정일자',
  '통관용구매자전화번호',
  // 사이소 주문 목록 확장
  '주문상태',
  '상품주문번호',
  '제휴주문번호',
  '관리상품번호',
  '판매상품번호',
  '판매자할인',
  '지원할인',
  '쿠폰명',
  '쿠폰할인',
  '포인트',
  '주문자이메일',
  '택배사코드',
  '배송첨부파일',
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
  '개인통관번호',
] as const;

/** v2 코어 필드 개수 (3PL 확장 10개 제외) — 텍스트 주문 AI는 이 구간을 주(主), 나머지는 보조로 안내 */
export const CORE_BASE_HEADER_COUNT = 64;

/** 물류·3PL 보조 필드 (코어 64개 다음). 텍스트 변환 시 라벨이 명시될 때만 채움(프롬프트 규칙). */
export const AUXILIARY_BASE_HEADERS = BASE_HEADERS.slice(
  CORE_BASE_HEADER_COUNT
) as readonly BaseHeaderKey[];

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
