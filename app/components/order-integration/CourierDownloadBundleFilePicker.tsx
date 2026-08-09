'use client';

import { useEffect, useMemo, useState } from 'react';
import { Ban, FileSpreadsheet, Loader2, Trash2 } from 'lucide-react';

import type { CourierDownloadBundleListItem } from '@/app/lib/order-integration/courier-download/persist-courier-download-bundle';

const DOWNLOAD_BUNDLE_NONE = 'none';

type Props = {
  bundles: CourierDownloadBundleListItem[];
  selectedBundleId: string;
  onSelect: (bundleId: string) => void;
  onBundlesChanged: () => void;
  disabled?: boolean;
};

function formatWhen(createdAt: string): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatFakeFileName(bundle: CourierDownloadBundleListItem): string {
  return `택배양식_${bundle.rowCount}건.xlsx`;
}

/**
 * 택배양식 Bundle을 엑셀 파일처럼 보이게 선택하는 UI.
 * 타일 클릭 = 매칭 연결, 체크박스 = 선택 삭제.
 */
export function CourierDownloadBundleFilePicker({
  bundles,
  selectedBundleId,
  onSelect,
  onBundlesChanged,
  disabled = false,
}: Props) {
  const selected = selectedBundleId.trim();
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bundleIdSet = useMemo(() => new Set(bundles.map((b) => b.id)), [bundles]);

  useEffect(() => {
    setCheckedIds((prev) => {
      const next = new Set([...prev].filter((id) => bundleIdSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [bundleIdSet]);

  const toggleChecked = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (disabled || deleting || checkedIds.size === 0) return;
    if (
      !window.confirm(
        `선택한 ${checkedIds.size}건의 택배양식 다운로드를 삭제할까요?\n삭제 후에는 연결·이력 목록에서도 사라집니다.`,
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
        body: JSON.stringify({ bundleIds: [...checkedIds] }),
      });
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; deletedCount?: number; error?: string }
        | null;
      if (!res.ok || !json?.success) {
        setError(json?.error || '삭제에 실패했습니다.');
        return;
      }
      setCheckedIds(new Set());
      setMessage(`${json.deletedCount ?? 0}건을 삭제했습니다.`);
      onBundlesChanged();
    } catch {
      setError('삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            택배양식 다운로드 연결
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            파일을 클릭하면 매칭에 연결됩니다. 체크 후 선택 삭제도 가능합니다.
          </p>
        </div>
        <button
          type="button"
          disabled={disabled || deleting || checkedIds.size === 0}
          onClick={() => void handleDeleteSelected()}
          className="inline-flex h-7 items-center gap-1 rounded border border-zinc-300 bg-white px-2.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
        >
          {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          선택 삭제{checkedIds.size > 0 ? ` (${checkedIds.size})` : ''}
        </button>
      </div>

      {message ? (
        <p className="mt-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">{message}</p>
      ) : null}
      {error ? (
        <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {bundles.length === 0 ? (
        <p className="mt-2 rounded border border-dashed border-zinc-200 px-3 py-4 text-center text-[11px] text-zinc-500 dark:border-zinc-700">
          연결할 택배양식 다운로드가 없습니다. 아래에서 「해당 다운로드 없음」을 선택하거나 먼저
          택배양식을 다운로드하세요.
        </p>
      ) : (
        <div className="mt-2 max-h-44 overflow-y-auto rounded border border-zinc-200 bg-zinc-50/80 p-2 dark:border-zinc-700 dark:bg-zinc-900/40">
          <div className="flex flex-wrap gap-2">
            {bundles.map((bundle) => {
              const isLinked = selected === bundle.id;
              const isChecked = checkedIds.has(bundle.id);
              return (
                <div
                  key={bundle.id}
                  className={`relative flex w-[7.25rem] flex-col items-center gap-1 rounded border px-1.5 pb-2 pt-5 text-center transition ${
                    isLinked
                      ? 'border-blue-600 bg-blue-50 shadow-sm dark:border-blue-500 dark:bg-blue-950/40'
                      : 'border-zinc-200 bg-white dark:border-zinc-600 dark:bg-zinc-950'
                  }`}
                >
                  <label className="absolute left-1 top-1 z-10 flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={disabled || deleting}
                      onChange={() => toggleChecked(bundle.id)}
                      aria-label={`${formatFakeFileName(bundle)} 삭제 선택`}
                      className="h-3.5 w-3.5 accent-blue-600"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={disabled}
                    title={bundle.label}
                    onClick={() => onSelect(bundle.id)}
                    className="flex w-full flex-col items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span
                      className={`flex h-10 w-8 items-center justify-center rounded-sm border ${
                        isLinked
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'border-emerald-700/80 bg-emerald-600 text-white'
                      }`}
                      aria-hidden
                    >
                      <FileSpreadsheet className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <span
                      className={`w-full truncate text-[10px] font-semibold leading-tight ${
                        isLinked
                          ? 'text-blue-800 dark:text-blue-200'
                          : 'text-zinc-800 dark:text-zinc-100'
                      }`}
                    >
                      {formatFakeFileName(bundle)}
                    </span>
                    <span className="w-full truncate text-[10px] leading-tight text-zinc-500 dark:text-zinc-400">
                      {formatWhen(bundle.createdAt)}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      API {bundle.apiCount}·수동 {bundle.manualCount}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect(DOWNLOAD_BUNDLE_NONE)}
        className={`mt-2 inline-flex h-7 items-center gap-1 rounded border px-2 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
          selected === DOWNLOAD_BUNDLE_NONE
            ? 'border-blue-600 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-200'
            : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200'
        }`}
      >
        <Ban className="h-3 w-3" />
        해당 다운로드 없음
      </button>
    </div>
  );
}

export { DOWNLOAD_BUNDLE_NONE as COURIER_DOWNLOAD_BUNDLE_NONE_VALUE };
