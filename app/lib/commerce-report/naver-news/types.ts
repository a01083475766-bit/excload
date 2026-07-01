/**
 * 네이버 뉴스 검색 API — 실시간 참고 조회 전용 타입
 *
 * ⚠️ 뉴스 기사 원문(title/link/originallink/description)은
 * 어디에도 저장하지 않습니다. 요약값만 서버 응답으로 전달합니다.
 */

export interface NaverNewsPreviewSummary {
  /** 기간 필터를 통과해 요약에 반영된 기사 수 (= usedCount) */
  articleCount: number;
  /** 최근 기사 제목/설명에서 추출한 이슈 키워드 (계절/사회적 이슈 등) */
  issueKeywords: string[];
  /** 최근 며칠 이내 기사만 반영했는지 (고정값 7) */
  periodDays: number;
  /** 네이버 API가 이번 호출에서 실제로 내려준 기사 수(=raw items.length) */
  fetchedCount: number;
  /** 기간 필터를 통과해 요약 계산에 실제로 쓰인 기사 수 */
  usedCount: number;
  /** pubDate가 기간(periodDays)보다 오래되어 제외된 기사 수 */
  excludedOldCount: number;
}

/** 네이버 뉴스 검색 API 원본 item 형태(요약 계산 중에만 사용, 저장하지 않음) */
export interface NaverNewsRawItem {
  title?: unknown;
  description?: unknown;
  /** RFC822 형식 문자열 (예: "Mon, 26 Sep 2016 07:50:00 +0900") */
  pubDate?: unknown;
}
