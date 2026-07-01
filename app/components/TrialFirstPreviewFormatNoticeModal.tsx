'use client';

import type { TrialFirstPreviewFormatNoticeScope } from '@/app/lib/trial-first-preview-format-notice';

type TrialFirstPreviewFormatNoticeModalProps = {
  open: boolean;
  scope: TrialFirstPreviewFormatNoticeScope;
  onContinue: () => void;
  onChangeFormat: () => void;
};

const scopeCopy = {
  courier: {
    customizeHint:
      '실제 사용하시는 택배사 업로드 파일이나, 원하시는 열 구성으로 양식을 바꾸면 결과도 그에 맞게 달라집니다.',
  },
  logistics: {
    customizeHint:
      '실제 사용하시는 물류센터·택배사 업로드 파일이나, 원하시는 열 구성으로 양식을 바꾸면 결과도 그에 맞게 달라집니다.',
  },
} as const;

export function TrialFirstPreviewFormatNoticeModal({
  open,
  scope,
  onContinue,
  onChangeFormat,
}: TrialFirstPreviewFormatNoticeModalProps) {
  if (!open) return null;

  const copy = scopeCopy[scope];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onContinue}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="trial-first-preview-format-notice-title"
        aria-describedby="trial-first-preview-format-notice-desc"
      >
        <h2
          id="trial-first-preview-format-notice-title"
          className="text-xl font-bold leading-snug text-zinc-950 dark:text-zinc-100"
        >
          지금 보이는 결과는 체험용 기본 양식입니다
        </h2>

        <div
          id="trial-first-preview-format-notice-desc"
          className="mt-5 space-y-3 text-base leading-relaxed text-zinc-800 dark:text-zinc-300"
        >
          <p>
            엑클로드는 <strong>등록하신 업로드 양식</strong>을 기준으로 주문 데이터를 정리합니다.
            지금 미리보기는 이해를 돕기 위한 <strong>기본 예시 양식</strong>으로 변환된 결과입니다.
          </p>
          <p>{copy.customizeHint}</p>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-base text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 sm:w-auto"
            onClick={onContinue}
          >
            예시 결과 계속 보기
          </button>
          <button
            type="button"
            className="w-full rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-center text-base font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-700/70 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-900/40 sm:w-auto"
            onClick={onChangeFormat}
          >
            양식 바꾸기
          </button>
        </div>
      </div>
    </div>
  );
}
