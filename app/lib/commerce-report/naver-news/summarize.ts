/**
 * 네이버 뉴스 검색 API 응답 → 요약값 계산 (순수 함수)
 *
 * ⚠️ 입력으로 받은 원본 items(title/description/link/originallink/pubDate)는
 * 이 함수 실행 중에만 사용되고, 반환값에는 포함되지 않습니다.
 * ⚠️ pubDate가 최근 NEWS_PERIOD_DAYS일을 벗어난 기사는 요약 계산에서 제외합니다.
 */

import { isWithinRecentDays, stripHtmlTags, tokenizeText, topFrequentTokens } from '../text-utils';
import type { NaverNewsPreviewSummary, NaverNewsRawItem } from './types';

const NEWS_PERIOD_DAYS = 7;

const STOPWORDS = new Set([
  '기자', '뉴스', '보도', '오늘', '한편', '지난', '기사', '연합뉴스', '뉴시스', '데일리', '종합',
]);

/** pubDate는 RFC822 형식 문자열(예: "Mon, 26 Sep 2016 07:50:00 +0900") — Date가 직접 파싱 가능 */
function parsePubDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function summarizeNaverNewsItems(keyword: string, items: NaverNewsRawItem[]): NaverNewsPreviewSummary {
  const fetchedCount = items.length;

  const recentItems = items.filter((item) => {
    const publishedAt = parsePubDate(item.pubDate);
    return publishedAt !== null && isWithinRecentDays(publishedAt, NEWS_PERIOD_DAYS);
  });
  const usedCount = recentItems.length;
  const excludedOldCount = fetchedCount - usedCount;

  const tokenLists = recentItems.map((item) => {
    const text = `${stripHtmlTags(typeof item.title === 'string' ? item.title : '')} ${
      stripHtmlTags(typeof item.description === 'string' ? item.description : '')
    }`;
    return tokenizeText(text, STOPWORDS, [keyword]);
  });

  const issueKeywords = topFrequentTokens(tokenLists, 6);

  return {
    articleCount: usedCount,
    issueKeywords,
    periodDays: NEWS_PERIOD_DAYS,
    fetchedCount,
    usedCount,
    excludedOldCount,
  };
}
