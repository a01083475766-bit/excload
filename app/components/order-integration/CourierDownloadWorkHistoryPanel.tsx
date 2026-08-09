'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Download, Link2, Loader2, Trash2 } from 'lucide-react';

import type { CourierDownloadBundleListItem } from '@/app/lib/order-integration/courier-download/persist-courier-download-bundle';

type Props = {
  bundles: CourierDownloadBundleListItem[];
  selectedBundleId: string;
  onSelectForMatching: (bundleId: string) => void;
  onBundlesChanged: () => void;
  disabled?: boolean;
};

function formatExpiresHint(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return '';
  if (ms <= 0) return '만료임박';
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return `잔여 ${days}일`;
}

export function CourierDownloadWorkHistoryPanel({
  bundles,
  selectedBundleId,
  onSelectForMatching,
  onBundlesChanged,
  disabled = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allSelected = useMemo(
    () => bundles.length > 0 && bundles.every((b) => selectedIds.has(b.id)),
    [bundles, selectedIds],
  );

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(bundles.map((b) => b.id)));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRedownload = async (bundleId: string) => {
    if (disabled || busyId) return;
    setBusyId(bundleId);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/order/integration/orders/courier-download-bundles/${encodeURIComponent(bundleId)}/redownload`,
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(json?.error || '다시 받기에 실패했습니다.');
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
      const rawName = match?.[1] || match?.[2] || '엑클로드주문연동.xlsx';
      const fileName = decodeURIComponent(rawName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      const skipped = Number(res.headers.get('X-Skipped-Pii-Cleared') || '0');
      setMessage(
        skipped > 0
          ? `파일을 저장했습니다. (개인정보 삭제된 ${skipped}건은 제외됨)`
          : '파일을 저장했습니다.',
      );
    } catch {
      setError('다시 받기 중 오류가 발생했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteSelected = async () => {
    if (disabled || deleting || selectedIds.size === 0) return;
    if (
      !window.confirm(
        `선택한 ${selectedIds.size}건의 택배양식 다운로드 기록을 삭제할까요?\n삭제 후에는 이 목록·매칭 연결에서 사라집니다.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/order/integration/orders/courier-download-bundles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundleIds: [...selectedIds] }),
      });
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; deletedCount?: number; error?: string }
        | null;
      if (!res.ok || !json?.success) {
        setError(json?.error || '삭제에 실패했습니다.');
        return;
      }
      setSelectedIds(new Set());
      setMessage(`${json.deletedCount ?? 0}건을 삭제했습니다.`);
      onBundlesChanged();
    } catch {
      setError('삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        주문연동 작업 이력
        <span className="font-normal text-zinc-400">
          ({bundles.length}건 · 최대 14일)
        </span>
      </button>

      {expanded ? (
        <>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              택배양식 다운로드 기록. 매칭 연결·다시 받기·선택 삭제가 가능합니다.
            </p>
            <button
              type="button"
              disabled={disabled || deleting || selectedIds.size === 0}
              onClick={() => void handleDeleteSelected()}
              className="inline-flex h-7 items-center gap-1 rounded border border-zinc-300 bg-white px-2.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              선택 삭제{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
            </button>
          </div>

          {message ? (
            <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400">{message}</p>
          ) : null}
          {error ? (
            <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>
          ) : null}

          {bundles.length === 0 ? (
            <p className="mt-3 rounded border border-dashed border-zinc-200 px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-700">
              최근 14일 택배양식 다운로드 기록이 없습니다.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded border border-zinc-200 dark:border-zinc-700">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-zinc-50 text-[11px] text-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-400">
                  <tr>
                    <th className="w-8 px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        disabled={disabled}
                        aria-label="전체 선택"
                      />
                    </th>
                    <th className="px-2 py-1.5 font-medium">다운로드</th>
                    <th className="whitespace-nowrap px-2 py-1.5 font-medium">건수</th>
                    <th className="whitespace-nowrap px-2 py-1.5 font-medium">보관</th>
                    <th className="px-2 py-1.5 font-medium">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {bundles.map((bundle) => {
                    const isLinked =
                      selectedBundleId === bundle.id ||
                      selectedBundleId.trim() === bundle.id;
                    return (
                      <tr
                        key={bundle.id}
                        className={`border-t border-zinc-100 dark:border-zinc-800 ${
                          isLinked
                            ? 'bg-blue-50/60 dark:bg-blue-950/20'
                            : 'bg-white dark:bg-zinc-950'
                        }`}
                      >
                        <td className="px-2 py-1.5 align-middle">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(bundle.id)}
                            onChange={() => toggleOne(bundle.id)}
                            disabled={disabled}
                            aria-label={`${bundle.label} 선택`}
                          />
                        </td>
                        <td className="max-w-[280px] px-2 py-1.5 text-zinc-800 dark:text-zinc-200">
                          <span className="line-clamp-2">{bundle.label}</span>
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-zinc-600 dark:text-zinc-300">
                          {bundle.rowCount}건
                          <span className="ml-1 text-[10px] text-zinc-400">
                            (API {bundle.apiCount}·수동 {bundle.manualCount})
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-zinc-500">
                          {formatExpiresHint(bundle.expiresAt)}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => {
                                onSelectForMatching(bundle.id);
                                setMessage('위 「택배양식 다운로드 연결」에 선택했습니다.');
                                setError(null);
                              }}
                              className="inline-flex h-6 items-center gap-0.5 rounded border border-zinc-300 bg-white px-1.5 text-[10px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
                            >
                              <Link2 className="h-3 w-3" />
                              매칭 연결
                            </button>
                            <button
                              type="button"
                              disabled={disabled || busyId === bundle.id}
                              onClick={() => void handleRedownload(bundle.id)}
                              className="inline-flex h-6 items-center gap-0.5 rounded border border-blue-600 bg-white px-1.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-500 dark:text-blue-300"
                            >
                              {busyId === bundle.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Download className="h-3 w-3" />
                              )}
                              다시 받기
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
