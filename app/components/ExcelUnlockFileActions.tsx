'use client';

type ExcelUnlockFileActionsProps = {
  showRetry: boolean;
  onRetry: () => void;
  onUploadCancel: () => void;
};

/** 선택된 파일 줄 아래 — 비밀번호 재시도 · 업로드 취소 */
export function ExcelUnlockFileActions({
  showRetry,
  onRetry,
  onUploadCancel,
}: ExcelUnlockFileActionsProps) {
  return (
    <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs">
      {showRetry ? (
        <>
          <span className="text-amber-800 dark:text-amber-200">비밀번호 입력이 중단되었습니다</span>
          <button
            type="button"
            className="font-semibold text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
            onClick={onRetry}
          >
            다시 입력
          </button>
          <span className="text-gray-300 dark:text-zinc-600" aria-hidden>
            |
          </span>
        </>
      ) : null}
      <button
        type="button"
        className="font-semibold text-gray-600 underline-offset-2 hover:text-red-600 hover:underline dark:text-zinc-400 dark:hover:text-red-400"
        onClick={onUploadCancel}
      >
        업로드 취소
      </button>
    </div>
  );
}
