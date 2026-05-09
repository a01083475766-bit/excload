'use client';

import Link from 'next/link';

/** 택배·물류·송장 변환 등 본페이지 비로그인 안내에 공통 사용 */
export const REQUIRES_ACCOUNT_ORDER_REASON =
  '주문 정보 변환은 계정 연동 후 이용할 수 있어요.';

type BannerProps = {
  visible: boolean;
  className?: string;
};

export function RequiresAccountOrderBanner({ visible, className = '' }: BannerProps) {
  if (!visible) return null;

  return (
    <div
      className={`mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-100 ${className}`}
      role="status"
    >
      <p className="mb-3 font-medium leading-snug">{REQUIRES_ACCOUNT_ORDER_REASON}</p>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/auth/login"
          className="inline-flex min-h-9 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          로그인
        </Link>
        <Link
          href="/auth/signup"
          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-950 transition hover:bg-amber-100 dark:border-amber-700 dark:bg-zinc-900 dark:text-amber-50 dark:hover:bg-zinc-800"
        >
          회원가입
        </Link>
      </div>
    </div>
  );
}

type ModalProps = {
  open: boolean;
  onClose: () => void;
};

export function RequiresAccountOrderModal({ open, onClose }: ModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/35 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[420px] rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-900 dark:ring-1 dark:ring-zinc-700"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="requires-account-order-title"
      >
        <h3
          id="requires-account-order-title"
          className="mb-4 text-lg font-semibold text-gray-900 dark:text-zinc-100"
        >
          로그인이 필요합니다
        </h3>
        <p className="mb-6 text-sm leading-relaxed text-gray-600 dark:text-zinc-400">
          {REQUIRES_ACCOUNT_ORDER_REASON}
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          <Link
            href="/auth/login"
            className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 sm:flex-initial"
            onClick={onClose}
          >
            로그인
          </Link>
          <Link
            href="/auth/signup"
            className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-900 transition hover:bg-gray-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 sm:flex-initial"
            onClick={onClose}
          >
            회원가입
          </Link>
        </div>
        <button
          type="button"
          className="w-full rounded-lg border border-gray-200 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          onClick={onClose}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
