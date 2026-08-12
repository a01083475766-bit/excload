import { parseCafe24ShopNo } from '@/app/lib/cafe24/cafe24-shop-no';

export type Cafe24FetchPanelRow = {
  mallId: string;
  accountId: string;
  rowIndex: number;
  status?: string;
  statusLabel?: string;
  placeOrderStatus?: string;
  orderNo?: string;
  productOrderNo?: string;
  mallOrderStatusCode?: string;
  claimLabel?: string;
  shopNo?: number;
  shopNoInvalid?: boolean;
};

export function isCafe24ConfirmableRow(
  row: Pick<
    Cafe24FetchPanelRow,
    'mallId' | 'mallOrderStatusCode' | 'placeOrderStatus' | 'claimLabel' | 'shopNoInvalid'
  >,
): boolean {
  if (row.mallId !== 'cafe24') return false;
  if ((row.claimLabel ?? '').trim()) return false;
  if (row.shopNoInvalid) return false;
  const code = (row.mallOrderStatusCode ?? '').trim().toUpperCase();
  if (code === 'N10') return true;
  return row.placeOrderStatus === 'NOT_YET';
}

export type Cafe24ConfirmSelectionItem = {
  orderId: string;
  orderItemCode: string;
  orderStatus: string;
  shopNo: number;
  shopNoInvalid?: boolean;
  productOrderNo: string;
};

export type Cafe24ConfirmSelection =
  | { ok: true; accountId: string; items: Cafe24ConfirmSelectionItem[] }
  | { ok: false; reason: 'EMPTY' | 'MIXED_ACCOUNTS' | 'MISSING_IDS' };

/**
 * 선택 행에서 카페24 발주확인(prepare) 요청 항목 수집.
 */
export function collectSelectedCafe24ConfirmSelection(
  rows: Cafe24FetchPanelRow[],
  selectedKeys: Set<string>,
  rowKey: (mallId: string, accountId: string, rowIndex: number) => string,
): Cafe24ConfirmSelection {
  const byAccount = new Map<string, Cafe24ConfirmSelectionItem[]>();
  let missingIds = false;

  for (const row of rows) {
    if (!selectedKeys.has(rowKey(row.mallId, row.accountId, row.rowIndex))) continue;
    if (!isCafe24ConfirmableRow(row)) continue;
    const accountId = row.accountId?.trim() ?? '';
    if (!accountId) continue;

    const orderId = (row.orderNo ?? '').trim();
    const orderItemCode = (row.productOrderNo ?? '').trim();
    if (!orderId) {
      missingIds = true;
      continue;
    }
    const shopParsed = parseCafe24ShopNo(row.shopNoInvalid ? 'INVALID' : row.shopNo);
    const item: Cafe24ConfirmSelectionItem = {
      orderId,
      orderItemCode: orderItemCode && orderItemCode !== orderId ? orderItemCode : '',
      orderStatus: (row.mallOrderStatusCode ?? 'N10').trim().toUpperCase() || 'N10',
      shopNo: shopParsed.ok ? shopParsed.shopNo : 1,
      shopNoInvalid: !shopParsed.ok || row.shopNoInvalid === true,
      productOrderNo: orderItemCode || orderId,
    };
    const list = byAccount.get(accountId) ?? [];
    const key = `${item.shopNo}|${item.orderId}|${item.orderItemCode}`;
    if (!list.some((x) => `${x.shopNo}|${x.orderId}|${x.orderItemCode}` === key)) {
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
