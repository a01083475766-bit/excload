import type { LotteonConfirmItemResult } from '@/app/lib/lotteon/lotteon-confirm';
import type { OrderFetchView } from '@/app/lib/order-integration/order-fetch-view';
import type { StandardOrderRow } from '@/app/pipeline/order/order-pipeline';

export function mergeLotteonConfirmedOrdersIntoFetchResult(input: {
  rows: StandardOrderRow[];
  views: OrderFetchView[];
  results: Array<
    Pick<LotteonConfirmItemResult, 'productOrderNo' | 'status' | 'standardRows' | 'views'>
  >;
}): { rows: StandardOrderRow[]; views: OrderFetchView[] } {
  const rows = input.rows.map((row) => ({ ...row }));
  const views = input.views.map((view) => ({ ...view }));

  for (const result of input.results) {
    if (result.status !== 'CONFIRMED' && result.status !== 'ALREADY_CONFIRMED') continue;
    const patchRow = result.standardRows?.[0];
    const patchView = result.views?.[0];
    for (let i = 0; i < rows.length; i += 1) {
      const productOrderNo = String(rows[i]?.['상품주문번호'] ?? '').trim();
      if (productOrderNo !== result.productOrderNo) continue;
      if (patchRow) {
        rows[i] = {
          ...rows[i]!,
          ...patchRow,
          상품주문번호: result.productOrderNo,
          주문상태: '상품준비',
        };
      } else {
        rows[i] = { ...rows[i]!, 주문상태: '상품준비' };
      }
      if (views[i]) {
        const remain =
          typeof views[i]!.remainQuantity === 'number' ? views[i]!.remainQuantity! : undefined;
        views[i] = {
          ...views[i]!,
          ...(patchView ?? {}),
          rowIndex: i,
          status: 'PAYED',
          statusLabel: '상품준비',
          placeOrderStatus: 'OK',
          mallOrderStatusCode: '12',
          hubEligible: remain == null ? true : remain > 0,
          productOrderNo: result.productOrderNo,
        };
      }
    }
  }

  return { rows, views };
}
