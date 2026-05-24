'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  OrderConvertPreviewTableRow,
  type PreviewRowWithId,
} from '@/app/order-convert/OrderConvertPreviewTableRow';
import type { BundleShippingGroup } from '@/app/order-convert/bundle-shipping-utils';

/** 그룹별 1차 결정 상태 */
export type BundleGroupDecision = 'undecided' | 'individual' | 'bundle_editing' | 'bundle_done';

export type BundleShippingApplyPayload = {
  deletedRowIds: string[];
  overrides: Record<string, Record<string, string>>;
  /** 개별배송으로 결정한 그룹 — 이후 후보 알림에서 제외 */
  ignoredGroupKeys: string[];
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

const DECISION_LABEL: Record<BundleGroupDecision, string> = {
  undecided: '미결정',
  individual: '개별배송',
  bundle_editing: '묶음배송 중',
  bundle_done: '묶음배송결정',
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

function countModifiedRows(
  rowIds: string[],
  draftOverrides: Record<string, Record<string, string>>,
  userOverrides: Record<string, Record<string, string>>,
): number {
  let n = 0;
  for (const rowId of rowIds) {
    const draft = draftOverrides[rowId];
    if (!draft) continue;
    const orig = userOverrides[rowId];
    if (!orig && Object.keys(draft).length > 0) {
      n++;
      continue;
    }
    if (orig && JSON.stringify(orig) !== JSON.stringify(draft)) n++;
  }
  return n;
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
  const originalGroupsRef = useRef<BundleShippingGroup[]>([]);
  const [groupDrafts, setGroupDrafts] = useState<GroupDraft[]>([]);
  const [groupDecisions, setGroupDecisions] = useState<Record<string, BundleGroupDecision>>({});
  const [draftOverrides, setDraftOverrides] = useState<Record<string, Record<string, string>>>({});
  const [removedRowIds, setRemovedRowIds] = useState<Set<string>>(() => new Set());
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [confirmApplyOpen, setConfirmApplyOpen] = useState(false);
  const [confirmExitOpen, setConfirmExitOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [editingCell, setEditingCell] = useState<{ rowId: string; header: string } | null>(null);
  const [activeCell, setActiveCell] = useState<{ rowId: string; header: string } | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const previewRowMap = useMemo(() => {
    const m = new Map<string, PreviewRowWithId>();
    for (const r of previewRows) m.set(r.rowId, r);
    return m;
  }, [previewRows]);

  const initModalState = useCallback(() => {
    originalGroupsRef.current = groups;
    const allRowIds = groups.flatMap((g) => g.rowIds);
    setGroupDrafts(groups.map((g) => ({ groupId: g.groupId, rowIds: [...g.rowIds] })));
    setGroupDecisions(Object.fromEntries(groups.map((g) => [g.groupId, 'undecided' as const])));
    setDraftOverrides(cloneOverridesForRows(allRowIds, userOverrides));
    setRemovedRowIds(new Set());
    setActiveGroupId(groups[0]?.groupId ?? null);
    setSelectedRowIds([]);
    setConfirmApplyOpen(false);
    setConfirmExitOpen(false);
    setConfirmDeleteOpen(false);
    setEditingCell(null);
    setActiveCell(null);
    setEditingValue('');
  }, [groups, userOverrides]);

  useEffect(() => {
    if (!open) return;
    initModalState();
  }, [open, initModalState]);

  const activeDraft = groupDrafts.find((g) => g.groupId === activeGroupId) ?? null;
  const activeDecision: BundleGroupDecision = activeGroupId
    ? (groupDecisions[activeGroupId] ?? 'undecided')
    : 'undecided';
  const canEditTable = activeDecision === 'bundle_editing';

  const activeRows = useMemo(() => {
    if (!activeDraft) return [];
    return activeDraft.rowIds
      .map((id) => previewRowMap.get(id))
      .filter((r): r is PreviewRowWithId => Boolean(r));
  }, [activeDraft, previewRowMap]);

  const selectedRowSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);
  const activeGroupMeta = groups.find((g) => g.groupId === activeGroupId);

  const decidedCount = useMemo(
    () =>
      groupDrafts.filter((g) => {
        const d = groupDecisions[g.groupId];
        return d === 'individual' || d === 'bundle_done';
      }).length,
    [groupDrafts, groupDecisions],
  );

  const allGroupsDecided = decidedCount === groupDrafts.length && groupDrafts.length > 0;

  const individualGroupCount = useMemo(
    () => groupDrafts.filter((g) => groupDecisions[g.groupId] === 'individual').length,
    [groupDrafts, groupDecisions],
  );

  const deletedCount = removedRowIds.size;

  const modifiedOverrideCount = useMemo(
    () =>
      countModifiedRows(
        groupDrafts
          .filter((g) => groupDecisions[g.groupId] === 'bundle_done')
          .flatMap((g) => g.rowIds),
        draftOverrides,
        userOverrides,
      ),
    [groupDrafts, groupDecisions, draftOverrides, userOverrides],
  );

  /** 모달에서 결정·삭제·수정했으나 미리보기에 아직 적용하지 않은 경우 */
  const hasUnsavedDraft = useMemo(() => {
    if (decidedCount > 0) return true;
    if (deletedCount > 0 || modifiedOverrideCount > 0) return true;
    return groupDrafts.some((g) => groupDecisions[g.groupId] === 'bundle_editing');
  }, [decidedCount, deletedCount, modifiedOverrideCount, groupDrafts, groupDecisions]);

  const resetGroupToOriginal = useCallback(
    (groupId: string) => {
      const orig = originalGroupsRef.current.find((g) => g.groupId === groupId);
      if (!orig) return;

      setGroupDrafts((prev) =>
        prev.map((g) => (g.groupId === groupId ? { ...g, rowIds: [...orig.rowIds] } : g)),
      );
      setRemovedRowIds((prev) => {
        const next = new Set(prev);
        for (const id of orig.rowIds) next.delete(id);
        return next;
      });
      setDraftOverrides((prev) => {
        const next = { ...prev };
        for (const id of orig.rowIds) {
          if (userOverrides[id]) next[id] = { ...userOverrides[id] };
          else delete next[id];
        }
        return next;
      });
      setGroupDecisions((prev) => ({ ...prev, [groupId]: 'undecided' }));
      setSelectedRowIds([]);
      setEditingCell(null);
      setActiveCell(null);
    },
    [userOverrides],
  );

  const commitCellEdit = useCallback(
    (rowId: string, header: string, value: string) => {
      if (!canEditTable) return;
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
    },
    [canEditTable, previewRowMap],
  );

  const handleRequestDeleteSelected = () => {
    if (!canEditTable || selectedRowIds.length === 0 || !activeDraft) return;
    setConfirmDeleteOpen(true);
  };

  const handleConfirmDeleteSelected = () => {
    if (!canEditTable || selectedRowIds.length === 0 || !activeDraft) return;
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
    setConfirmDeleteOpen(false);
  };

  const handleSetIndividual = () => {
    if (!activeGroupId) return;
    setGroupDecisions((prev) => ({ ...prev, [activeGroupId]: 'individual' }));
    setSelectedRowIds([]);
    setEditingCell(null);
    setActiveCell(null);
  };

  const handleStartBundleEdit = () => {
    if (!activeGroupId) return;
    setGroupDecisions((prev) => ({ ...prev, [activeGroupId]: 'bundle_editing' }));
  };

  const handleCompleteBundleEdit = () => {
    if (!activeGroupId) return;
    const deleted = getGroupDeletedCount(activeGroupId);
    const draft = groupDrafts.find((g) => g.groupId === activeGroupId);
    if (deleted < 1 || !draft || draft.rowIds.length < 1) return;
    setGroupDecisions((prev) => ({ ...prev, [activeGroupId]: 'bundle_done' }));
    setSelectedRowIds([]);
    setEditingCell(null);
    setActiveCell(null);
  };

  const handleRequestExit = () => {
    if (hasUnsavedDraft) {
      setConfirmExitOpen(true);
      return;
    }
    onClose();
  };

  const handleConfirmApply = () => {
    const ignoredGroupKeys = groupDrafts
      .filter((g) => groupDecisions[g.groupId] === 'individual')
      .map((g) => g.groupId);

    const bundleRowIds = new Set(
      groupDrafts
        .filter((g) => groupDecisions[g.groupId] === 'bundle_done')
        .flatMap((g) => g.rowIds),
    );

    const overrides: Record<string, Record<string, string>> = {};
    for (const rowId of bundleRowIds) {
      if (removedRowIds.has(rowId)) continue;
      if (draftOverrides[rowId]) overrides[rowId] = { ...draftOverrides[rowId] };
    }

    onApply({
      deletedRowIds: [...removedRowIds],
      overrides,
      ignoredGroupKeys,
    });
    setConfirmApplyOpen(false);
    onClose();
  };

  const getGroupDeletedCount = (groupId: string) => {
    const orig = originalGroupsRef.current.find((g) => g.groupId === groupId);
    const draft = groupDrafts.find((g) => g.groupId === groupId);
    if (!orig || !draft) return 0;
    return orig.rowIds.length - draft.rowIds.length;
  };

  const activeGroupDeletedCount = activeGroupId ? getGroupDeletedCount(activeGroupId) : 0;

  /** 묶음배송결정: 1건 이상 삭제했고, 최소 1행은 남아 있어야 함 */
  const canCompleteBundleEdit =
    activeDecision === 'bundle_editing' &&
    activeGroupDeletedCount >= 1 &&
    activeRows.length >= 1;

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
        <div className="flex max-h-[min(92vh,900px)] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
          <div className="border-b px-5 py-4">
            <h4 className="text-lg font-semibold text-gray-900">묶음배송가능건</h4>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              이름·전화·주소가 같은 주문을 후보 그룹으로 보여 드립니다. 각 그룹마다{' '}
              <span className="font-medium">개별배송</span> 또는{' '}
              <span className="font-medium">묶음배송</span>을 먼저 선택해 주세요. 자동으로
              합치지 않으며, 묶음배송 시에만 행 삭제·셀 수정이 가능합니다.
            </p>
            <p className="mt-1 text-xs text-gray-500">
              판단 기준: 수령인 이름 · 연락처 · 배송지 주소 (등록 양식 매핑 열 기준)
            </p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-0 border-b md:flex-row">
            <aside className="w-full shrink-0 border-b bg-gray-50 md:w-60 md:border-b-0 md:border-r">
              <p className="px-3 py-2 text-xs font-semibold text-gray-500">후보 그룹</p>
              <ul className="max-h-40 overflow-y-auto md:max-h-none md:flex-1">
                {groupDrafts.map((g) => {
                  const meta = groups.find((x) => x.groupId === g.groupId);
                  const decision = groupDecisions[g.groupId] ?? 'undecided';
                  const isActive = g.groupId === activeGroupId;
                  const del = getGroupDeletedCount(g.groupId);
                  const edits =
                    decision === 'bundle_done' || decision === 'bundle_editing'
                      ? countModifiedRows(g.rowIds, draftOverrides, userOverrides)
                      : 0;

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
                        <div className="flex items-center justify-between gap-1">
                          <span className="line-clamp-1">{meta?.displayName || '—'}</span>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              decision === 'undecided'
                                ? 'bg-amber-100 text-amber-800'
                                : decision === 'individual'
                                  ? 'bg-gray-200 text-gray-700'
                                  : decision === 'bundle_editing'
                                    ? 'bg-violet-100 text-violet-800'
                                    : 'bg-green-100 text-green-800'
                            }`}
                          >
                            {DECISION_LABEL[decision]}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 line-clamp-1">{meta?.displayPhone}</div>
                        <div className="mt-0.5 text-xs text-gray-600">
                          총 {g.rowIds.length}건
                          {del > 0 && <span className="text-red-600"> · 삭제 예정 {del}</span>}
                          {edits > 0 && <span className="text-blue-600"> · 수정 {edits}</span>}
                        </div>
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

              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
                {activeDecision === 'undecided' && (
                  <>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center rounded-md border border-gray-400 bg-white px-4 text-sm font-medium text-gray-800 hover:bg-gray-50"
                      onClick={handleSetIndividual}
                    >
                      개별배송하기
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center rounded-md border border-violet-500 bg-violet-50 px-4 text-sm font-medium text-violet-900 hover:bg-violet-100"
                      onClick={handleStartBundleEdit}
                    >
                      묶음배송하기
                    </button>
                    <p className="text-xs text-gray-500">
                      먼저 배송 방식을 선택해 주세요. 선택 전에는 삭제·수정할 수 없습니다.
                    </p>
                  </>
                )}

                {activeDecision === 'individual' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-800">
                      이 주문건들은 개별배송으로 유지합니다. 미리보기에 그대로 반영됩니다.
                    </p>
                    <button
                      type="button"
                      className="inline-flex h-9 shrink-0 items-center rounded-md border border-gray-400 bg-white px-4 text-sm font-medium text-gray-800 hover:bg-gray-50"
                      onClick={() => activeGroupId && resetGroupToOriginal(activeGroupId)}
                    >
                      되돌리기
                    </button>
                  </div>
                )}

                {activeDecision === 'bundle_editing' && (
                  <>
                    {selectedRowIds.length > 0 && (
                      <button
                        type="button"
                        className="inline-flex h-8 items-center rounded-md bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700"
                        onClick={handleRequestDeleteSelected}
                      >
                        선택 삭제 ({selectedRowIds.length})
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!canCompleteBundleEdit}
                      className={`inline-flex h-9 items-center rounded-md px-4 text-sm font-medium text-white ${
                        canCompleteBundleEdit
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'cursor-not-allowed bg-green-300'
                      }`}
                      onClick={handleCompleteBundleEdit}
                    >
                      묶음배송결정
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-9 shrink-0 items-center rounded-md border border-gray-400 bg-white px-4 text-sm font-medium text-gray-800 hover:bg-gray-50"
                      onClick={() => activeGroupId && resetGroupToOriginal(activeGroupId)}
                    >
                      되돌리기
                    </button>
                    <p className="w-full text-xs text-gray-500">
                      {activeRows.length === 0 ? (
                        <>
                          모든 행을 삭제했습니다. 묶음배송을 결정하려면 최소 1건은 남겨 두거나
                          「되돌리기」 후 「개별배송하기」를 선택해 주세요.
                        </>
                      ) : activeGroupDeletedCount === 0 ? (
                        <>
                          주문건 1건 이상 삭제·상품·수량 등의 수정 후 「묶음배송결정」을 할 수
                          있습니다. 묶음배송을 원하지 않으면 「개별배송하기」를 선택해 주세요.
                        </>
                      ) : (
                        <>
                          불필요한 행을 삭제한 뒤 남은 주문의 수량·상품을 확인·수정하고{' '}
                          <span className="text-sm font-semibold text-blue-600">
                            묶음배송결정
                          </span>
                          을 눌러 주세요. 남은 주문건수만 미리보기·업로드 파일에 적용됩니다.
                        </>
                      )}
                    </p>
                  </>
                )}

                {activeDecision === 'bundle_done' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-900">
                      이 그룹의 묶음배송이 결정되었습니다. 하단 「선택한 정리 내용 적용」으로
                      미리보기에 반영할 수 있습니다.
                    </p>
                    <button
                      type="button"
                      className="inline-flex h-8 items-center rounded border px-3 text-xs hover:bg-gray-50"
                      onClick={() =>
                        activeGroupId &&
                        setGroupDecisions((prev) => ({ ...prev, [activeGroupId]: 'bundle_editing' }))
                      }
                    >
                      다시 묶음배송
                    </button>
                  </div>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-4">
                {activeRows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">이 그룹에 남은 행이 없습니다.</p>
                ) : (
                  <div className="overflow-auto rounded-lg border border-gray-300 bg-white">
                    <table className="min-w-max border-collapse text-sm">
                      <thead className="sticky top-0 z-10 bg-gray-50">
                        <tr>
                          <th className="border border-gray-300 px-2 py-1 text-left">
                            <input
                              type="checkbox"
                              disabled={!canEditTable}
                              checked={
                                canEditTable &&
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
                              className="whitespace-nowrap border border-gray-300 px-2 py-1 text-left font-semibold"
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
                            interactionEnabled={canEditTable}
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
              삭제 예정 {deletedCount}건 · 수정 반영 {modifiedOverrideCount}건 · 개별배송{' '}
              {individualGroupCount}그룹
              {!allGroupsDecided && (
                <span className="text-amber-700"> · 모든 그룹 결정 후 적용 가능</span>
              )}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              <p className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800">
                후보 그룹 {groupDrafts.length}개 중 결정 완료 {decidedCount}개
                {groupDrafts.length - decidedCount > 0 && (
                  <span className="text-amber-700">
                    {' '}
                    · 미결정 {groupDrafts.length - decidedCount}개
                  </span>
                )}
              </p>
              <button
                type="button"
                className="rounded border px-4 py-2 text-sm hover:bg-gray-50"
                onClick={handleRequestExit}
              >
                나가기
              </button>
              {allGroupsDecided && (
                <button
                  type="button"
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  onClick={() => setConfirmApplyOpen(true)}
                >
                  선택한 정리 내용 적용
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmDeleteOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h5 className="text-lg font-semibold text-gray-900">선택 삭제 확인</h5>
            <p className="mt-3 text-sm leading-relaxed text-gray-700">
              선택한 주문건은 삭제처리됩니다.
              <br />
              다른 주문건에 상품 및 수량을 수정하신 것이 맞는지 확인해 주세요.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-md border border-gray-400 bg-white px-4 text-sm font-medium text-gray-800 hover:bg-gray-50"
                onClick={() => setConfirmDeleteOpen(false)}
              >
                되돌리기
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700"
                onClick={handleConfirmDeleteSelected}
              >
                삭제확인
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmExitOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h5 className="text-lg font-semibold text-gray-900">나가시겠습니까?</h5>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              아직 반영하지 않은 정리 내용이 있습니다. 나가면 미리보기는 변경되지 않습니다.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border px-4 py-2 text-sm hover:bg-gray-50"
                onClick={() => setConfirmExitOpen(false)}
              >
                계속 검수
              </button>
              <button
                type="button"
                className="rounded bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900"
                onClick={() => {
                  setConfirmExitOpen(false);
                  onClose();
                }}
              >
                나가기
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmApplyOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h5 className="text-lg font-semibold text-gray-900">정리 내용을 적용할까요?</h5>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              선택한 내용만 택배 미리보기에 반영됩니다. 자동 합치기는 하지 않습니다.
            </p>
            <ul className="mt-3 space-y-1 text-sm text-gray-700">
              {individualGroupCount > 0 && (
                <li>· 개별배송 {individualGroupCount}그룹: 미리보기 변경 없음 (후보 알림 제외)</li>
              )}
              {deletedCount > 0 && <li>· 미리보기에서 삭제: {deletedCount}건</li>}
              {modifiedOverrideCount > 0 && <li>· 셀 수정 반영: {modifiedOverrideCount}건</li>}
              {deletedCount === 0 && modifiedOverrideCount === 0 && individualGroupCount === 0 && (
                <li>· 미리보기에 반영할 삭제·수정이 없습니다.</li>
              )}
            </ul>
            <p className="mt-3 text-xs text-gray-500">
              다운로드 파일은 미리보기와 동일한 데이터로 생성됩니다.
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
