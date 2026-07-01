/**
 * 커머스 리포트/뉴스레터 — Phase A/B 화면 목업용 mock 데이터
 *
 * ⚠️ 실데이터 아님. Phase C(수집 연동)·Phase D(AI 연동)에서
 * 아래 mock 대신 실제 API 응답으로 교체될 자리입니다.
 */

import type {
  CommerceCollectStatus,
  CommerceKeywordStat,
  CommerceNewsletterDraft,
} from './types';

export const MOCK_COLLECT_STATUS: CommerceCollectStatus = {
  isCollectedToday: true,
  hasPartialFailure: false,
  lastCollectedAt: new Date().toISOString(),
  collectedKeywordCount: 24,
  totalKeywordCount: 24,
  failedCount: 0,
};

export const MOCK_KEYWORD_STATS: CommerceKeywordStat[] = [
  { rank: 1, keyword: '텀블러', weekOverWeekPct: 12, yearOverYearPct: 34, productCount: 12300, avgPrice: 18900, competitionScore: 62, opportunityScore: 87 },
  { rank: 2, keyword: '휴대용선풍기', weekOverWeekPct: 28, yearOverYearPct: 61, productCount: 8400, avgPrice: 15900, competitionScore: 54, opportunityScore: 82 },
  { rank: 3, keyword: '캠핑의자', weekOverWeekPct: 5, yearOverYearPct: 19, productCount: 6200, avgPrice: 32900, competitionScore: 48, opportunityScore: 74 },
  { rank: 4, keyword: '차량용방향제', weekOverWeekPct: -3, yearOverYearPct: 8, productCount: 15100, avgPrice: 9900, competitionScore: 71, opportunityScore: 58 },
  { rank: 5, keyword: '보냉백', weekOverWeekPct: 9, yearOverYearPct: 22, productCount: 5300, avgPrice: 21900, competitionScore: 41, opportunityScore: 76 },
  { rank: 6, keyword: '접이식카트', weekOverWeekPct: 15, yearOverYearPct: 27, productCount: 4100, avgPrice: 45900, competitionScore: 39, opportunityScore: 79 },
  { rank: 7, keyword: '워터파크용품', weekOverWeekPct: 42, yearOverYearPct: 55, productCount: 3900, avgPrice: 13900, competitionScore: 45, opportunityScore: 83 },
  { rank: 8, keyword: '아이스박스', weekOverWeekPct: 7, yearOverYearPct: 14, productCount: 9800, avgPrice: 28900, competitionScore: 58, opportunityScore: 61 },
  { rank: 9, keyword: '휴대용가습기', weekOverWeekPct: -6, yearOverYearPct: 3, productCount: 11200, avgPrice: 16900, competitionScore: 66, opportunityScore: 47 },
  { rank: 10, keyword: '접이식파라솔', weekOverWeekPct: 18, yearOverYearPct: 31, productCount: 2700, avgPrice: 39900, competitionScore: 33, opportunityScore: 71 },
];

export const MOCK_NEWSLETTER_DRAFT_EMPTY: CommerceNewsletterDraft = {
  status: 'NONE',
  title: '',
  summary: '',
  body: '',
  tags: [],
  generatedAt: null,
};

export const MOCK_NEWSLETTER_DRAFT_SAMPLE: CommerceNewsletterDraft = {
  status: 'DRAFT',
  title: '여름 성수기, 지금 뜨는 커머스 키워드 TOP 3 — 텀블러·휴대용선풍기·워터파크용품',
  summary:
    '이번 주 커머스 데이터 기준, 텀블러·휴대용선풍기·워터파크용품이 전주 대비 두 자릿수 성장을 기록했습니다. 상품수 대비 기회 점수가 높은 키워드를 중심으로 정리했습니다.',
  body:
    '이번 주 커머스 키워드 데이터를 살펴보면, 무더위가 본격화되며 여름 관련 상품 검색이 눈에 띄게 늘었습니다.\n\n' +
    '① 텀블러: 전주 대비 12%, 전년 동기 대비 34% 증가했습니다. 등록 상품수는 1만 2천여 개로 경쟁이 있는 편이지만, 기회 점수 87점으로 신규 진입 여지가 여전히 큽니다.\n\n' +
    '② 휴대용선풍기: 전주 대비 28% 증가하며 가장 빠르게 성장하고 있습니다. 평균 가격은 1만 5천 원대로 진입 장벽이 낮은 편입니다.\n\n' +
    '③ 워터파크용품: 전주 대비 42%로 성장률이 가장 높았습니다. 등록 상품수가 아직 적어(3,900개) 상대적으로 경쟁이 낮은 시장입니다.\n\n' +
    '(mock 데이터 미리보기 — 실제 생성 시 최신 수집 데이터 기준으로 문장이 다시 작성됩니다.)',
  tags: ['텀블러', '휴대용선풍기', '워터파크용품', '여름신상', '가격동향'],
  generatedAt: new Date().toISOString(),
};
