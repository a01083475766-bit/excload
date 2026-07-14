'use client';

import Link from 'next/link';
import { X, Gift } from 'lucide-react';

type Props = {
  open: boolean;
  endsAtLabel: string;
  onClose: () => void;
};

export default function FeedbackEventDownloadModal({ open, endsAtLabel, onClose }: Props) {
  if (!open) return null;

  const handleClose = () => {
    void fetch('/api/feedback-event/mark-popup-seen', {
      method: 'POST',
      credentials: 'include',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div
        className="relative w-full max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-xl"
        role="dialog"
        aria-labelledby="feedback-event-popup-title"
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-3 top-3 rounded-lg p-1 text-amber-800 hover:bg-amber-100"
          aria-label="닫기"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-start gap-3 pr-8">
          <Gift className="h-8 w-8 shrink-0 text-amber-600" aria-hidden />
          <div>
            <h2 id="feedback-event-popup-title" className="text-lg font-bold text-amber-950">
              베타 피드백
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-amber-900">
              엑클로드를 사용해 보셨다면 변환 결과·개선 의견을 남겨 주세요. 확인 후{' '}
              <strong>30일 PRO 체험</strong>(사용량 400,000, 유료 PRO와 동일)을 드립니다.
            </p>
            <p className="mt-2 text-xs text-amber-800">
              계정당 <strong>1회</strong>만 적용됩니다. 여러 글을 작성해도 체험 기간이 누적되지
              않습니다.
            </p>
            <p className="mt-1 text-xs text-amber-700">접수 마감: {endsAtLabel}까지</p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/beta-feedback/write"
            prefetch
            onClick={handleClose}
            className="flex-1 rounded-lg bg-amber-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-amber-700"
          >
            피드백 작성하기
          </Link>
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
          >
            나중에
          </button>
        </div>
      </div>
    </div>
  );
}
