/** 커머스 리포트/뉴스레터 — 기본값 (DB에 설정 행이 없을 때 사용) */
export const DEFAULT_COMMERCE_REPORT_AD_PHRASE =
  '엑클로드 — 주문·물류·송장 변환을 한 번에, https://excload.com';

export const DEFAULT_COMMERCE_REPORT_BANNED_WORDS: string[] = ['최고', '보장', '무조건'];

/** "추천 키워드 자동 찾기" 기본 시드 키워드 — DB에 저장하지 않는 코드 상수, 화면에서 수정 가능 */
export const DEFAULT_COMMERCE_REPORT_SEED_KEYWORDS: string[] = [
  '여름', '장마', '캠핑', '휴가', '폭염', '냉방',
];

/** 시드 키워드는 API 호출량 보호를 위해 서버에서 항상 이 개수로 자릅니다 */
export const MAX_SEED_KEYWORDS = 6;

/** 후보 키워드 추출 결과 상한 (단일 단어 + 2단어 구 합산) */
export const MAX_KEYWORD_CANDIDATES = 20;
