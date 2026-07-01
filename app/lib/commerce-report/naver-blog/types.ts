/**
 * 네이버 블로그 검색 API — 실시간 참고 조회 전용 타입
 *
 * ⚠️ 블로그 포스트 원문(title/link/description/bloggername/bloggerlink)은
 * 어디에도 저장하지 않습니다. 요약값만 서버 응답으로 전달합니다.
 */

export interface NaverBlogPreviewSummary {
  postCount: number;
  /** 제목/설명에서 반복적으로 등장하는 2단어 구(콘텐츠 소재 후보) */
  frequentPhrases: string[];
  /** "고르는 법", "추천", "비교" 등 고민형 표현 사전과 대조해 실제로 등장한 표현만 */
  concernPhrases: string[];
}

/** 네이버 블로그 검색 API 원본 item 형태(요약 계산 중에만 사용, 저장하지 않음) */
export interface NaverBlogRawItem {
  title?: unknown;
  description?: unknown;
}
