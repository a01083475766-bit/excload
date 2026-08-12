import type { Cafe24ConfirmItemResult } from '@/app/lib/cafe24/cafe24-confirm';
import type { OrderFetchView } from '@/app/lib/order-integration/order-fetch-view';
import type { StandardOrderRow } from '@/app/pipeline/order/order-pipeline';
import { buildOrderFetchViewFromStandardRow } from '@/app/lib/order-integration/order-fetch-view';

/**
 * 발주확인 성공·이미처리 건의 상태를 배송준비중(N20)으로 갱신.
 */
export function mergeCafe24ConfirmedOrdersIntoFetchResult(input: {
  rows: StandardOrderRow[];
  views: OrderFetchView[];
  results: Array<Pick<Cafe24ConfirmItemResult, 'productOrderNo' | 'orderId' | 'status'>>;
}): { rows: StandardOrderRow[]; views: OrderFetchView[] } {
  const touch = new Set(
    input.results
      .filter((row) => row.status === 'CONFIRMED' || row.status === 'ALREADY_CONFIRMED')
      .flatMap((row) =>
        [row.productOrderNo.trim(), row.orderId.trim()].filter(Boolean),
      ),
  );
  if (touch.size === 0) {
    return { rows: input.rows, views: input.views };
  }

  const rows = input.rows.map((row) => {
    const productOrderNo = String(row['상품주문번호'] ?? '').trim();
    const orderNo = String(row['주문번호'] ?? '').trim();
    if (!touch.has(productOrderNo) && !touch.has(orderNo)) return row;
    return { ...row, 주문상태: '배송준비중', 출고타입: 'N20' };
  });

  const views = rows.map((row, index) => {
    const prev = input.views[index];
    const next = buildOrderFetchViewFromStandardRow(row, index);
    if (!prev) return next;
    const productOrderNo = String(row['상품주문번호'] ?? '').trim();
    const orderNo = String(row['주문번호'] ?? '').trim();
    if (!touch.has(productOrderNo) && !touch.has(orderNo)) {
      return { ...prev, rowIndex: index };
    }
    return {
      ...prev,
      rowIndex: index,
      status: next.status,
      statusLabel: next.statusLabel,
      placeOrderStatus: 'OK' as const,
      mallOrderStatusCode: 'N20',
      hubEligible: true,
    };
  });

  return { rows, views };
}
