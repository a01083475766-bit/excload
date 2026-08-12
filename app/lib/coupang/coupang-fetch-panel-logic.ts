export type CoupangFetchPanelRow = {
  mallId: string;
  accountId: string;
  rowIndex: number;
  mallOrderStatusCode?: string;
  shipmentBoxId?: string;
  hubEligible?: boolean;
};

export function isCoupangAcceptRow(
  row: Pick<CoupangFetchPanelRow, 'mallId' | 'mallOrderStatusCode'>,
): boolean {
  return row.mallId === 'coupang' && row.mallOrderStatusCode === 'ACCEPT';
}

export function isRowHubEligible(row: Pick<CoupangFetchPanelRow, 'mallId' | 'hubEligible'>): boolean {
  if (row.mallId === 'coupang' || row.mallId === 'lotteon') return row.hubEligible === true;
  return row.hubEligible !== false;
}

export function collectSelectedAcknowledgementBoxIds(
  rows: CoupangFetchPanelRow[],
  selectedKeys: Set<string>,
  rowKey: (mallId: string, accountId: string, rowIndex: number) => string,
): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!selectedKeys.has(rowKey(row.mallId, row.accountId, row.rowIndex))) continue;
    if (!isCoupangAcceptRow(row)) continue;
    const boxId = row.shipmentBoxId?.trim();
    if (boxId) ids.add(boxId);
  }
  return [...ids];
}
