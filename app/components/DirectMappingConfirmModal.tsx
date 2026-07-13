'use client';

import { X } from 'lucide-react';
import { WorkspaceBlockingModalOverlay } from '@/app/components/WorkspaceBlockingModalOverlay';
import {
  EXCLOAD_MODAL_BTN_PRIMARY,
  EXCLOAD_MODAL_BTN_SECONDARY,
  EXCLOAD_MODAL_PANEL,
  EXCLOAD_MODAL_TITLE,
} from '@/app/lib/ui/excload-preview-ui';

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

export function DirectMappingConfirmModal({
  open,
  accent = 'blue',
  pendingColumns,
  isRegistering,
  onClose,
  onConfirm,
}: DirectMappingConfirmModalProps) {
  const primaryClass =
    accent === 'emerald'
      ? 'rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50'
      : EXCLOAD_MODAL_BTN_PRIMARY;

  return (
    <WorkspaceBlockingModalOverlay
      open={open}
      aria-labelledby="direct-mapping-confirm-title"
      panelClassName="w-full max-w-[760px]"
      overlayClassName="p-2 sm:p-4"
    >
      <div
        className={`${EXCLOAD_MODAL_PANEL} flex max-h-[90dvh] max-w-[760px] flex-col sm:max-h-[82vh]`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 pb-4 pt-5 sm:px-6">
          <div className="min-w-0">
            <h2 id="direct-mapping-confirm-title" className={EXCLOAD_MODAL_TITLE}>
              이 순서로 사용자 지정양식을 등록할까요?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              확인을 누르면 아래 순서가 다운로드 파일의 열 순서로 저장됩니다. 이 사용자
              지정양식은 표시된 원본 헤더의 셀값을 가져오므로, 같은 헤더 구조의 파일에 사용해
              주세요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-zinc-100"
            aria-label="수정하기"
          >
            <X className="h-5 w-5 text-zinc-500" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4 sm:px-6">
          <div className="overflow-hidden rounded-xl border border-zinc-200">
            {pendingColumns.length > 0 ? (
              <ul className="divide-y divide-zinc-100">
                {pendingColumns.map((column, index) => (
                  <li
                    key={`direct-confirm-${column.outputHeader}-${index}`}
                    className="flex items-start gap-3 bg-white px-3 py-2.5"
                  >
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-zinc-100 px-1.5 text-xs font-semibold tabular-nums text-zinc-700">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="break-words text-sm font-semibold text-zinc-900">
                        {column.outputHeader}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        원본 헤더값: {column.sourceHeader || '새 헤더(빈 값)'}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex h-24 items-center justify-center text-sm text-zinc-500">
                확인할 출력 순서가 없습니다.
              </div>
            )}
          </div>

          <p className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-600">
            확인 후에는 현재 미리보기가 초기화됩니다. 같은 주문파일을 다시 첨부하면 이 순서와
            이름으로 변환됩니다.
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-zinc-100 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} className={EXCLOAD_MODAL_BTN_SECONDARY}>
            수정하기
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isRegistering}
            className={primaryClass}
          >
            {isRegistering ? '등록 중…' : '확인'}
          </button>
        </div>
      </div>
    </WorkspaceBlockingModalOverlay>
  );
}
