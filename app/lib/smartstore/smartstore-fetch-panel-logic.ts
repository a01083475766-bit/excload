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

export type SmartstoreConfirmSelection =
  | { ok: true; accountId: string; productOrderIds: string[] }
  | { ok: false; reason: 'EMPTY' | 'MIXED_ACCOUNTS' };

/**
 * 선택 행에서 발주확인용 productOrderId 수집.
 * - 동일 accountId만 허용 (복수 계정 혼합 금지)
 * - mallOrderNo(orderNo)와 productOrderNo가 같으면 ID 혼동으로 보고 제외(fail-closed)
 * - 중복 제거
 */
export function collectSelectedSmartstoreConfirmSelection(
  rows: SmartstoreFetchPanelRow[],
  selectedKeys: Set<string>,
  rowKey: (mallId: string, accountId: string, rowIndex: number) => string,
): SmartstoreConfirmSelection {
  const idsByAccount = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!selectedKeys.has(rowKey(row.mallId, row.accountId, row.rowIndex))) continue;
    if (!isSmartstorePlaceOrderNotYetRow(row)) continue;
    const accountId = row.accountId?.trim() ?? '';
    const productOrderId = row.productOrderNo?.trim() ?? '';
    const orderNo = row.orderNo?.trim() ?? '';
    if (!accountId || !productOrderId) continue;
    // productOrderId 확보가 불명확하면(주문번호로 폴백된 경우) API 호출 후보에서 제외.
    if (orderNo && productOrderId === orderNo) continue;
    const set = idsByAccount.get(accountId) ?? new Set<string>();
    set.add(productOrderId);
    idsByAccount.set(accountId, set);
  }
  if (idsByAccount.size === 0) return { ok: false, reason: 'EMPTY' };
  if (idsByAccount.size > 1) return { ok: false, reason: 'MIXED_ACCOUNTS' };
  const [accountId, ids] = [...idsByAccount.entries()][0]!;
  return { ok: true, accountId, productOrderIds: [...ids] };
}

/** @deprecated 계정 혼합 검사가 필요하면 collectSelectedSmartstoreConfirmSelection 사용 */
export function collectSelectedSmartstoreConfirmProductOrderIds(
  rows: SmartstoreFetchPanelRow[],
  selectedKeys: Set<string>,
  rowKey: (mallId: string, accountId: string, rowIndex: number) => string,
): string[] {
  const selected = collectSelectedSmartstoreConfirmSelection(rows, selectedKeys, rowKey);
  return selected.ok ? selected.productOrderIds : [];
}
