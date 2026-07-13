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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="upload-template-change-title"
      >
        <h2
          id="upload-template-change-title"
          className="mb-3 text-lg font-semibold text-zinc-900"
        >
          업로드 양식이 변경되었습니다
        </h2>
        <p className="mb-6 text-sm leading-relaxed text-zinc-600">
          {message}
          {bodyExtra ? (
            <>
              <br />
              <span className="text-zinc-500">{bodyExtra}</span>
            </>
          ) : null}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="h-11 w-full rounded-lg bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          확인
        </button>
      </div>
    </div>
  );
}
