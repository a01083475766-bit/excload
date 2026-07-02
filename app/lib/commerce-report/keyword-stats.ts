/**
 * 커머스 리포트 — 키워드 TOP 10 표 계산 (순수 함수)
 *
 * ⚠️ 이미 조회된 KeywordReferenceSummary[](네이버 쇼핑/블로그/뉴스 요약값)만 입력으로 받습니다.
 * 새로운 API 호출·DB 조회·저장이 전혀 없는 순수 계산입니다.
 * ⚠️ 판매량·매출·거래량 데이터가 아니라, 검색 결과 요약값을 바탕으로 한 내부 참고 점수입니다.
 * ⚠️ 쇼핑인사이트/데이터랩을 아직 붙이지 않아 전주/전년 대비는 계산하지 않습니다.
 */

import type { CommerceKeywordStat, KeywordReferenceSummary } from './types';

const MAX_TOP_ROWS = 10;
/** 이 상품수 이상이면 경쟁강도 100점으로 취급 (로그 스케일 상한 기준값) */
const COMPETITION_SCALE_MAX_PRODUCT_COUNT = 1_000_000;
/** 이만큼 블로그 게시물이 반영되면 콘텐츠 소재 가점을 만점(100) 처리 */
const BLOG_BONUS_FULL_COUNT = 30;
/** 이만큼 뉴스 기사가 반영되면 이슈성 가점을 만점(100) 처리 (뉴스는 7일 창이라 블로그보다 기준을 낮게 잡음) */
const NEWS_BONUS_FULL_COUNT = 10;
/** 자주 보이는 단어가 이 개수 이상이면 콘텐츠 소재 다양성 가점을 만점(100) 처리 */
const FREQUENT_WORDS_FULL_COUNT = 8;

/** 상품수가 많을수록 0~100 사이에서 커지는 경쟁강도. 로그 스케일이라 상품수가 아주 적으면 낮게, 아주 많으면 높게 나옵니다. */
function computeCompetitionScore(productCount: number): number {
  if (productCount <= 0) return 0;
  const scaled =
    (Math.log10(productCount + 1) / Math.log10(COMPETITION_SCALE_MAX_PRODUCT_COUNT + 1)) * 100;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

function computeOpportunityScore(input: {
  competitionScore: number;
  blogUsedCount: number;
  newsUsedCount: number;
  frequentWordCount: number;
  priceRange: { min: number; max: number; avg: number; sampleSize: number };
}): number {
  const { competitionScore, blogUsedCount, newsUsedCount, frequentWordCount, priceRange } = input;

  // 1~3: 블로그/뉴스/자주 보이는 단어 — 콘텐츠 소재·이슈성이 있을수록 가점
  const blogPart = (Math.min(blogUsedCount, BLOG_BONUS_FULL_COUNT) / BLOG_BONUS_FULL_COUNT) * 100;
  const newsPart = (Math.min(newsUsedCount, NEWS_BONUS_FULL_COUNT) / NEWS_BONUS_FULL_COUNT) * 100;
  const wordsPart =
    (Math.min(frequentWordCount, FREQUENT_WORDS_FULL_COUNT) / FREQUENT_WORDS_FULL_COUNT) * 100;
  const contentScore = blogPart * 0.4 + newsPart * 0.3 + wordsPart * 0.3;

  // 4: 상품수(=경쟁강도)가 높을수록 감점
  const competitionPenaltyScore = 100 - competitionScore;

  // 5: 가격 구간이 넓을수록(평균가 대비 최고가-최저가 격차가 클수록) 포지션이 애매하므로 감점
  const spreadRatio =
    priceRange.sampleSize > 0 && priceRange.avg > 0
      ? (priceRange.max - priceRange.min) / priceRange.avg
      : 0;
  const spreadScore = Math.max(40, 100 - Math.round(spreadRatio * 20));

  const raw = contentScore * 0.5 + competitionPenaltyScore * 0.3 + spreadScore * 0.2;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** 조회된 참고 데이터를 바탕으로 키워드 TOP N(최대 10개) 표를 계산합니다. */
export function computeKeywordStats(results: KeywordReferenceSummary[]): CommerceKeywordStat[] {
  const rows = results.map((r) => {
    const productCount = r.shopping.productCount;
    const avgPrice = r.shopping.priceRange.avg;
    const blogMentionCount = r.blog?.usedCount ?? 0;
    const newsIssueCount = r.news?.usedCount ?? 0;
    const competitionScore = computeCompetitionScore(productCount);
    const opportunityScore = computeOpportunityScore({
      competitionScore,
      blogUsedCount: blogMentionCount,
      newsUsedCount: newsIssueCount,
      frequentWordCount: r.shopping.frequentWords.length,
      priceRange: r.shopping.priceRange,
    });

    return {
      keyword: r.keyword,
      productCount,
      avgPrice,
      blogMentionCount,
      newsIssueCount,
      competitionScore,
      opportunityScore,
    };
  });

  rows.sort((a, b) => {
    if (b.opportunityScore !== a.opportunityScore) return b.opportunityScore - a.opportunityScore;
    if (b.newsIssueCount !== a.newsIssueCount) return b.newsIssueCount - a.newsIssueCount;
    if (b.blogMentionCount !== a.blogMentionCount) return b.blogMentionCount - a.blogMentionCount;
    return b.productCount - a.productCount;
  });

  return rows.slice(0, MAX_TOP_ROWS).map((row, index) => ({ rank: index + 1, ...row }));
}
