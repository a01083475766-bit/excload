export type ElevenFetchPanelRow = {
  mallId: string;
  accountId: string;
  rowIndex: number;
  status?: string;
  statusLabel?: string;
  placeOrderStatus?: string;
  orderNo?: string;
  productOrderNo?: string;
  shipmentBoxId?: string;
  claimLabel?: string;
  /** 표준행 추가상품 "Y|no" / "N|null" */
  addPrdRaw?: string;
};

export function isElevenConfirmableRow(
  row: Pick<
    ElevenFetchPanelRow,
    'mallId' | 'status' | 'statusLabel' | 'placeOrderStatus' | 'claimLabel'
  >,
): boolean {
  if (row.mallId !== 'eleven') return false;
  if ((row.claimLabel ?? '').trim()) return false;
  if (row.placeOrderStatus === 'OK') return false;
  const label = (row.statusLabel ?? '').trim();
  if (label.includes('결제완료')) return true;
  if (row.status === 'PAYED' && row.placeOrderStatus === 'NOT_YET') return true;
  return false;
}

export type ElevenConfirmSelectionItem = {
  ordNo: string;
  ordPrdSeq: string;
  dlvNo: string;
  addPrdYn: 'Y' | 'N';
  addPrdNo: string;
  ordStat: string;
  ordStatNm: string;
  productOrderNo: string;
};

export type ElevenConfirmSelection =
  | { ok: true; accountId: string; items: ElevenConfirmSelectionItem[] }
  | { ok: false; reason: 'EMPTY' | 'MIXED_ACCOUNTS' | 'MISSING_IDS' };

function parseAddPrd(raw?: string): { addPrdYn: 'Y' | 'N'; addPrdNo: string } {
  const value = (raw ?? '').trim();
  if (!value.includes('|')) return { addPrdYn: 'N', addPrdNo: 'null' };
  const [ynRaw, noRaw = 'null'] = value.split('|');
  const addPrdYn = ynRaw.trim().toUpperCase() === 'Y' ? 'Y' : 'N';
  return { addPrdYn, addPrdNo: (noRaw || 'null').trim() || 'null' };
}

function parseProductOrderNo(
  productOrderNo: string,
  orderNo: string,
): { ordNo: string; ordPrdSeq: string } | null {
  const raw = productOrderNo.trim();
  const fallback = orderNo.trim();
  if (!raw && !fallback) return null;
  const idx = raw.lastIndexOf('-');
  if (idx > 0 && idx < raw.length - 1) {
    return { ordNo: raw.slice(0, idx), ordPrdSeq: raw.slice(idx + 1) };
  }
  return null;
}

/**
 * 선택 행에서 11번가 발주확인 요청 항목 수집.
 * dlvNo(묶음배송번호/shipmentBoxId) 필수 — 임의 생성 금지.
 */
export function collectSelectedElevenConfirmSelection(
  rows: ElevenFetchPanelRow[],
  selectedKeys: Set<string>,
  rowKey: (mallId: string, accountId: string, rowIndex: number) => string,
): ElevenConfirmSelection {
  const byAccount = new Map<string, ElevenConfirmSelectionItem[]>();
  let missingIds = false;

  for (const row of rows) {
    if (!selectedKeys.has(rowKey(row.mallId, row.accountId, row.rowIndex))) continue;
    if (!isElevenConfirmableRow(row)) continue;
    const accountId = row.accountId?.trim() ?? '';
    if (!accountId) continue;

    const parsed = parseProductOrderNo(row.productOrderNo ?? '', row.orderNo ?? '');
    const dlvNo = (row.shipmentBoxId ?? '').trim();
    if (!parsed || !dlvNo) {
      missingIds = true;
      continue;
    }
    const { addPrdYn, addPrdNo } = parseAddPrd(row.addPrdRaw);
    const item: ElevenConfirmSelectionItem = {
      ordNo: parsed.ordNo,
      ordPrdSeq: parsed.ordPrdSeq,
      dlvNo,
      addPrdYn,
      addPrdNo,
      ordStat: '101',
      ordStatNm: (row.statusLabel ?? '결제완료').trim() || '결제완료',
      productOrderNo: `${parsed.ordNo}-${parsed.ordPrdSeq}`,
    };
    const list = byAccount.get(accountId) ?? [];
    if (!list.some((x) => x.productOrderNo === item.productOrderNo && x.dlvNo === item.dlvNo)) {
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
