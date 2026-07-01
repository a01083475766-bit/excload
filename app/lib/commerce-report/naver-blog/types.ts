/**
 * 네이버 블로그 검색 API — 실시간 참고 조회 전용 타입
 *
 * ⚠️ 블로그 포스트 원문(title/link/description/bloggername/bloggerlink)은
 * 어디에도 저장하지 않습니다. 요약값만 서버 응답으로 전달합니다.
 */

export interface NaverBlogPreviewSummary {
  /** 기간 필터를 통과해 요약에 반영된 게시물 수 (= usedCount) */
  postCount: number;
  /** 제목/설명에서 반복적으로 등장하는 2단어 구(콘텐츠 소재 후보) */
  frequentPhrases: string[];
  /** "고르는 법", "추천", "비교" 등 고민형 표현 사전과 대조해 실제로 등장한 표현만 */
  concernPhrases: string[];
  /** 최근 며칠 이내 게시물만 반영했는지 (고정값 30) */
  periodDays: number;
  /** 네이버 API가 이번 호출에서 실제로 내려준 게시물 수(=raw items.length) */
  fetchedCount: number;
  /** 기간 필터를 통과해 요약 계산에 실제로 쓰인 게시물 수 */
  usedCount: number;
  /** postdate가 기간(periodDays)보다 오래되어 제외된 게시물 수 */
  excludedOldCount: number;
}

/** 네이버 블로그 검색 API 원본 item 형태(요약 계산 중에만 사용, 저장하지 않음) */
export interface NaverBlogRawItem {
  title?: unknown;
  description?: unknown;
  /** yyyyMMdd 형식 문자열 (예: "20250615") */
  postdate?: unknown;
}
