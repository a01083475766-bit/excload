/**
 * 네이버 블로그 검색 API 응답 → 요약값 계산 (순수 함수)
 *
 * ⚠️ 입력으로 받은 원본 items(title/description/bloggername/bloggerlink/postdate)는
 * 이 함수 실행 중에만 사용되고, 반환값에는 포함되지 않습니다.
 * ⚠️ postdate가 최근 BLOG_PERIOD_DAYS일을 벗어난 게시물은 요약 계산에서 제외합니다.
 */

import { findMatchingPhrases, isWithinRecentDays, stripHtmlTags, tokenizeText, topFrequentBigramPhrases } from '../text-utils';
import type { NaverBlogPreviewSummary, NaverBlogRawItem } from './types';

const BLOG_PERIOD_DAYS = 30;

const STOPWORDS = new Set([
  '블로그', '포스팅', '오늘', '정리', '공유', '리뷰', '후기', '이번', '진짜', '완전', '너무', '정말',
]);

/** 사용자가 실제로 고민할 때 쓰는 표현 사전 — 등장한 것만 결과에 포함 */
const CONCERN_PHRASE_DICTIONARY = [
  '고르는 법', '고르는법', '추천', '비교', '뭐가 좋을까', '뭐가 좋은지', '어떤 게 좋을까',
  '어떤게 좋을까', '구매 후기', '구매후기', '가격 비교', '순위', '베스트', '고민', '추천템',
  '필수템', '준비물', '꿀템', '사용법', '고르는 방법',
];

/** postdate는 "yyyyMMdd" 형식 문자열(예: "20250615") */
function parsePostDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{8}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function summarizeNaverBlogItems(keyword: string, items: NaverBlogRawItem[]): NaverBlogPreviewSummary {
  const fetchedCount = items.length;

  const recentItems = items.filter((item) => {
    const postedAt = parsePostDate(item.postdate);
    return postedAt !== null && isWithinRecentDays(postedAt, BLOG_PERIOD_DAYS);
  });
  const usedCount = recentItems.length;
  const excludedOldCount = fetchedCount - usedCount;

  const texts = recentItems.map((item) =>
    stripHtmlTags(typeof item.description === 'string' ? item.description : '')
    + ' '
    + stripHtmlTags(typeof item.title === 'string' ? item.title : ''),
  );

  const tokenLists = texts.map((text) => tokenizeText(text, STOPWORDS, [keyword]));
  const frequentPhrases = topFrequentBigramPhrases(tokenLists, 6, 2);
  const concernPhrases = findMatchingPhrases(texts, CONCERN_PHRASE_DICTIONARY, 6);

  return {
    postCount: usedCount,
    frequentPhrases,
    concernPhrases,
    periodDays: BLOG_PERIOD_DAYS,
    fetchedCount,
    usedCount,
    excludedOldCount,
  };
}
