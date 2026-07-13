'use client';

import Link from 'next/link';
import {
  EXCLOAD_MODAL_BTN_PRIMARY,
  EXCLOAD_MODAL_BTN_SECONDARY,
  EXCLOAD_MODAL_OVERLAY,
  EXCLOAD_MODAL_PANEL,
} from '@/app/lib/ui/excload-preview-ui';

/** 택배·물류·송장 변환 등 본페이지 비로그인 모달 안내에 공통 사용 */
export const REQUIRES_ACCOUNT_ORDER_REASON =
  '로그인 후 모든 서비스를 자유롭게 이용하실 수 있습니다.';

type ModalProps = {
  open: boolean;
  onClose: () => void;
};

export function RequiresAccountOrderModal({ open, onClose }: ModalProps) {
  if (!open) return null;

  return (
    <div
      className={`${EXCLOAD_MODAL_OVERLAY} z-[9999]`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`${EXCLOAD_MODAL_PANEL} max-w-[440px]`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="requires-account-order-title"
      >
        <div className="border-b border-zinc-100 px-6 pb-4 pt-5">
          <p
            id="requires-account-order-title"
            className="text-[15px] font-medium leading-relaxed text-zinc-700"
          >
            {REQUIRES_ACCOUNT_ORDER_REASON}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4">
          <button type="button" className={EXCLOAD_MODAL_BTN_SECONDARY} onClick={onClose}>
            닫기
          </button>
          <Link
            href="/auth/login"
            className={EXCLOAD_MODAL_BTN_SECONDARY}
            onClick={onClose}
          >
            회원가입
          </Link>
          <Link
            href="/auth/login"
            className={EXCLOAD_MODAL_BTN_PRIMARY}
            onClick={onClose}
          >
            로그인
          </Link>
        </div>
      </div>
    </div>
  );
}
