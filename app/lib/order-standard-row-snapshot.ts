/**
 * 미리보기 rowId ↔ Stage2 표준 행 스냅샷 (고정입력 변경 시 Fill Only 재적용용)
 */

export type OrderStandardRowsByRowId = Record<string, Record<string, string>>;

export function registerOrderSnapshotsForPreviewChunk(
  snapshots: OrderStandardRowsByRowId,
  rowIds: readonly string[],
  standardRows: readonly Record<string, string>[],
): OrderStandardRowsByRowId {
  const next = { ...snapshots };
  for (let i = 0; i < rowIds.length; i++) {
    const rowId = rowIds[i];
    const row = standardRows[i];
    if (!rowId || !row) continue;
    next[rowId] = { ...row };
  }
  return next;
}

export function pruneOrderSnapshotsForRowIds(
  snapshots: OrderStandardRowsByRowId,
  rowIds: Iterable<string>,
): OrderStandardRowsByRowId {
  const next = { ...snapshots };
  for (const id of rowIds) {
    delete next[id];
  }
  return next;
}
