/**
 * 네이버 쇼핑 검색 API — 서버 전용 호출 래퍼
 *
 * ⚠️ 이 모듈은 서버(API route)에서만 import 해야 합니다.
 * ⚠️ 응답 원본을 콘솔에 출력하거나 어디에도 저장하지 않습니다.
 */

import type { NaverShoppingRawItem } from './types';

const NAVER_SHOP_ENDPOINT = 'https://openapi.naver.com/v1/search/shop.json';
const REQUEST_TIMEOUT_MS = 8000;

export class NaverShoppingApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'NaverShoppingApiError';
    this.status = status;
  }
}

export interface NaverShoppingFetchResult {
  total: number;
  items: NaverShoppingRawItem[];
}

/** 키워드 1개에 대해 상위 100개 상품을 조회 (원본은 호출부에서 즉시 요약 후 폐기) */
export async function fetchNaverShoppingItems(query: string): Promise<NaverShoppingFetchResult> {
  const clientId = process.env.NAVER_SHOPPING_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_SHOPPING_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new NaverShoppingApiError('missing_credentials', 500);
  }

  const url = new URL(NAVER_SHOP_ENDPOINT);
  url.searchParams.set('query', query);
  url.searchParams.set('display', '100');
  url.searchParams.set('start', '1');
  url.searchParams.set('sort', 'sim');
  url.searchParams.set('exclude', 'used:rental:cbshop');

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
    throw new NaverShoppingApiError('network_error', 0);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new NaverShoppingApiError('naver_api_error', response.status);
  }

  const data: unknown = await response.json();
  const record = (data ?? {}) as Record<string, unknown>;
  const items = Array.isArray(record.items) ? (record.items as NaverShoppingRawItem[]) : [];
  const total = Number(record.total) || 0;

  return { total, items };
}
