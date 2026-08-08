import type { ElevenConfirmItemResult } from '@/app/lib/eleven/eleven-confirm';
import type { OrderFetchView } from '@/app/lib/order-integration/order-fetch-view';
import type { StandardOrderRow } from '@/app/pipeline/order/order-pipeline';
import { buildOrderFetchViewFromStandardRow } from '@/app/lib/order-integration/order-fetch-view';

/**
 * 발주확인 성공·이미처리 건의 상태만 배송준비중으로 갱신 (다른 배송정보는 유지).
 */
export function mergeElevenConfirmedOrdersIntoFetchResult(input: {
  rows: StandardOrderRow[];
  views: OrderFetchView[];
  results: Array<Pick<ElevenConfirmItemResult, 'productOrderNo' | 'status'>>;
}): { rows: StandardOrderRow[]; views: OrderFetchView[] } {
  const touch = new Set(
    input.results
      .filter((row) => row.status === 'CONFIRMED' || row.status === 'ALREADY_CONFIRMED')
      .map((row) => row.productOrderNo.trim())
      .filter(Boolean),
  );
  if (touch.size === 0) {
    return { rows: input.rows, views: input.views };
  }

  const rows = input.rows.map((row) => {
    const productOrderNo = String(row['상품주문번호'] ?? row['주문번호'] ?? '').trim();
    if (!touch.has(productOrderNo)) return row;
    return { ...row, 주문상태: '배송준비중' };
  });

  const views = rows.map((row, index) => {
    const prev = input.views[index];
    const next = buildOrderFetchViewFromStandardRow(row, index);
    if (!prev) return next;
    const productOrderNo = String(row['상품주문번호'] ?? row['주문번호'] ?? '').trim();
    if (!touch.has(productOrderNo)) return { ...prev, rowIndex: index };
    return {
      ...prev,
      rowIndex: index,
      status: next.status,
      statusLabel: next.statusLabel,
      placeOrderStatus: next.placeOrderStatus,
    };
  });

  return { rows, views };
}
