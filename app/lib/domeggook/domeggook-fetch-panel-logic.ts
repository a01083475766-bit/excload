export type DomeggookFetchPanelRow = {
  mallId: string;
  accountId: string;
  rowIndex: number;
  status?: string;
  statusLabel?: string;
  placeOrderStatus?: string;
  orderNo?: string;
  productOrderNo?: string;
  claimLabel?: string;
  mallOrderStatusCode?: string;
  /** 표준행 출고번호(API 숫자 주문번호) */
  apiOrderNo?: string;
};

export function isDomeggookConfirmableRow(
  row: Pick<
    DomeggookFetchPanelRow,
    'mallId' | 'status' | 'statusLabel' | 'placeOrderStatus' | 'claimLabel' | 'mallOrderStatusCode'
  >,
): boolean {
  if (row.mallId !== 'domeggook') return false;
  if ((row.claimLabel ?? '').trim()) return false;
  if (row.placeOrderStatus === 'OK') return false;
  const mode = (row.mallOrderStatusCode ?? '').trim().toUpperCase();
  if (mode === 'WAITCHK') return true;
  const label = (row.statusLabel ?? '').trim();
  if (label === '결제완료') return true;
  return row.status === 'PAYED' && row.placeOrderStatus === 'NOT_YET';
}

export type DomeggookConfirmSelectionItem = {
  displayOrderNo: string;
  apiOrderNo: string;
  orderUid: string;
  statusMode: string;
  statusLabel: string;
};

export type DomeggookConfirmSelection =
  | { ok: true; accountId: string; items: DomeggookConfirmSelectionItem[] }
  | { ok: false; reason: 'EMPTY' | 'MIXED_ACCOUNTS' | 'MISSING_IDS' };

export function collectSelectedDomeggookConfirmSelection(
  rows: DomeggookFetchPanelRow[],
  selectedKeys: Set<string>,
  rowKey: (mallId: string, accountId: string, rowIndex: number) => string,
): DomeggookConfirmSelection {
  const byAccount = new Map<string, DomeggookConfirmSelectionItem[]>();
  let missingIds = false;

  for (const row of rows) {
    if (!selectedKeys.has(rowKey(row.mallId, row.accountId, row.rowIndex))) continue;
    if (!isDomeggookConfirmableRow(row)) continue;
    const accountId = row.accountId?.trim() ?? '';
    if (!accountId) continue;

    const displayOrderNo = (row.orderNo ?? '').trim();
    const apiOrderNo = (row.apiOrderNo ?? '').trim();
    if (!displayOrderNo || !/^\d+$/.test(apiOrderNo)) {
      missingIds = true;
      continue;
    }

    const item: DomeggookConfirmSelectionItem = {
      displayOrderNo,
      apiOrderNo,
      orderUid: (row.productOrderNo ?? '').trim(),
      statusMode: (row.mallOrderStatusCode ?? 'WAITCHK').trim() || 'WAITCHK',
      statusLabel: (row.statusLabel ?? '결제완료').trim() || '결제완료',
    };
    const list = byAccount.get(accountId) ?? [];
    if (!list.some((x) => x.apiOrderNo === item.apiOrderNo)) {
      list.push(item);
    }
    byAccount.set(accountId, list);
  }

  if (byAccount.size === 0) {
    return { ok: false, reason: missingIds ? 'MISSING_IDS' : 'EMPTY' };
  }
  if (byAccount.size > 1) return { ok: false, reason: 'MIXED_ACCOUNTS' };
  const [accountId, items] = [...byAccount.entries()][0]!;
  if (items.length === 0) return { ok: false, reason: missingIds ? 'MISSING_IDS' : 'EMPTY' };
  return { ok: true, accountId, items };
}
