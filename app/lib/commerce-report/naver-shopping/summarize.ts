/**
 * 네이버 쇼핑 검색 API 응답 → 요약값 계산 (순수 함수)
 *
 * ⚠️ 입력으로 받은 원본 items는 이 함수 실행 중에만 사용되고, 반환값에는 포함되지 않습니다.
 */

import type { NaverShoppingPreviewSummary, NaverShoppingRawItem } from './types';

const STOPWORDS = new Set([
  '상품', '제품', '정품', '무료배송', '당일발송', '베스트', '인기', '신상', '단독', '특가',
]);

function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

function tokenizeTitle(title: string, excludeWord: string): string[] {
  const cleaned = stripHtmlTags(title);
  return cleaned
    .split(/[\s/,()\[\]_\-+]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => token !== excludeWord)
    .filter((token) => !STOPWORDS.has(token));
}

export function summarizeNaverShoppingItems(
  keyword: string,
  total: number,
  items: NaverShoppingRawItem[],
): NaverShoppingPreviewSummary {
  const prices = items
    .map((item) => Number(item.lprice))
    .filter((price) => Number.isFinite(price) && price > 0);

  const priceRange = prices.length > 0
    ? {
        min: Math.min(...prices),
        max: Math.max(...prices),
        avg: Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length),
        sampleSize: prices.length,
      }
    : { min: 0, max: 0, avg: 0, sampleSize: 0 };

  const wordCounts = new Map<string, number>();
  for (const item of items) {
    const title = typeof item.title === 'string' ? item.title : '';
    for (const token of tokenizeTitle(title, keyword)) {
      wordCounts.set(token, (wordCounts.get(token) ?? 0) + 1);
    }
  }
  const frequentWords = [...wordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);

  const categoryCounts = new Map<string, number>();
  for (const item of items) {
    const category = typeof item.category1 === 'string' && item.category1.trim() ? item.category1.trim() : null;
    if (!category) continue;
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }
  const representativeCategory =
    [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    keyword,
    productCount: total,
    priceRange,
    frequentWords,
    representativeCategory,
    fetchedAt: new Date().toISOString(),
  };
}
