export type LotteonFetchPanelRow = {
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
  procSeq?: string;
  dvRtrvDvsCd?: string;
  odTypCd?: string;
};

export function isLotteonConfirmableRow(
  row: Pick<
    LotteonFetchPanelRow,
    'mallId' | 'status' | 'placeOrderStatus' | 'claimLabel' | 'mallOrderStatusCode' | 'statusLabel'
  >,
): boolean {
  if (row.mallId !== 'lotteon') return false;
  if ((row.claimLabel ?? '').trim()) return false;
  if (row.placeOrderStatus === 'OK') return false;
  if ((row.mallOrderStatusCode ?? '').trim() === '11') return true;
  if ((row.statusLabel ?? '').includes('출고지시')) return true;
  return row.status === 'PAYED' && row.placeOrderStatus === 'NOT_YET';
}

export type LotteonConfirmSelectionItem = {
  odNo: string;
  odSeq: string;
  procSeq: string;
  dvRtrvDvsCd: string;
  odTypCd: string;
  odPrgsStepCd: string;
  productOrderNo: string;
};

export type LotteonConfirmSelection =
  | { ok: true; accountId: string; items: LotteonConfirmSelectionItem[] }
  | { ok: false; reason: 'EMPTY' | 'MIXED_ACCOUNTS' | 'MISSING_IDS' };

function parseOdSeq(productOrderNo: string, orderNo: string): { odNo: string; odSeq: string } | null {
  const raw = productOrderNo.trim();
  const fallback = orderNo.trim();
  const idx = raw.lastIndexOf('-');
  if (idx > 0 && idx < raw.length - 1) {
    return { odNo: raw.slice(0, idx), odSeq: raw.slice(idx + 1) };
  }
  if (fallback && raw && raw !== fallback) {
    return { odNo: fallback, odSeq: raw };
  }
  return null;
}

export function collectSelectedLotteonConfirmSelection(
  rows: LotteonFetchPanelRow[],
  selectedKeys: Set<string>,
  rowKey: (mallId: string, accountId: string, rowIndex: number) => string,
): LotteonConfirmSelection {
  const byAccount = new Map<string, LotteonConfirmSelectionItem[]>();
  let missingIds = false;

  for (const row of rows) {
    if (!isLotteonConfirmableRow(row)) continue;
    if (!selectedKeys.has(rowKey(row.mallId, row.accountId, row.rowIndex))) continue;
    const parsed = parseOdSeq(row.productOrderNo ?? '', row.orderNo ?? '');
    if (!parsed) {
      missingIds = true;
      continue;
    }
    const item: LotteonConfirmSelectionItem = {
      odNo: parsed.odNo,
      odSeq: parsed.odSeq,
      procSeq: (row.procSeq ?? '1').trim() || '1',
      dvRtrvDvsCd: (row.dvRtrvDvsCd ?? 'DV').trim() || 'DV',
      odTypCd: (row.odTypCd ?? '10').trim() || '10',
      odPrgsStepCd: (row.mallOrderStatusCode ?? '11').trim() || '11',
      productOrderNo: `${parsed.odNo}-${parsed.odSeq}`,
    };
    const list = byAccount.get(row.accountId) ?? [];
    list.push(item);
    byAccount.set(row.accountId, list);
  }

  if (byAccount.size === 0) {
    return { ok: false, reason: missingIds ? 'MISSING_IDS' : 'EMPTY' };
  }
  if (byAccount.size > 1) return { ok: false, reason: 'MIXED_ACCOUNTS' };
  const [accountId, items] = [...byAccount.entries()][0]!;
  return { ok: true, accountId, items };
}
