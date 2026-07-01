/**
 * 네이버 블로그 검색 API 응답 → 요약값 계산 (순수 함수)
 *
 * ⚠️ 입력으로 받은 원본 items(title/description/bloggername/bloggerlink)는
 * 이 함수 실행 중에만 사용되고, 반환값에는 포함되지 않습니다.
 */

import { findMatchingPhrases, stripHtmlTags, tokenizeText, topFrequentBigramPhrases } from '../text-utils';
import type { NaverBlogPreviewSummary, NaverBlogRawItem } from './types';

const STOPWORDS = new Set([
  '블로그', '포스팅', '오늘', '정리', '공유', '리뷰', '후기', '이번', '진짜', '완전', '너무', '정말',
]);

/** 사용자가 실제로 고민할 때 쓰는 표현 사전 — 등장한 것만 결과에 포함 */
const CONCERN_PHRASE_DICTIONARY = [
  '고르는 법', '고르는법', '추천', '비교', '뭐가 좋을까', '뭐가 좋은지', '어떤 게 좋을까',
  '어떤게 좋을까', '구매 후기', '구매후기', '가격 비교', '순위', '베스트', '고민', '추천템',
  '필수템', '준비물', '꿀템', '사용법', '고르는 방법',
];

export function summarizeNaverBlogItems(
  keyword: string,
  total: number,
  items: NaverBlogRawItem[],
): NaverBlogPreviewSummary {
  const texts = items.map((item) =>
    stripHtmlTags(typeof item.description === 'string' ? item.description : '')
    + ' '
    + stripHtmlTags(typeof item.title === 'string' ? item.title : ''),
  );

  const tokenLists = texts.map((text) => tokenizeText(text, STOPWORDS, [keyword]));
  const frequentPhrases = topFrequentBigramPhrases(tokenLists, 6, 2);
  const concernPhrases = findMatchingPhrases(texts, CONCERN_PHRASE_DICTIONARY, 6);

  return {
    postCount: total,
    frequentPhrases,
    concernPhrases,
  };
}
