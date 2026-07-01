/**
 * 네이버 쇼핑 검색 API — 실시간 참고 조회 전용 타입
 *
 * ⚠️ 원본 상품 리스트(title/link/image/mallName/productId 등)는
 * 어디에도 저장하지 않습니다. 요약값만 서버 응답으로 전달합니다.
 */

export interface NaverShoppingPreviewPriceRange {
  min: number;
  max: number;
  avg: number;
  sampleSize: number;
}

export interface NaverShoppingPreviewSummary {
  keyword: string;
  productCount: number;
  priceRange: NaverShoppingPreviewPriceRange;
  frequentWords: string[];
  representativeCategory: string | null;
  fetchedAt: string;
}

/** 네이버 쇼핑 검색 API 원본 item 형태(요약 계산 중에만 사용, 저장하지 않음) */
export interface NaverShoppingRawItem {
  title?: unknown;
  lprice?: unknown;
  hprice?: unknown;
  category1?: unknown;
  category2?: unknown;
}
