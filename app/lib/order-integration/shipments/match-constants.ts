/** 매칭 점수 — 테스트·튜닝 가능하도록 상수 분리 */
export const MATCH_SCORE = {
  EXCLOAD_ORDER_NO: 100,
  MALL_ORDER_NO: 80,
  PHONE: 60,
  RECEIVER_NAME: 40,
  ADDRESS_STRONG: 40,
  PRODUCT_SUMMARY: 20,
  EXPORTED_ROW_INDEX_HINT: 30,
} as const;

export const MATCH_PENALTY = {
  MALL_ORDER_MISMATCH: -50,
  PHONE_MISMATCH: -30,
  RECEIVER_NAME_MISMATCH: -20,
} as const;

export const MATCH_THRESHOLD = {
  CONFIDENT: 100,
  WARNING: 70,
} as const;

/** 송장번호 길이 — 너무 짧/김은 parse warning */
export const TRACKING_NUMBER_LENGTH = {
  MIN: 8,
  MAX: 30,
} as const;
