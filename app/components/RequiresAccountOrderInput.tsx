'use client';

import Link from 'next/link';

/** 택배·물류·송장 변환 등 본페이지 비로그인 모달 안내에 공통 사용 */
export const REQUIRES_ACCOUNT_ORDER_REASON =
  '로그인 후 모든 서비스를 자유롭게 이용하실 수 있습니다.';

type ModalProps = {
  open: boolean;
  onClose: () => void;
};

const actionBtnBase =
  'inline-flex min-h-10 min-w-[5.5rem] items-center justify-center rounded-lg px-4 text-sm font-semibold transition';

export function RequiresAccountOrderModal({ open, onClose }: ModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[440px] rounded-xl border border-zinc-200 bg-white px-6 py-7 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="requires-account-order-title"
      >
        <p
          id="requires-account-order-title"
          className="mb-6 text-[15px] font-medium leading-relaxed text-zinc-700"
        >
          {REQUIRES_ACCOUNT_ORDER_REASON}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <Link
            href="/auth/login"
            className={`${actionBtnBase} bg-blue-600 text-white hover:bg-blue-700`}
            onClick={onClose}
          >
            로그인
          </Link>
          <Link
            href="/auth/login"
            className={`${actionBtnBase} border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50`}
            onClick={onClose}
          >
            회원가입
          </Link>
          <button
            type="button"
            className={`${actionBtnBase} border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50`}
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
