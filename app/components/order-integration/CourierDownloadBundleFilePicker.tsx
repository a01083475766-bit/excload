'use client';

import { FileSpreadsheet, Ban } from 'lucide-react';

import type { CourierDownloadBundleListItem } from '@/app/lib/order-integration/courier-download/persist-courier-download-bundle';

const DOWNLOAD_BUNDLE_NONE = 'none';

type Props = {
  bundles: CourierDownloadBundleListItem[];
  selectedBundleId: string;
  onSelect: (bundleId: string) => void;
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
 * 로컬 파일이 아니라 서버 Bundle 연결용 (클릭 선택).
 */
export function CourierDownloadBundleFilePicker({
  bundles,
  selectedBundleId,
  onSelect,
  disabled = false,
}: Props) {
  const selected = selectedBundleId.trim();

  return (
    <div className="mt-3">
      <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
        택배양식 다운로드 연결
      </div>
      <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        주문조회 후 받은 택배양식을 파일처럼 고릅니다. (PC에 저장된 파일이 아니라 매칭용 기록입니다)
      </p>

      {bundles.length === 0 ? (
        <p className="mt-2 rounded border border-dashed border-zinc-200 px-3 py-4 text-center text-[11px] text-zinc-500 dark:border-zinc-700">
          연결할 택배양식 다운로드가 없습니다. 아래에서 「해당 다운로드 없음」을 선택하거나 먼저
          택배양식을 다운로드하세요.
        </p>
      ) : (
        <div className="mt-2 max-h-44 overflow-y-auto rounded border border-zinc-200 bg-zinc-50/80 p-2 dark:border-zinc-700 dark:bg-zinc-900/40">
          <div className="flex flex-wrap gap-2">
            {bundles.map((bundle) => {
              const isSelected = selected === bundle.id;
              return (
                <button
                  key={bundle.id}
                  type="button"
                  disabled={disabled}
                  title={bundle.label}
                  onClick={() => onSelect(bundle.id)}
                  className={`flex w-[7.25rem] flex-col items-center gap-1 rounded border px-1.5 py-2 text-center transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50 shadow-sm dark:border-blue-500 dark:bg-blue-950/40'
                      : 'border-zinc-200 bg-white hover:border-zinc-400 dark:border-zinc-600 dark:bg-zinc-950 dark:hover:border-zinc-500'
                  }`}
                >
                  <span
                    className={`flex h-10 w-8 items-center justify-center rounded-sm border ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-emerald-700/80 bg-emerald-600 text-white'
                    }`}
                    aria-hidden
                  >
                    <FileSpreadsheet className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <span
                    className={`w-full truncate text-[10px] font-semibold leading-tight ${
                      isSelected
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
