/**
 * normalize-29 텍스트 주문 — AI 추출 필드 (~29)
 * 서버 normalizeNormalize29Order 가 BASE_HEADERS 74개 전체로 보정합니다.
 */

/** @deprecated 라우팅 제거. 호환용 별칭 */
export type Normalize29PromptRoute = 'parcel';

/** 택배·물류 텍스트 주문 AI 추출 필드 */
export const TEXT_ORDER_PARCEL_HEADERS = [
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
  '상품명',
  '추가상품',
  '상품옵션',
  '상품옵션1',
  '수량',
  '배송메시지',
  '상품별추가메시지',
  '주문자추가메시지',
  '운임구분',
  '운임',
  '운송장번호',
  '택배사',
  '내부메모',
] as const;

/** @deprecated TEXT_ORDER_PARCEL_HEADERS 와 동일 */
export const TEXT_ORDER_SIMPLE_CORE_HEADERS = TEXT_ORDER_PARCEL_HEADERS;
