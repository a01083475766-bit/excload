import type { DomeggookConfirmItemResult } from '@/app/lib/domeggook/domeggook-confirm';
import type { OrderFetchView } from '@/app/lib/order-integration/order-fetch-view';
import { buildOrderFetchViewFromStandardRow } from '@/app/lib/order-integration/order-fetch-view';
import type { StandardOrderRow } from '@/app/pipeline/order/order-pipeline';

export function mergeDomeggookConfirmedOrdersIntoFetchResult(input: {
  rows: StandardOrderRow[];
  views: OrderFetchView[];
  results: Array<Pick<DomeggookConfirmItemResult, 'displayOrderNo' | 'apiOrderNo' | 'status'>>;
}): { rows: StandardOrderRow[]; views: OrderFetchView[] } {
  const touchDisplay = new Set<string>();
  const touchApi = new Set<string>();
  for (const row of input.results) {
    if (row.status !== 'CONFIRMED' && row.status !== 'ALREADY_CONFIRMED') continue;
    if (row.displayOrderNo.trim()) touchDisplay.add(row.displayOrderNo.trim());
    if (row.apiOrderNo.trim()) touchApi.add(row.apiOrderNo.trim());
  }
  if (touchDisplay.size === 0 && touchApi.size === 0) {
    return { rows: input.rows, views: input.views };
  }

  const rows = input.rows.map((row) => {
    const orderNo = String(row['주문번호'] ?? '').trim();
    const apiNo = String(row['출고번호'] ?? '').trim();
    if (!touchDisplay.has(orderNo) && !touchApi.has(apiNo)) return row;
    return {
      ...row,
      주문상태: '배송준비중',
      센터코드: 'WAITDELI',
    };
  });

  const views = rows.map((row, index) => {
    const prev = input.views[index];
    const next = buildOrderFetchViewFromStandardRow(row, index);
    if (!prev) return next;
    const orderNo = String(row['주문번호'] ?? '').trim();
    const apiNo = String(row['출고번호'] ?? '').trim();
    if (!touchDisplay.has(orderNo) && !touchApi.has(apiNo)) {
      return { ...prev, rowIndex: index };
    }
    return {
      ...prev,
      rowIndex: index,
      status: next.status,
      statusLabel: next.statusLabel,
      placeOrderStatus: next.placeOrderStatus,
      mallOrderStatusCode: 'WAITDELI',
    };
  });

  return { rows, views };
}
