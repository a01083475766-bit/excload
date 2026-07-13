'use client';

import {
  EXCLOAD_MODAL_BODY,
  EXCLOAD_MODAL_BTN_PRIMARY,
  EXCLOAD_MODAL_OVERLAY,
  EXCLOAD_MODAL_PANEL,
  EXCLOAD_MODAL_TITLE,
} from '@/app/lib/ui/excload-preview-ui';

interface UploadTemplateChangeReuploadModalProps {
  open: boolean;
  onClose: () => void;
  /** 본문 (미지정 시 주문 파일 안내) */
  message?: string;
  /** 추가 안내 줄 */
  bodyExtra?: string;
}

/**
 * 업로드 양식 변경·등록 후 확인 시 — 주문 입력을 다시 하라는 안내
 */
export function UploadTemplateChangeReuploadModal({
  open,
  onClose,
  message = '새 양식에 맞게 변환하려면 주문 파일을 다시 업로드·첨부해 주세요.',
  bodyExtra,
}: UploadTemplateChangeReuploadModalProps) {
  if (!open) return null;

  return (
    <div className={EXCLOAD_MODAL_OVERLAY} onClick={onClose} role="presentation">
      <div
        className={`${EXCLOAD_MODAL_PANEL} max-w-md`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="upload-template-change-title"
      >
        <div className="border-b border-zinc-100 px-6 pb-4 pt-5">
          <h2 id="upload-template-change-title" className={EXCLOAD_MODAL_TITLE}>
            업로드 양식이 변경되었습니다
          </h2>
        </div>
        <p className={`px-6 py-5 ${EXCLOAD_MODAL_BODY}`}>
          {message}
          {bodyExtra ? (
            <>
              <br />
              <span className="text-zinc-500">{bodyExtra}</span>
            </>
          ) : null}
        </p>
        <div className="border-t border-zinc-100 px-6 py-4">
          <button type="button" onClick={onClose} className={`${EXCLOAD_MODAL_BTN_PRIMARY} w-full`}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
