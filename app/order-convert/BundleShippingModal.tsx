'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  OrderConvertPreviewTableRow,
  type PreviewRowWithId,
} from '@/app/order-convert/OrderConvertPreviewTableRow';
import type { BundleShippingGroup } from '@/app/order-convert/bundle-shipping-utils';

export type BundleShippingApplyPayload = {
  deletedRowIds: string[];
  overrides: Record<string, Record<string, string>>;
};

type BundleShippingModalProps = {
  open: boolean;
  groups: BundleShippingGroup[];
  courierHeaders: string[];
  previewRows: PreviewRowWithId[];
  userOverrides: Record<string, Record<string, string>>;
  onClose: () => void;
  onApply: (payload: BundleShippingApplyPayload) => void;
};

type GroupDraft = {
  groupId: string;
  rowIds: string[];
};

function cloneOverridesForRows(
  rowIds: string[],
  source: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const id of rowIds) {
    if (source[id]) out[id] = { ...source[id] };
  }
  return out;
}

export function BundleShippingModal({
  open,
  groups,
  courierHeaders,
  previewRows,
  userOverrides,
  onClose,
  onApply,
}: BundleShippingModalProps) {
  const [groupDrafts, setGroupDrafts] = useState<GroupDraft[]>([]);
  const [draftOverrides, setDraftOverrides] = useState<Record<string, Record<string, string>>>({});
  const [removedRowIds, setRemovedRowIds] = useState<Set<string>>(() => new Set());
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [confirmApplyOpen, setConfirmApplyOpen] = useState(false);

  const [editingCell, setEditingCell] = useState<{ rowId: string; header: string } | null>(null);
  const [activeCell, setActiveCell] = useState<{ rowId: string; header: string } | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const previewRowMap = useMemo(() => {
    const m = new Map<string, PreviewRowWithId>();
    for (const r of previewRows) m.set(r.rowId, r);
    return m;
  }, [previewRows]);

  useEffect(() => {
    if (!open) return;

    const allRowIds = groups.flatMap((g) => g.rowIds);
    setGroupDrafts(groups.map((g) => ({ groupId: g.groupId, rowIds: [...g.rowIds] })));
    setDraftOverrides(cloneOverridesForRows(allRowIds, userOverrides));
    setRemovedRowIds(new Set());
    setActiveGroupId(groups[0]?.groupId ?? null);
    setSelectedRowIds([]);
    setConfirmApplyOpen(false);
    setEditingCell(null);
    setActiveCell(null);
    setEditingValue('');
  }, [open, groups, userOverrides]);

  const activeDraft = groupDrafts.find((g) => g.groupId === activeGroupId) ?? null;

  const activeRows = useMemo(() => {
    if (!activeDraft) return [];
    return activeDraft.rowIds
      .map((id) => previewRowMap.get(id))
      .filter((r): r is PreviewRowWithId => Boolean(r));
  }, [activeDraft, previewRowMap]);

  const selectedRowSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);

  const activeGroupMeta = groups.find((g) => g.groupId === activeGroupId);

  const commitCellEdit = useCallback((rowId: string, header: string, value: string) => {
    setDraftOverrides((prev) => {
      const row = previewRowMap.get(rowId);
      const base = String(row?.data[header] ?? '');
      const currentOverride = prev[rowId]?.[header];
      const effective = currentOverride !== undefined ? String(currentOverride) : base;
      if (value === effective) return prev;
      return {
        ...prev,
        [rowId]: {
          ...(prev[rowId] ?? {}),
          [header]: value,
        },
      };
    });
  }, [previewRowMap]);

  const handleDeleteSelected = () => {
    if (selectedRowIds.length === 0 || !activeDraft) return;
    const toRemove = new Set(selectedRowIds);
    setRemovedRowIds((prev) => {
      const next = new Set(prev);
      for (const id of toRemove) next.add(id);
      return next;
    });
    setGroupDrafts((prev) =>
      prev.map((g) =>
        g.groupId === activeDraft.groupId
          ? { ...g, rowIds: g.rowIds.filter((id) => !toRemove.has(id)) }
          : g,
      ),
    );
    setSelectedRowIds([]);
  };

  const handleRequestApply = () => {
    setConfirmApplyOpen(true);
  };

  const handleConfirmApply = () => {
    onApply({
      deletedRowIds: [...removedRowIds],
      overrides: draftOverrides,
    });
    setConfirmApplyOpen(false);
    onClose();
  };

  const deletedCount = removedRowIds.size;
  const modifiedOverrideCount = useMemo(() => {
    let n = 0;
    for (const [rowId, cols] of Object.entries(draftOverrides)) {
      const orig = userOverrides[rowId];
      if (!orig && Object.keys(cols).length > 0) {
        n++;
        continue;
      }
      if (orig && JSON.stringify(orig) !== JSON.stringify(cols)) n++;
    }
    return n;
  }, [draftOverrides, userOverrides]);

  const remainingGroupCount = groupDrafts.filter((g) => g.rowIds.length >= 2).length;

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
        <div className="flex max-h-[min(92vh,900px)] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
          <div className="border-b px-5 py-4">
            <h4 className="text-lg font-semibold text-gray-900">묶음배송 가능 건 정리</h4>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              이름·전화번호·주소가 동일한 주문끼리 묶었습니다. 한 건으로 남기려면 불필요한 행을
              삭제하고 수량·상품 등을 수정한 뒤{' '}
              <span className="font-medium text-gray-900">미리보기에 적용</span>을 눌러 주세요.
              적용 전까지 본 미리보기에는 반영되지 않습니다.
            </p>
            <p className="mt-1 text-xs text-gray-500">
              판단 기준: 수령인 이름 · 연락처 · 배송지 주소 (등록 양식 매핑 열 기준)
            </p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-0 border-b md:flex-row">
            <aside className="w-full shrink-0 border-b bg-gray-50 md:w-56 md:border-b-0 md:border-r">
              <p className="px-3 py-2 text-xs font-semibold text-gray-500">후보 그룹 ({groupDrafts.length})</p>
              <ul className="max-h-40 overflow-y-auto md:max-h-none md:flex-1">
                {groupDrafts.map((g) => {
                  const meta = groups.find((x) => x.groupId === g.groupId);
                  const isActive = g.groupId === activeGroupId;
                  return (
                    <li key={g.groupId}>
                      <button
                        type="button"
                        className={`w-full px-3 py-2.5 text-left text-sm transition ${
                          isActive
                            ? 'bg-blue-100 font-medium text-blue-900'
                            : 'hover:bg-gray-100 text-gray-800'
                        }`}
                        onClick={() => {
                          setActiveGroupId(g.groupId);
                          setSelectedRowIds([]);
                          setEditingCell(null);
                          setActiveCell(null);
                        }}
                      >
                        <div className="line-clamp-1">{meta?.displayName || '—'}</div>
                        <div className="text-xs text-gray-500 line-clamp-1">{meta?.displayPhone}</div>
                        <div className="mt-0.5 text-xs font-medium text-amber-700">{g.rowIds.length}건</div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {activeGroupMeta && (
                <div className="border-b bg-amber-50/80 px-4 py-2 text-sm text-amber-950">
                  <span className="font-medium">{activeGroupMeta.displayName}</span>
                  <span className="mx-2 text-amber-400">|</span>
                  {activeGroupMeta.displayPhone}
                  <span className="mx-2 text-amber-400">|</span>
                  <span className="line-clamp-2">{activeGroupMeta.displayAddress}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
                {selectedRowIds.length > 0 && (
                  <button
                    type="button"
                    className="inline-flex h-8 items-center rounded-md bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700"
                    onClick={handleDeleteSelected}
                  >
                    선택 삭제 ({selectedRowIds.length})
                  </button>
                )}
                {activeRows.length < 2 && activeRows.length > 0 && (
                  <span className="text-xs text-green-700">
                    이 그룹은 1건만 남았습니다. 적용 시 미리보기에 반영됩니다.
                  </span>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-4">
                {activeRows.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-8">이 그룹에 남은 행이 없습니다.</p>
                ) : (
                  <div className="overflow-auto rounded-lg border border-gray-300 bg-white">
                    <table className="min-w-max text-sm border-collapse">
                      <thead className="sticky top-0 z-10 bg-gray-50">
                        <tr>
                          <th className="border border-gray-300 px-2 py-1 text-left">
                            <input
                              type="checkbox"
                              checked={
                                activeRows.length > 0 &&
                                activeRows.every((r) => selectedRowSet.has(r.rowId))
                              }
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRowIds(activeRows.map((r) => r.rowId));
                                } else {
                                  setSelectedRowIds([]);
                                }
                              }}
                            />
                          </th>
                          {courierHeaders.map((header) => (
                            <th
                              key={header}
                              className="border border-gray-300 px-2 py-1 text-left font-semibold whitespace-nowrap"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeRows.map((row) => (
                          <OrderConvertPreviewTableRow
                            key={row.rowId}
                            row={row}
                            courierHeaders={courierHeaders}
                            overridesForRow={draftOverrides[row.rowId]}
                            isSelected={selectedRowSet.has(row.rowId)}
                            isNewRow={false}
                            localEditingHeader={
                              editingCell?.rowId === row.rowId ? editingCell.header : null
                            }
                            localEditingValue={
                              editingCell?.rowId === row.rowId ? editingValue : ''
                            }
                            localActiveHeader={
                              activeCell?.rowId === row.rowId ? activeCell.header : null
                            }
                            onToggleSelect={(rowId, checked) => {
                              setSelectedRowIds((prev) =>
                                checked
                                  ? prev.includes(rowId)
                                    ? prev
                                    : [...prev, rowId]
                                  : prev.filter((id) => id !== rowId),
                              );
                            }}
                            onCellClickStartEdit={(rowId, header, displayValue) => {
                              setEditingValue(displayValue);
                              setActiveCell({ rowId, header });
                              setEditingCell({ rowId, header });
                            }}
                            onEditingInputChange={setEditingValue}
                            onCommitEdit={commitCellEdit}
                            onFinishEditUi={() => {
                              setEditingCell(null);
                              setActiveCell(null);
                            }}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4">
            <p className="text-xs text-gray-500">
              삭제 예정 {deletedCount}건 · 수정 반영 {modifiedOverrideCount}건 · 묶음 후보 그룹{' '}
              {remainingGroupCount}개
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded border px-4 py-2 text-sm hover:bg-gray-50"
                onClick={onClose}
              >
                닫기 (적용 안 함)
              </button>
              <button
                type="button"
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                onClick={handleRequestApply}
              >
                미리보기에 적용
              </button>
            </div>
          </div>
        </div>
      </div>

      {confirmApplyOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h5 className="text-lg font-semibold text-gray-900">미리보기에 적용할까요?</h5>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              모달에서 정리한 내용이 택배 미리보기에 반영됩니다.
            </p>
            <ul className="mt-3 space-y-1 text-sm text-gray-700">
              {deletedCount > 0 && <li>· 삭제할 행: {deletedCount}건</li>}
              {modifiedOverrideCount > 0 && <li>· 셀 수정 반영: {modifiedOverrideCount}건</li>}
              {deletedCount === 0 && modifiedOverrideCount === 0 && (
                <li>· 변경 사항이 없습니다. 그대로 닫으려면 취소를 눌러 주세요.</li>
              )}
            </ul>
            <p className="mt-3 text-xs text-gray-500">
              다운로드 파일에도 적용된 미리보기 기준으로 생성됩니다.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border px-4 py-2 text-sm hover:bg-gray-50"
                onClick={() => setConfirmApplyOpen(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                onClick={handleConfirmApply}
              >
                적용
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
