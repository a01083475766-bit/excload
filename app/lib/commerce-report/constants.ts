/** 커머스 리포트/뉴스레터 — 기본값 (DB에 설정 행이 없을 때 사용) */
export const DEFAULT_COMMERCE_REPORT_AD_PHRASE =
  '엑클로드 — 주문·물류·송장 변환을 한 번에, https://excload.com';

export const DEFAULT_COMMERCE_REPORT_BANNED_WORDS: string[] = ['최고', '보장', '무조건'];

/** "추천 키워드 자동 찾기" — 수집 목적별 카테고리 (DB에 저장하지 않는 코드 상수) */
export type CommerceKeywordCandidateCategory = 'EVERGREEN' | 'SEASONAL' | 'ISSUE' | 'EVENT' | 'CUSTOM';

export interface CommerceKeywordCandidateCategoryPreset {
  value: CommerceKeywordCandidateCategory;
  /** 탭/버튼 라벨, "OO 후보" 표시에도 그대로 사용 */
  label: string;
  /** "선택한 후보로 리포트 만들기" 이후 TOP10 표 제목 */
  resultTitle: string;
  /** 기본 시드 키워드 — CUSTOM(직접 입력)은 프리셋이 없어 빈 배열 */
  seedKeywords: string[];
}

export const COMMERCE_KEYWORD_CANDIDATE_CATEGORIES: CommerceKeywordCandidateCategoryPreset[] = [
  {
    value: 'EVERGREEN',
    label: '상시 수요',
    resultTitle: '상시 수요 상품 아이디어 TOP10',
    seedKeywords: ['주방', '청소', '수납', '반려동물', '육아', '생활용품'],
  },
  {
    value: 'SEASONAL',
    label: '시즌 수요',
    resultTitle: '시즌 상품 아이디어 TOP10',
    seedKeywords: ['여름', '장마', '캠핑', '휴가', '폭염', '냉방'],
  },
  {
    value: 'ISSUE',
    label: '이슈 수요',
    resultTitle: '이슈 기반 상품 아이디어 TOP10',
    seedKeywords: ['폭염', '태풍', '물가', '위생', '건강', '안전'],
  },
  {
    value: 'EVENT',
    label: '행사/기념일',
    resultTitle: '행사/기념일 상품 아이디어 TOP10',
    seedKeywords: ['명절', '선물', '새학기', '어버이날', '크리스마스', '홈파티'],
  },
  {
    value: 'CUSTOM',
    label: '직접 입력',
    resultTitle: '직접 입력 상품 아이디어 TOP10',
    seedKeywords: [],
  },
];

export const DEFAULT_COMMERCE_KEYWORD_CANDIDATE_CATEGORY: CommerceKeywordCandidateCategory = 'EVERGREEN';

/** API route의 절대 안전장치용 폴백(정상 흐름에서는 클라이언트가 항상 카테고리 시드를 보내므로 거의 쓰이지 않음) */
export const DEFAULT_COMMERCE_REPORT_SEED_KEYWORDS: string[] =
  COMMERCE_KEYWORD_CANDIDATE_CATEGORIES.find((c) => c.value === 'EVERGREEN')?.seedKeywords ?? [];

/** 시드 키워드는 API 호출량 보호를 위해 서버에서 항상 이 개수로 자릅니다 */
export const MAX_SEED_KEYWORDS = 6;

/** 후보 키워드 추출 결과 상한 (단일 단어 + 2단어 구 합산) */
export const MAX_KEYWORD_CANDIDATES = 20;
