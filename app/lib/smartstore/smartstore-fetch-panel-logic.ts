export type SmartstoreFetchPanelRow = {
  mallId: string;
  accountId: string;
  rowIndex: number;
  status?: string;
  placeOrderStatus?: string;
  orderNo?: string;
  productOrderNo?: string;
  claimLabel?: string;
};

export function isSmartstorePlaceOrderNotYetRow(
  row: Pick<SmartstoreFetchPanelRow, 'mallId' | 'status' | 'placeOrderStatus' | 'claimLabel'>,
): boolean {
  if (row.mallId !== 'smartstore') return false;
  if (row.status !== 'PAYED') return false;
  if (row.placeOrderStatus !== 'NOT_YET') return false;
  if ((row.claimLabel ?? '').trim()) return false;
  return true;
}

/**
 * 선택 행에서 발주확인용 productOrderId만 수집.
 * - mallOrderNo(orderNo)와 productOrderNo가 같으면 ID 혼동으로 보고 제외(fail-closed)
 * - 중복 제거
 */
export function collectSelectedSmartstoreConfirmProductOrderIds(
  rows: SmartstoreFetchPanelRow[],
  selectedKeys: Set<string>,
  rowKey: (mallId: string, accountId: string, rowIndex: number) => string,
): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!selectedKeys.has(rowKey(row.mallId, row.accountId, row.rowIndex))) continue;
    if (!isSmartstorePlaceOrderNotYetRow(row)) continue;
    const productOrderId = row.productOrderNo?.trim() ?? '';
    const orderNo = row.orderNo?.trim() ?? '';
    if (!productOrderId) continue;
    // productOrderId 확보가 불명확하면(주문번호로 폴백된 경우) API 호출 후보에서 제외.
    if (orderNo && productOrderId === orderNo) continue;
    ids.add(productOrderId);
  }
  return [...ids];
}
