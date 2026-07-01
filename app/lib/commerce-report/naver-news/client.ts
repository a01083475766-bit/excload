/**
 * 네이버 뉴스 검색 API — 서버 전용 호출 래퍼
 *
 * ⚠️ 이 모듈은 서버(API route)에서만 import 해야 합니다.
 * ⚠️ 응답 원본을 콘솔에 출력하거나 어디에도 저장하지 않습니다.
 * ⚠️ 기존 NAVER_SHOPPING_CLIENT_ID/SECRET을 그대로 재사용합니다(신규 환경변수 없음).
 */

import type { NaverNewsRawItem } from './types';

const NAVER_NEWS_ENDPOINT = 'https://openapi.naver.com/v1/search/news.json';
const REQUEST_TIMEOUT_MS = 8000;

export class NaverNewsApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'NaverNewsApiError';
    this.status = status;
  }
}

export interface NaverNewsFetchResult {
  total: number;
  items: NaverNewsRawItem[];
}

/** 키워드 1개에 대해 최신순 뉴스 기사 상위 100개를 조회 (원본은 호출부에서 즉시 요약 후 폐기) */
export async function fetchNaverNewsItems(query: string): Promise<NaverNewsFetchResult> {
  const clientId = process.env.NAVER_SHOPPING_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_SHOPPING_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new NaverNewsApiError('missing_credentials', 500);
  }

  const url = new URL(NAVER_NEWS_ENDPOINT);
  url.searchParams.set('query', query);
  url.searchParams.set('display', '100');
  url.searchParams.set('start', '1');
  // 최근 기사인지 판단하는 게 목적이므로 정확도(sim)가 아니라 최신순(date)으로 가져옵니다.
  url.searchParams.set('sort', 'date');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
      signal: controller.signal,
    });
  } catch {
    throw new NaverNewsApiError('network_error', 0);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new NaverNewsApiError('naver_api_error', response.status);
  }

  const data: unknown = await response.json();
  const record = (data ?? {}) as Record<string, unknown>;
  const items = Array.isArray(record.items) ? (record.items as NaverNewsRawItem[]) : [];
  const total = Number(record.total) || 0;

  return { total, items };
}
