/** 「선택한 다운로드 주문」 표 표시용 순수 헬퍼 */

export const COURIER_DOWNLOAD_ORDERS_PREVIEW_LIMIT = 5;

export type CourierDownloadOrdersDisplaySlice<T> = {
  visible: T[];
  hiddenCount: number;
  canToggleExpand: boolean;
};

export function sliceCourierDownloadOrdersForDisplay<T>(
  orders: ReadonlyArray<T>,
  expanded: boolean,
  previewLimit: number = COURIER_DOWNLOAD_ORDERS_PREVIEW_LIMIT,
): CourierDownloadOrdersDisplaySlice<T> {
  const limit = Math.max(0, previewLimit);
  if (orders.length <= limit) {
    return {
      visible: [...orders],
      hiddenCount: 0,
      canToggleExpand: false,
    };
  }
  if (expanded) {
    return {
      visible: [...orders],
      hiddenCount: 0,
      canToggleExpand: true,
    };
  }
  return {
    visible: orders.slice(0, limit),
    hiddenCount: orders.length - limit,
    canToggleExpand: true,
  };
}

export function formatCourierDownloadOrdersHiddenCountLabel(hiddenCount: number): string {
  return `외 ${hiddenCount}건`;
}
