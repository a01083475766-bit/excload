/**
 * 네이버 뉴스 검색 API — 실시간 참고 조회 전용 타입
 *
 * ⚠️ 뉴스 기사 원문(title/link/originallink/description)은
 * 어디에도 저장하지 않습니다. 요약값만 서버 응답으로 전달합니다.
 */

export interface NaverNewsPreviewSummary {
  articleCount: number;
  /** 최근 기사 제목/설명에서 추출한 이슈 키워드 (계절/사회적 이슈 등) */
  issueKeywords: string[];
}

/** 네이버 뉴스 검색 API 원본 item 형태(요약 계산 중에만 사용, 저장하지 않음) */
export interface NaverNewsRawItem {
  title?: unknown;
  description?: unknown;
}
