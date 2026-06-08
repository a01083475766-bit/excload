'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, PackageCheck, RotateCcw, Trash2, X } from 'lucide-react';
import {
  OrderConvertPreviewTableRow,
  type PreviewRowWithId,
} from '@/app/order-convert/OrderConvertPreviewTableRow';
import type { BundleShippingGroup } from '@/app/order-convert/bundle-shipping-utils';

/** 그룹별 1차 결정 상태 */
export type BundleGroupDecision = 'undecided' | 'individual' | 'bundle_editing' | 'bundle_done';

export type BundleShippingApplySummary = {
  deletedRowCount: number;
  modifiedOverrideCount: number;
  individualGroupCount: number;
  bundleDoneGroupCount: number;
  bundlePreviewRowCount: number;
  individualGroupLabels: string[];
  bundleDoneGroupLabels: string[];
};

export type BundleShippingApplyPayload = {
  deletedRowIds: string[];
  overrides: Record<string, Record<string, string>>;
  /** 개별배송으로 결정한 그룹 — 이후 후보 알림에서 제외 */
  ignoredGroupKeys: string[];
  summary: BundleShippingApplySummary;
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

const DECISION_PILL_CLASS: Record<BundleGroupDecision, string> = {
  undecided: 'border-amber-200 bg-amber-50 text-amber-800',
  individual: 'border-gray-200 bg-gray-100 text-gray-700',
  bundle_editing: 'border-violet-200 bg-violet-50 text-violet-800',
  bundle_done: 'border-green-200 bg-green-50 text-green-800',
};

function StatusPill({ decision }: { decision: BundleGroupDecision }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-tight ${DECISION_PILL_CLASS[decision]}`}
    >
      {DECISION_LABEL[decision]}
    </span>
  );
}

/** order-convert 미리보기 영역과 동일한 버튼·모달 톤 */
const BTN_SECONDARY =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 transition hover:bg-gray-100';
const BTN_VIOLET =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-violet-500/80 bg-violet-50 px-3 text-sm font-medium text-violet-900 transition hover:bg-violet-100';
const BTN_GREEN =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 text-sm font-medium text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300';
const BTN_RED =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 text-sm font-medium text-white transition hover:bg-red-700';
const BTN_BLUE =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700';
const SUB_MODAL_OVERLAY =
  'fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4';
const SUB_MODAL_PANEL =
  'w-full max-w-md rounded-lg border border-gray-300 bg-white p-6 shadow-lg';

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
  const [confirmSwitchGroupOpen, setConfirmSwitchGroupOpen] = useState(false);
  const [pendingGroupSwitchId, setPendingGroupSwitchId] = useState<string | null>(null);

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
    setConfirmSwitchGroupOpen(false);
    setPendingGroupSwitchId(null);
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

  const undecidedCount = groupDrafts.length - decidedCount;

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
    const remaining = draft?.rowIds.filter((id) => !removedRowIds.has(id)).length ?? 0;
    if (deleted < 1 || !draft || remaining < 1) return;
    setGroupDecisions((prev) => ({ ...prev, [activeGroupId]: 'bundle_done' }));
    setSelectedRowIds([]);
    setEditingCell(null);
    setActiveCell(null);
  };

  const bundleEditingGroupIds = useMemo(
    () => groupDrafts.filter((g) => groupDecisions[g.groupId] === 'bundle_editing').map((g) => g.groupId),
    [groupDrafts, groupDecisions],
  );

  const bundleEditingPendingLabels = useMemo(() => {
    return bundleEditingGroupIds.map((id) => {
      const meta = groups.find((g) => g.groupId === id);
      return meta?.displayName || '—';
    });
  }, [bundleEditingGroupIds, groups]);

  /** 미결정·묶음배송결정 필요 시에만 하단 진행 요약 표시 */
  const showFooterProgress = !allGroupsDecided || bundleEditingGroupIds.length > 0;

  const switchToGroup = useCallback((groupId: string) => {
    setActiveGroupId(groupId);
    setSelectedRowIds([]);
    setEditingCell(null);
    setActiveCell(null);
  }, []);

  const handleRequestSwitchGroup = useCallback(
    (targetGroupId: string) => {
      if (targetGroupId === activeGroupId) return;
      if (activeGroupId && groupDecisions[activeGroupId] === 'bundle_editing') {
        setPendingGroupSwitchId(targetGroupId);
        setConfirmSwitchGroupOpen(true);
        return;
      }
      switchToGroup(targetGroupId);
    },
    [activeGroupId, groupDecisions, switchToGroup],
  );

  const closeSwitchGroupConfirm = useCallback(() => {
    setConfirmSwitchGroupOpen(false);
    setPendingGroupSwitchId(null);
  }, []);

  const handleRequestExit = () => {
    if (hasUnsavedDraft || bundleEditingGroupIds.length > 0) {
      setConfirmExitOpen(true);
      return;
    }
    onClose();
  };

  const handleConfirmApply = () => {
    const individualDrafts = groupDrafts.filter(
      (g) => groupDecisions[g.groupId] === 'individual',
    );
    const bundleDoneDrafts = groupDrafts.filter(
      (g) => groupDecisions[g.groupId] === 'bundle_done',
    );
    const ignoredGroupKeys = individualDrafts.map((g) => g.groupId);

    const bundleRowIds = new Set(bundleDoneDrafts.flatMap((g) => g.rowIds));

    const overrides: Record<string, Record<string, string>> = {};
    for (const rowId of bundleRowIds) {
      if (removedRowIds.has(rowId)) continue;
      if (draftOverrides[rowId]) overrides[rowId] = { ...draftOverrides[rowId] };
    }

    const labelFor = (groupId: string) =>
      groups.find((g) => g.groupId === groupId)?.displayName || '—';

    const bundlePreviewRowCount = bundleDoneDrafts.reduce(
      (n, g) => n + g.rowIds.filter((id) => !removedRowIds.has(id)).length,
      0,
    );

    onApply({
      deletedRowIds: [...removedRowIds],
      overrides,
      ignoredGroupKeys,
      summary: {
        deletedRowCount: removedRowIds.size,
        modifiedOverrideCount: countModifiedRows(
          bundleDoneDrafts.flatMap((g) => g.rowIds),
          draftOverrides,
          userOverrides,
        ),
        individualGroupCount: individualDrafts.length,
        bundleDoneGroupCount: bundleDoneDrafts.length,
        bundlePreviewRowCount,
        individualGroupLabels: individualDrafts.map((g) => labelFor(g.groupId)),
        bundleDoneGroupLabels: bundleDoneDrafts.map((g) => labelFor(g.groupId)),
      },
    });
    setConfirmApplyOpen(false);
    onClose();
  };

  const getGroupDeletedCount = (groupId: string) => {
    const orig = originalGroupsRef.current.find((g) => g.groupId === groupId);
    if (!orig) return 0;
    return orig.rowIds.filter((id) => removedRowIds.has(id)).length;
  };

  /** 미리보기에 반영될 건수 (미결정 그룹은 null) */
  const getGroupPreviewApplyCount = (
    groupId: string,
    decision: BundleGroupDecision,
    rowIds: string[],
  ): number | null => {
    const orig = originalGroupsRef.current.find((g) => g.groupId === groupId);
    if (!orig) return null;
    if (decision === 'undecided') return null;
    if (decision === 'individual') return orig.rowIds.length;
    return rowIds.filter((id) => !removedRowIds.has(id)).length;
  };

  const activeGroupDeletedCount = activeGroupId ? getGroupDeletedCount(activeGroupId) : 0;

  const activeGroupRemainingCount = useMemo(() => {
    if (!activeDraft) return 0;
    return activeDraft.rowIds.filter((id) => !removedRowIds.has(id)).length;
  }, [activeDraft, removedRowIds]);

  const selectableActiveRowIds = useMemo(
    () => activeRows.filter((r) => !removedRowIds.has(r.rowId)).map((r) => r.rowId),
    [activeRows, removedRowIds],
  );

  /** 묶음배송결정: 1건 이상 삭제 예정 + 유지 1건 이상 */
  const canCompleteBundleEdit =
    activeDecision === 'bundle_editing' &&
    activeGroupDeletedCount >= 1 &&
    activeGroupRemainingCount >= 1;

  const totalCandidateRows = useMemo(
    () => groups.reduce((n, g) => n + g.rowIds.length, 0),
    [groups],
  );

  const activeGroupEditCount = useMemo(() => {
    if (!activeDraft) return 0;
    if (activeDecision !== 'bundle_editing' && activeDecision !== 'bundle_done') return 0;
    return countModifiedRows(activeDraft.rowIds, draftOverrides, userOverrides);
  }, [activeDraft, activeDecision, draftOverrides, userOverrides]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
        <div className="flex max-h-[min(92vh,900px)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-gray-300 bg-gray-200 shadow-lg">
          <div className="flex items-start justify-between border-b border-gray-300 bg-white px-6 py-5">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
                <PackageCheck className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-lg font-bold tracking-tight text-gray-900">묶음배송 가능건</h4>
                  <span className="rounded-full border border-violet-500/80 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-900 ring-1 ring-violet-100">
                    후보 {groupDrafts.length}그룹 · {totalCandidateRows}건
                  </span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-gray-500">
                  등록 양식 기준: 수령인 이름 · 연락처 · 배송지 주소로 묶음배송가능건으로
                  확인하였습니다.
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-gray-500">
                  각 주문건을 확인후 개별배송 또는 묶음배송을 정해 주세요. (자동으로 합치지
                  않습니다.)
                </p>
              </div>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              aria-label="닫기"
              onClick={handleRequestExit}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[270px_1fr]">
            <aside className="flex min-h-0 flex-col border-b border-gray-300 bg-gray-50 md:border-b-0 md:border-r">
              <div className="border-b border-gray-200 px-4 py-3 text-xs font-bold text-gray-500">
                후보 그룹
              </div>
              <ul className="max-h-44 space-y-2 overflow-y-auto p-3 md:max-h-none md:flex-1">
                {groupDrafts.map((g) => {
                  const meta = groups.find((x) => x.groupId === g.groupId);
                  const decision = groupDecisions[g.groupId] ?? 'undecided';
                  const isActive = g.groupId === activeGroupId;
                  const del = getGroupDeletedCount(g.groupId);
                  const previewApply = getGroupPreviewApplyCount(g.groupId, decision, g.rowIds);
                  const edits =
                    decision === 'bundle_done' || decision === 'bundle_editing'
                      ? countModifiedRows(g.rowIds, draftOverrides, userOverrides)
                      : 0;

                  return (
                    <li key={g.groupId}>
                      <button
                        type="button"
                        className={`w-full rounded-xl border p-3 text-left text-sm transition ${
                          isActive
                            ? 'border-violet-300 bg-white shadow-sm ring-2 ring-violet-100'
                            : 'border-transparent bg-transparent hover:border-gray-200 hover:bg-white'
                        }`}
                        onClick={() => handleRequestSwitchGroup(g.groupId)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-gray-900 line-clamp-1">
                              {meta?.displayName || '—'}
                            </div>
                            <div className="mt-0.5 text-xs text-gray-500 line-clamp-1">
                              {meta?.displayPhone}
                            </div>
                            <div className="mt-1 whitespace-nowrap text-xs text-gray-600">
                              총 {g.rowIds.length}건
                              {del > 0 && <span className="text-red-600"> · 삭제 {del}</span>}
                              {edits > 0 && <span className="text-blue-600"> · 수정 {edits}</span>}
                              {previewApply !== null && (
                                <span className="text-green-700">
                                  {' '}
                                  · 미리보기 {previewApply}건
                                </span>
                              )}
                            </div>
                          </div>
                          <StatusPill decision={decision} />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <main className="flex min-h-0 min-w-0 flex-col bg-white">
              <div className="min-h-0 flex-1 overflow-auto p-4 md:p-5">
                {activeGroupMeta && (
                  <section className="mb-4 rounded-xl border border-gray-300 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-bold text-gray-900">
                            {activeGroupMeta.displayName}
                          </h2>
                          <StatusPill decision={activeDecision} />
                        </div>
                        <p className="mt-1 text-sm text-gray-600">
                          {activeGroupMeta.displayPhone} · {activeGroupMeta.displayAddress}
                        </p>
                      </div>
                      <div
                        className="flex h-10 shrink-0 items-center whitespace-nowrap rounded-xl bg-gray-50 px-4 text-sm text-gray-600 ring-1 ring-gray-200"
                        aria-live="polite"
                      >
                        삭제 예정{' '}
                        <b className="tabular-nums text-red-600">{activeGroupDeletedCount}건</b> ·
                        수정 반영{' '}
                        <b className="tabular-nums text-blue-600">{activeGroupEditCount}건</b>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {activeDecision === 'undecided' && (
                        <>
                          <button type="button" className={BTN_SECONDARY} onClick={handleSetIndividual}>
                            개별배송하기
                          </button>
                          <button type="button" className={BTN_VIOLET} onClick={handleStartBundleEdit}>
                            <PackageCheck className="h-3.5 w-3.5" aria-hidden />
                            묶음배송하기
                          </button>
                        </>
                      )}

                      {activeDecision === 'individual' && (
                        <div className="flex w-full flex-wrap items-center gap-2">
                          <p className="max-w-md rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                            이 주문건들은 개별배송으로 유지합니다. 미리보기에 그대로 반영됩니다.
                          </p>
                          <button
                            type="button"
                            className={`${BTN_SECONDARY} shrink-0`}
                            onClick={() => activeGroupId && resetGroupToOriginal(activeGroupId)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                            되돌리기
                          </button>
                        </div>
                      )}

                      {activeDecision === 'bundle_editing' && (
                        <>
                          {selectedRowIds.length > 0 && (
                            <button
                              type="button"
                              className={BTN_RED}
                              onClick={handleRequestDeleteSelected}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              선택 삭제 ({selectedRowIds.length})
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={!canCompleteBundleEdit}
                            className={BTN_GREEN}
                            onClick={handleCompleteBundleEdit}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                            묶음배송결정
                          </button>
                          <button
                            type="button"
                            className={BTN_SECONDARY}
                            onClick={() => activeGroupId && resetGroupToOriginal(activeGroupId)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                            되돌리기
                          </button>
                        </>
                      )}

                      {activeDecision === 'bundle_done' && (
                        <div className="flex w-full flex-wrap items-center gap-2">
                          <p className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 sm:whitespace-nowrap">
                            묶음배송이 결정되었습니다. 삭제예정 주문건은 제외하고 미리보기에 반영됩니다.
                          </p>
                          <button
                            type="button"
                            className={`${BTN_SECONDARY} shrink-0`}
                            onClick={() =>
                              activeGroupId &&
                              setGroupDecisions((prev) => ({
                                ...prev,
                                [activeGroupId]: 'bundle_editing',
                              }))
                            }
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                            되돌리기
                          </button>
                        </div>
                      )}
                    </div>

                    {activeDecision === 'undecided' && (
                      <p className="mt-3 text-xs text-gray-500">
                        먼저 배송 방식을 선택해 주세요. 삭제·수정등 결정된 내용만 미리보기에
                        반영됩니다.
                      </p>
                    )}

                    {activeDecision === 'bundle_editing' && (
                      <p className="mt-3 text-xs leading-relaxed text-gray-500">
                        {activeGroupRemainingCount === 0 ? (
                          <>
                            모든 주문건이 삭제 예정입니다. 묶음배송을 결정하려면 최소 1건은 유지해야
                            합니다. 「되돌리기」 후 다시 정리해 주세요.
                          </>
                        ) : activeGroupDeletedCount === 0 ? (
                          <>
                            주문건 1건 이상 삭제·수정 후 「묶음배송결정」할 수 있습니다. 개별발송을
                            원하시면 「되돌리기」 후 「개별배송하기」를 선택해 주세요.
                          </>
                        ) : (
                          <>
                            불필요한 행을 삭제한 뒤 남은 주문의 수량·상품을 확인·수정하고{' '}
                            <span className="font-semibold text-violet-800">묶음배송결정</span>을
                            눌러 주세요. 남은 주문만 미리보기·다운로드에 반영됩니다.
                          </>
                        )}
                      </p>
                    )}
                  </section>
                )}

              <div className="min-h-0 flex-1 overflow-auto">
                {!activeDraft || activeDraft.rowIds.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">이 그룹에 주문 행이 없습니다.</p>
                ) : (
                  <div className="flex flex-col overflow-hidden rounded-lg border border-gray-300 bg-white">
                    {activeGroupDeletedCount > 0 && (
                      <p className="border-b border-red-100 bg-red-50/50 px-3 py-1.5 text-xs text-red-700">
                        삭제 예정 행은 취소선으로 표시됩니다. 미리보기에 적용할 때 제외됩니다.
                      </p>
                    )}
                    <div className="overflow-auto preview-scrollbar preview-table-no-copy">
                    <table className="min-w-max border-collapse text-sm">
                      <thead className="sticky top-0 z-10 bg-gray-50">
                        <tr>
                          <th className="border border-gray-300 px-2 py-1 text-left">
                            <input
                              type="checkbox"
                              disabled={!canEditTable || selectableActiveRowIds.length === 0}
                              checked={
                                canEditTable &&
                                selectableActiveRowIds.length > 0 &&
                                selectableActiveRowIds.every((id) => selectedRowSet.has(id))
                              }
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRowIds(selectableActiveRowIds);
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
                        {activeRows.map((row) => {
                          const markedForDeletion = removedRowIds.has(row.rowId);
                          return (
                          <OrderConvertPreviewTableRow
                            key={row.rowId}
                            row={row}
                            courierHeaders={courierHeaders}
                            overridesForRow={draftOverrides[row.rowId]}
                            isSelected={selectedRowSet.has(row.rowId)}
                            isNewRow={false}
                            markedForDeletion={markedForDeletion}
                            interactionEnabled={canEditTable && !markedForDeletion}
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
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                  </div>
                )}
              </div>
              </div>
            </main>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-300 bg-white px-6 py-4">
            <p className="text-sm text-gray-500">
              삭제 예정 <b className="text-red-600">{deletedCount}건</b> · 수정 반영{' '}
              <b className="text-blue-600">{modifiedOverrideCount}건</b> · 개별배송{' '}
              <b className="text-gray-800">{individualGroupCount}그룹</b>
              {!allGroupsDecided && (
                <span className="text-amber-700"> · 모든 그룹 결정 후 적용 가능</span>
              )}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              {showFooterProgress && (
                <p className="text-sm font-medium text-violet-950">
                  결정 완료 <b className="text-violet-800">{decidedCount}</b> / {groupDrafts.length}
                  {undecidedCount > 0 && (
                    <>
                      {' '}
                      · 미결정 <b className="text-amber-800">{undecidedCount}</b>
                    </>
                  )}
                  {bundleEditingGroupIds.length > 0 && (
                    <>
                      {' '}
                      · 묶음결정 필요{' '}
                      <b className="text-violet-800">{bundleEditingGroupIds.length}</b>
                    </>
                  )}
                </p>
              )}
              <button type="button" className={BTN_SECONDARY} onClick={handleRequestExit}>
                나가기
              </button>
              {allGroupsDecided && (
                <button
                  type="button"
                  className={BTN_BLUE}
                  onClick={() => setConfirmApplyOpen(true)}
                >
                  미리보기에 적용
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmDeleteOpen && (
        <div className={SUB_MODAL_OVERLAY}>
          <div className={SUB_MODAL_PANEL}>
            <h5 className="text-lg font-semibold text-gray-900">선택 삭제 확인</h5>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              선택한 주문건은 삭제처리됩니다.
              <br />
              다른 주문건에 상품 및 수량을 수정하신 것이 맞는지 확인해 주세요.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className={BTN_SECONDARY} onClick={() => setConfirmDeleteOpen(false)}>
                되돌리기
              </button>
              <button type="button" className={BTN_RED} onClick={handleConfirmDeleteSelected}>
                삭제확인
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmSwitchGroupOpen && activeGroupId && (
        <div className={SUB_MODAL_OVERLAY}>
          <div className={SUB_MODAL_PANEL}>
            <h5 className="text-lg font-semibold text-gray-900">묶음배송결정이 필요합니다</h5>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              이 그룹은 아직 <strong className="text-violet-900">묶음배송결정</strong>이 완료되지
              않았습니다. 다른 그룹으로 이동하기 전에 처리 방식을 선택해 주세요.
            </p>
            {!canCompleteBundleEdit && (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                묶음배송결정을 하려면 주문건 1건 이상 삭제 후 최소 1건은 남겨 두어야 합니다.
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" className={BTN_SECONDARY} onClick={closeSwitchGroupConfirm}>
                계속 편집
              </button>
              <button
                type="button"
                className={BTN_SECONDARY}
                onClick={() => {
                  resetGroupToOriginal(activeGroupId);
                  if (pendingGroupSwitchId) switchToGroup(pendingGroupSwitchId);
                  closeSwitchGroupConfirm();
                }}
              >
                되돌리기
              </button>
              <button
                type="button"
                disabled={!canCompleteBundleEdit}
                className={BTN_GREEN}
                onClick={() => {
                  handleCompleteBundleEdit();
                  if (pendingGroupSwitchId) switchToGroup(pendingGroupSwitchId);
                  closeSwitchGroupConfirm();
                }}
              >
                묶음배송결정
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmExitOpen && (
        <div className={SUB_MODAL_OVERLAY}>
          <div className={SUB_MODAL_PANEL}>
            <h5 className="text-lg font-semibold text-gray-900">나가시겠습니까?</h5>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              아직 반영하지 않은 정리 내용이 있습니다. 나가면 미리보기는 변경되지 않습니다.
            </p>
            <p className="mt-3 rounded-lg border border-violet-500/50 bg-violet-50 px-3 py-2.5 text-sm font-semibold leading-relaxed text-violet-950">
              후보 그룹 {groupDrafts.length}개 중 결정 완료 {decidedCount}개
              {undecidedCount > 0 && (
                <span className="text-amber-800"> · 미결정 {undecidedCount}개</span>
              )}
              {bundleEditingGroupIds.length > 0 && (
                <span className="text-violet-800">
                  {' '}
                  · 묶음배송결정 필요 {bundleEditingGroupIds.length}개
                </span>
              )}
            </p>
            {bundleEditingGroupIds.length > 0 && (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
                묶음배송결정이 없는 그룹이 <strong>{bundleEditingGroupIds.length}개</strong>
                있습니다.
                {bundleEditingPendingLabels.length > 0 && (
                  <span className="mt-1 block text-xs text-amber-800">
                    ({bundleEditingPendingLabels.join(', ')})
                  </span>
                )}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className={BTN_SECONDARY} onClick={() => setConfirmExitOpen(false)}>
                계속 검수
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded border border-gray-700 bg-gray-800 px-4 text-sm font-medium text-white transition hover:bg-gray-900"
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
        <div className={SUB_MODAL_OVERLAY}>
          <div className={SUB_MODAL_PANEL}>
            <h5 className="text-lg font-semibold text-gray-900">정리 내용을 적용할까요?</h5>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              정리된 내용으로 미리보기에 적용됩니다. 자동 합치기는 하지 않습니다.
            </p>
            <ul className="mt-3 space-y-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
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
              <button type="button" className={BTN_SECONDARY} onClick={() => setConfirmApplyOpen(false)}>
                취소
              </button>
              <button type="button" className={BTN_BLUE} onClick={handleConfirmApply}>
                적용
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
