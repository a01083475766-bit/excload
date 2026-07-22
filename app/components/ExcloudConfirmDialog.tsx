'use client';

import type { ReactNode } from 'react';
import {
  EXCLOAD_MODAL_BODY,
  EXCLOAD_MODAL_BTN_PRIMARY,
  EXCLOAD_MODAL_BTN_SECONDARY,
  EXCLOAD_MODAL_OVERLAY,
  EXCLOAD_MODAL_PANEL,
  EXCLOAD_MODAL_TITLE,
} from '@/app/lib/ui/excload-preview-ui';

type Variant = 'default' | 'danger' | 'warning';

type Props = {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: Variant;
  onConfirm: () => void;
  onCancel: () => void;
  /** 확인만 (닫기 한 버튼) */
  confirmOnly?: boolean;
  /** 최종 확인 비활성 (조건 미충족) */
  confirmDisabled?: boolean;
  /** 요청 진행 중 — 확인·취소 모두 잠금 */
  busy?: boolean;
  panelClassName?: string;
};

const confirmClass: Record<Variant, string> = {
  default: EXCLOAD_MODAL_BTN_PRIMARY,
  danger:
    'rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50',
  warning:
    'rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50',
};

/**
 * 주문연동 허브 톤 — 확인/취소·안내 모달 공통.
 */
export function ExcloudConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  variant = 'default',
  onConfirm,
  onCancel,
  confirmOnly = false,
  confirmDisabled = false,
  busy = false,
  panelClassName = 'max-w-[400px]',
}: Props) {
  if (!open) return null;

  const locked = busy || confirmDisabled;

  return (
    <div
      className={EXCLOAD_MODAL_OVERLAY}
      onClick={busy ? undefined : onCancel}
      role="presentation"
    >
      <div
        className={`${EXCLOAD_MODAL_PANEL} ${panelClassName}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="excload-confirm-title"
      >
        <div className="border-b border-zinc-100 px-6 pb-4 pt-5">
          <h4 id="excload-confirm-title" className={EXCLOAD_MODAL_TITLE}>
            {title}
          </h4>
        </div>
        <div className="px-6 py-5">
          {description ? (
            <div className={`space-y-2 ${EXCLOAD_MODAL_BODY}`}>{description}</div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2.5 border-t border-zinc-100 px-6 py-4">
          {!confirmOnly ? (
            <button
              type="button"
              className={EXCLOAD_MODAL_BTN_SECONDARY}
              onClick={onCancel}
              disabled={busy}
            >
              {cancelLabel}
            </button>
          ) : null}
          <button
            type="button"
            className={confirmClass[variant]}
            onClick={onConfirm}
            disabled={locked}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
