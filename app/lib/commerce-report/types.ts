/**
 * 커머스 리포트/뉴스레터 — 공통 타입
 *
 * ⚠️ EXCLOAD CONSTITUTION 준수
 * 이 도메인은 주문 변환 파이프라인(Stage0~3)과 완전히 독립적으로 동작합니다.
 */

import type { NaverBlogPreviewSummary } from './naver-blog/types';
import type { NaverNewsPreviewSummary } from './naver-news/types';
import type { NaverShoppingPreviewSummary } from './naver-shopping/types';

export type CommerceReportTone = 'PLAIN' | 'FRIENDLY' | 'PROFESSIONAL';

export const COMMERCE_REPORT_TONE_OPTIONS: { value: CommerceReportTone; label: string }[] = [
  { value: 'PLAIN', label: '담백하게' },
  { value: 'FRIENDLY', label: '친근하게' },
  { value: 'PROFESSIONAL', label: '전문적으로' },
];

export function isCommerceReportTone(value: unknown): value is CommerceReportTone {
  return value === 'PLAIN' || value === 'FRIENDLY' || value === 'PROFESSIONAL';
}

export interface CommerceKeywordRow {
  id: string;
  keyword: string;
  category: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface CommerceReportSettingsData {
  bannedWords: string[];
  adPhrase: string;
  toneStyle: CommerceReportTone;
  updatedAt: string;
}

/**
 * ③ 키워드 TOP 10 테이블 1행 — 네이버 쇼핑/블로그/뉴스 검색 API 요약값(KeywordReferenceSummary)을
 * 바탕으로 계산한 내부 참고 지표입니다. 판매량·매출·거래량이 아니며, 전주/전년 대비 비교는
 * 쇼핑인사이트를 붙이지 않아 이번 단계에서는 제공하지 않습니다.
 */
export interface CommerceKeywordStat {
  rank: number;
  keyword: string;
  productCount: number;
  avgPrice: number;
  /** blog.usedCount (최근 30일 기준 반영된 블로그 게시물 수) */
  blogMentionCount: number;
  /** news.usedCount (최근 7일 기준 반영된 뉴스 기사 수) */
  newsIssueCount: number;
  /** 0~100, 높을수록 경쟁 치열 (상품수 기준) */
  competitionScore: number;
  /** 0~100, 높을수록 기회 큼 (블로그/뉴스/단어 다양성 가점, 경쟁·가격대 넓음 감점) */
  opportunityScore: number;
}

/** ② 오늘 데이터 상태 — 현재 단계는 mock, Phase C에서 CommerceKeywordSnapshot 집계로 교체 */
export interface CommerceCollectStatus {
  isCollectedToday: boolean;
  hasPartialFailure: boolean;
  lastCollectedAt: string | null;
  collectedKeywordCount: number;
  totalKeywordCount: number;
  failedCount: number;
}

/**
 * ② 오늘 참고 데이터 — 키워드 1개에 대한 네이버 쇼핑/블로그/뉴스 요약값 묶음
 *
 * ⚠️ DB에 저장하지 않고 React 상태로만 유지합니다. 원본 상품/포스트/기사 리스트는
 * 포함하지 않으며, 아래 요약값만 화면과 AI 초안 생성에 전달됩니다.
 * blog·news는 쇼핑 조회가 성공해도 개별 실패할 수 있어 null이 될 수 있습니다.
 */
export interface KeywordReferenceSummary {
  keyword: string;
  fetchedAt: string;
  shopping: NaverShoppingPreviewSummary;
  blog: NaverBlogPreviewSummary | null;
  news: NaverNewsPreviewSummary | null;
}

export type CommerceNewsletterDraftStatus = 'NONE' | 'DRAFT';

/** ④⑤ 뉴스레터 생성 결과 — 현재 단계는 mock, Phase D에서 AI 게이트웨이 연동으로 교체 */
export interface CommerceNewsletterDraft {
  status: CommerceNewsletterDraftStatus;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  generatedAt: string | null;
}
