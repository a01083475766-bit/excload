/** 커머스 리포트/뉴스레터 — 기본값 (DB에 설정 행이 없을 때 사용) */
export const DEFAULT_COMMERCE_REPORT_AD_PHRASE =
  '엑클로드 — 주문·물류·송장 변환을 한 번에, https://excload.com';

export const DEFAULT_COMMERCE_REPORT_BANNED_WORDS: string[] = ['최고', '보장', '무조건'];

/**
 * "추천 키워드 자동 찾기" — 시드 키워드 묶음 프리셋 (DB에 저장하지 않는 코드 상수)
 *
 * ⚠️ 명칭 주의: 이 프리셋은 "실시간 인기/상시 키워드를 자동 조회"하는 기능이 아니라,
 * 후보 키워드 추출을 시작할 때 쓸 "시작 키워드 묶음(시드)"을 미리 정해둔 것뿐입니다.
 * 화면 문구도 이 오해를 없애는 방향(OO형 시드)으로 표기합니다.
 */
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
    label: '상시형 시드',
    resultTitle: '상시형 시드 기반 상품 아이디어 TOP10',
    seedKeywords: ['주방', '청소', '수납', '반려동물', '육아', '생활용품'],
  },
  {
    value: 'SEASONAL',
    label: '시즌형 시드',
    resultTitle: '시즌형 시드 기반 상품 아이디어 TOP10',
    seedKeywords: ['여름', '장마', '캠핑', '휴가', '폭염', '냉방'],
  },
  {
    value: 'ISSUE',
    label: '이슈형 시드',
    resultTitle: '이슈형 시드 기반 상품 아이디어 TOP10',
    seedKeywords: ['폭염', '태풍', '물가', '위생', '건강', '안전'],
  },
  {
    value: 'EVENT',
    label: '행사형 시드',
    resultTitle: '행사형 시드 기반 상품 아이디어 TOP10',
    seedKeywords: ['명절', '선물', '새학기', '어버이날', '크리스마스', '홈파티'],
  },
  {
    value: 'CUSTOM',
    label: '직접 입력',
    resultTitle: '직접 입력 기반 상품 아이디어 TOP10',
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

/**
 * "외부 키워드 붙여넣기" — 관리자가 네이버쇼핑 BEST·쇼핑도우미·데이터랩 등 외부에서 확인한 키워드를
 * 직접 붙여넣어 keyword-candidates(후보 추출) 단계 없이 바로 naver-preview로 리포트를 만드는 모드.
 * ⚠️ 크롤링·외부 API 자동 수집이 아니라 관리자가 직접 입력한 텍스트만 사용합니다.
 */
export const MAX_PASTED_KEYWORDS = 10;
export const PASTED_KEYWORDS_RESULT_TITLE = '붙여넣은 키워드 기반 상품 아이디어 TOP10';

/**
 * "네이버 BEST 키워드 가져오기" — 실험 기능 (https://snxbest.naver.com/keyword/best 실시간 fetch)
 *
 * ⚠️ 공식 API가 아니라 공개 웹페이지를 그대로 fetch해서 순위/키워드명/카테고리만 파싱합니다.
 * ⚠️ 상품명·상품 링크·이미지·가격·리뷰수·판매자 정보는 파싱/응답/저장하지 않습니다.
 * ⚠️ DB 저장 없음, cron 없음, 자동 주기 수집 없음 — 관리자 버튼 클릭 시에만 실시간 조회합니다.
 */
export const NAVER_BEST_KEYWORDS_NOTICE =
  '이 기능은 네이버+스토어 BEST 화면에서 확인 가능한 키워드명과 카테고리만 실시간으로 참고합니다. ' +
  '판매량·매출·거래량을 의미하지 않으며, 상품 원문 정보는 저장하거나 표시하지 않습니다.';
export const NAVER_BEST_KEYWORDS_FAILURE_MESSAGE =
  '네이버 BEST 키워드를 가져오지 못했습니다. 시드 기반 추천 키워드 기능을 사용해주세요.';
export const NAVER_BEST_KEYWORDS_RESULT_TITLE = '네이버+스토어 BEST 키워드 기반 상품 아이디어 TOP10';
