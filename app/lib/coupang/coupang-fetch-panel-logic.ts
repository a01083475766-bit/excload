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

/** @deprecated order-integration/hub-eligibility 로 이동. 호환 re-export. */
export { isRowHubEligible } from '@/app/lib/order-integration/hub-eligibility';

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
