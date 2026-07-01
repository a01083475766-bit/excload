/**
 * 커머스 리포트/뉴스레터 — 공통 타입
 *
 * ⚠️ EXCLOAD CONSTITUTION 준수
 * 이 도메인은 주문 변환 파이프라인(Stage0~3)과 완전히 독립적으로 동작합니다.
 */

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

/** ③ 키워드 TOP 10 테이블 1행 — 현재 단계는 mock, Phase C에서 실데이터로 교체 */
export interface CommerceKeywordStat {
  rank: number;
  keyword: string;
  weekOverWeekPct: number;
  yearOverYearPct: number;
  productCount: number;
  avgPrice: number;
  /** 0~100, 높을수록 경쟁 치열 */
  competitionScore: number;
  /** 0~100, 높을수록 기회 큼 */
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
