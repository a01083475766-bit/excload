/**
 * 네이버 쇼핑 검색 API 응답 → 요약값 계산 (순수 함수)
 *
 * ⚠️ 입력으로 받은 원본 items는 이 함수 실행 중에만 사용되고, 반환값에는 포함되지 않습니다.
 */

import { tokenizeText, topFrequentTokens, topFrequentValues } from '../text-utils';
import type { NaverShoppingPreviewPriceBucket, NaverShoppingPreviewSummary, NaverShoppingRawItem } from './types';

const STOPWORDS = new Set([
  '상품', '제품', '정품', '무료배송', '당일발송', '베스트', '인기', '신상', '단독', '특가',
]);

const PRICE_BUCKET_DEFS: { range: string; max: number | null }[] = [
  { range: '1만원 미만', max: 10000 },
  { range: '1~3만원', max: 30000 },
  { range: '3~5만원', max: 50000 },
  { range: '5~10만원', max: 100000 },
  { range: '10만원 이상', max: null },
];

function buildPriceBuckets(prices: number[]): NaverShoppingPreviewPriceBucket[] {
  if (prices.length === 0) {
    return PRICE_BUCKET_DEFS.map(({ range }) => ({ range, ratio: 0 }));
  }
  const counts = PRICE_BUCKET_DEFS.map(() => 0);
  for (const price of prices) {
    const bucketIndex = PRICE_BUCKET_DEFS.findIndex(({ max }) => max === null || price < max);
    counts[bucketIndex >= 0 ? bucketIndex : counts.length - 1] += 1;
  }
  return PRICE_BUCKET_DEFS.map(({ range }, i) => ({
    range,
    ratio: Math.round((counts[i] / prices.length) * 100) / 100,
  }));
}

function categoryPath(item: NaverShoppingRawItem): string | null {
  const parts = [item.category1, item.category2, item.category3, item.category4]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(' > ') : null;
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

  const titleTokenLists = items.map((item) =>
    tokenizeText(typeof item.title === 'string' ? item.title : '', STOPWORDS, [keyword]),
  );
  const frequentWords = topFrequentTokens(titleTokenLists, 8);

  const categoryCounts = new Map<string, number>();
  for (const item of items) {
    const path = categoryPath(item);
    if (!path) continue;
    categoryCounts.set(path, (categoryCounts.get(path) ?? 0) + 1);
  }
  const representativeCategory =
    [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const topBrands = topFrequentValues(
    items.map((item) => (typeof item.brand === 'string' ? item.brand : '')),
    3,
  );
  const topMalls = topFrequentValues(
    items.map((item) => (typeof item.mallName === 'string' ? item.mallName : '')),
    3,
  );

  return {
    productCount: total,
    priceRange,
    frequentWords,
    representativeCategory,
    topBrands,
    topMalls,
    priceBuckets: buildPriceBuckets(prices),
  };
}
