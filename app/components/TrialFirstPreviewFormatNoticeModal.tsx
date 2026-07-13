'use client';

import type { TrialFirstPreviewFormatNoticeScope } from '@/app/lib/trial-first-preview-format-notice';
import {
  EXCLOAD_MODAL_BODY,
  EXCLOAD_MODAL_BTN_PRIMARY,
  EXCLOAD_MODAL_BTN_SECONDARY,
  EXCLOAD_MODAL_OVERLAY,
  EXCLOAD_MODAL_PANEL,
  EXCLOAD_MODAL_TITLE,
} from '@/app/lib/ui/excload-preview-ui';

type TrialFirstPreviewFormatNoticeModalProps = {
  open: boolean;
  scope: TrialFirstPreviewFormatNoticeScope;
  onContinue: () => void;
  onChangeFormat: () => void;
};

export function TrialFirstPreviewFormatNoticeModal({
  open,
  onContinue,
  onChangeFormat,
}: TrialFirstPreviewFormatNoticeModalProps) {
  if (!open) return null;

  return (
    <div className={EXCLOAD_MODAL_OVERLAY} onClick={onContinue} role="presentation">
      <div
        className={`${EXCLOAD_MODAL_PANEL} max-w-lg`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="trial-first-preview-format-notice-title"
        aria-describedby="trial-first-preview-format-notice-desc"
      >
        <div className="border-b border-zinc-100 px-6 pb-4 pt-5">
          <h2 id="trial-first-preview-format-notice-title" className={EXCLOAD_MODAL_TITLE}>
            기본 양식으로 정리되었습니다
          </h2>
        </div>
        <div
          id="trial-first-preview-format-notice-desc"
          className={`space-y-2 px-6 py-5 ${EXCLOAD_MODAL_BODY}`}
        >
          <p>실제 사용하시는 업로드 파일이나 원하는 양식으로 구성하면</p>
          <p>그 양식에 맞게 정리됩니다.</p>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-zinc-100 px-6 py-4 sm:flex-row sm:justify-end">
          <button type="button" className={EXCLOAD_MODAL_BTN_SECONDARY} onClick={onContinue}>
            예시 결과 계속 보기
          </button>
          <button type="button" className={EXCLOAD_MODAL_BTN_PRIMARY} onClick={onChangeFormat}>
            양식 바꾸기
          </button>
        </div>
      </div>
    </div>
  );
}
