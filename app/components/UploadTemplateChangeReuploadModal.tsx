'use client';

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
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="upload-template-change-title"
      >
        <h2
          id="upload-template-change-title"
          className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3"
        >
          업로드 양식이 변경되었습니다
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-6">
          {message}
          {bodyExtra ? (
            <>
              <br />
              <span className="text-zinc-500 dark:text-zinc-500">{bodyExtra}</span>
            </>
          ) : null}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-full h-11 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors"
        >
          확인
        </button>
      </div>
    </div>
  );
}
