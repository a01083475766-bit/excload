/** 「선택한 다운로드 주문」 표 — 고정 높이 스크롤 미리보기용 헬퍼 */

/** 기본으로 한 화면에 보이는 대략 행 수 */
export const COURIER_DOWNLOAD_ORDERS_PREVIEW_LIMIT = 5;

/**
 * 헤더 1행 + 데이터 약 5행 분량.
 * text-xs / py-1 기준 (보조 엑클로드 번호가 있어도 스크롤로 확인).
 */
export const COURIER_DOWNLOAD_ORDERS_SCROLL_MAX_HEIGHT_CLASS = 'max-h-[9.5rem]';

export function shouldShowCourierDownloadOrdersScrollHint(
  orderCount: number,
  previewLimit: number = COURIER_DOWNLOAD_ORDERS_PREVIEW_LIMIT,
): boolean {
  return orderCount > previewLimit;
}

export function formatCourierDownloadOrdersScrollHint(orderCount: number): string {
  return `총 ${orderCount}건 · 스크롤하여 더 보기`;
}
