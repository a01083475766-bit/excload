/**
 * 네이버 뉴스 검색 API 응답 → 요약값 계산 (순수 함수)
 *
 * ⚠️ 입력으로 받은 원본 items(title/description/link/originallink)는
 * 이 함수 실행 중에만 사용되고, 반환값에는 포함되지 않습니다.
 */

import { stripHtmlTags, tokenizeText, topFrequentTokens } from '../text-utils';
import type { NaverNewsPreviewSummary, NaverNewsRawItem } from './types';

const STOPWORDS = new Set([
  '기자', '뉴스', '보도', '오늘', '한편', '지난', '기사', '연합뉴스', '뉴시스', '데일리', '종합',
]);

export function summarizeNaverNewsItems(
  keyword: string,
  total: number,
  items: NaverNewsRawItem[],
): NaverNewsPreviewSummary {
  const tokenLists = items.map((item) => {
    const text = `${stripHtmlTags(typeof item.title === 'string' ? item.title : '')} ${
      stripHtmlTags(typeof item.description === 'string' ? item.description : '')
    }`;
    return tokenizeText(text, STOPWORDS, [keyword]);
  });

  const issueKeywords = topFrequentTokens(tokenLists, 6);

  return {
    articleCount: total,
    issueKeywords,
  };
}
