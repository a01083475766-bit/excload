'use client';

import type { ReactNode } from 'react';

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
};

const confirmClass: Record<Variant, string> = {
  default: 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700',
  danger: 'rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700',
  warning: 'rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700',
};

/**
 * 주문연동 허브 톤 — 확인/취소 안내 모달 공통.
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
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="w-full max-w-[400px] rounded-xl border border-zinc-200 bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="excload-confirm-title"
      >
        <h4 id="excload-confirm-title" className="mb-3 text-lg font-semibold text-zinc-900">
          {title}
        </h4>
        {description ? (
          <div className="mb-6 space-y-2 text-sm leading-relaxed text-zinc-600">{description}</div>
        ) : (
          <div className="mb-6" />
        )}
        <div className="flex justify-end gap-2.5">
          {!confirmOnly ? (
            <button
              type="button"
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
          ) : null}
          <button type="button" className={confirmClass[variant]} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
