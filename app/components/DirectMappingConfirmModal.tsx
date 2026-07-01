'use client';

import { X } from 'lucide-react';
import { WorkspaceBlockingModalOverlay } from '@/app/components/WorkspaceBlockingModalOverlay';

export type DirectMappingFinalColumn = {
  sourceHeader: string;
  outputHeader: string;
};

type Accent = 'blue' | 'emerald';

type DirectMappingConfirmModalProps = {
  open: boolean;
  accent?: Accent;
  pendingColumns: DirectMappingFinalColumn[];
  isRegistering: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

const accentMap = {
  blue: {
    itemBorder: 'border-blue-200 dark:border-blue-900',
    badge: 'bg-blue-600',
    title: 'text-blue-800 dark:text-blue-200',
  },
  emerald: {
    itemBorder: 'border-emerald-200 dark:border-emerald-900',
    badge: 'bg-emerald-600',
    title: 'text-emerald-800 dark:text-emerald-200',
  },
} as const;

export function DirectMappingConfirmModal({
  open,
  accent = 'blue',
  pendingColumns,
  isRegistering,
  onClose,
  onConfirm,
}: DirectMappingConfirmModalProps) {
  const colors = accentMap[accent];

  return (
    <WorkspaceBlockingModalOverlay
      open={open}
      aria-labelledby="direct-mapping-confirm-title"
      panelClassName="w-full max-w-[760px]"
      overlayClassName="p-2 sm:p-4"
    >
      <div className="flex max-h-[90dvh] w-full max-w-[760px] flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 sm:max-h-[82vh] sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="direct-mapping-confirm-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
            >
              이 순서로 사용자 지정양식을 등록할까요?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              확인을 누르면 아래 순서가 다운로드 파일의 열 순서로 저장됩니다. 이 사용자 지정양식은
              표시된 원본 헤더의 셀값을 가져오므로, 같은 헤더 구조의 파일에 사용해 주세요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="수정하기"
          >
            <X className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
          </button>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
          {pendingColumns.length > 0 ? (
            <div className="flex flex-col gap-2">
              {pendingColumns.map((column, index) => (
                <div
                  key={`direct-confirm-${column.outputHeader}-${index}`}
                  className={`rounded-lg border bg-white px-3 py-2 dark:bg-zinc-900 ${colors.itemBorder}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-semibold text-white ${colors.badge}`}
                    >
                      {index + 1}
                    </span>
                    <span className={`min-w-0 break-words text-sm font-semibold ${colors.title}`}>
                      {column.outputHeader}
                    </span>
                  </div>
                  <div className="mt-1 pl-8 text-xs text-zinc-500 dark:text-zinc-400">
                    원본 헤더값: {column.sourceHeader || '새 헤더(빈 값)'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
              확인할 출력 순서가 없습니다.
            </div>
          )}
        </div>

        <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          확인 후에는 현재 미리보기가 초기화됩니다. 같은 주문파일을 다시 첨부하면 이 순서와 이름으로
          변환됩니다.
        </div>

        <div className="mt-4 flex flex-col-reverse gap-2 border-t border-zinc-200 pt-4 sm:flex-row sm:items-center sm:justify-end dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:w-auto"
          >
            수정하기
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isRegistering}
            className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {isRegistering ? '등록 중…' : '확인'}
          </button>
        </div>
      </div>
    </WorkspaceBlockingModalOverlay>
  );
}
