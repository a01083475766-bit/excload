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

export interface NaverShoppingPreviewPriceBucket {
  /** 예: "1만원 미만", "1~3만원" */
  range: string;
  /** 0~1, 표본 중 해당 구간 비율 */
  ratio: number;
}

/** 키워드 1개에 대한 쇼핑 검색 요약값 (원본 상품 리스트는 포함하지 않음) */
export interface NaverShoppingPreviewSummary {
  productCount: number;
  priceRange: NaverShoppingPreviewPriceRange;
  frequentWords: string[];
  representativeCategory: string | null;
  /** 등장 빈도 TOP 3 브랜드 (brand 필드가 빈 값인 상품은 집계에서 제외) */
  topBrands: string[];
  /** 등장 빈도 TOP 3 쇼핑몰명 */
  topMalls: string[];
  priceBuckets: NaverShoppingPreviewPriceBucket[];
}

/** 네이버 쇼핑 검색 API 원본 item 형태(요약 계산 중에만 사용, 저장하지 않음) */
export interface NaverShoppingRawItem {
  title?: unknown;
  lprice?: unknown;
  hprice?: unknown;
  mallName?: unknown;
  brand?: unknown;
  maker?: unknown;
  category1?: unknown;
  category2?: unknown;
  category3?: unknown;
  category4?: unknown;
}
