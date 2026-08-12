'use client';

import { X } from 'lucide-react';
import { WorkspaceBlockingModalOverlay } from '@/app/components/WorkspaceBlockingModalOverlay';
import { LotteonChecklistGuide } from '@/app/components/order-integration/LotteonChecklistGuide';
import {
  EXCLOAD_MODAL_BTN_SECONDARY,
  EXCLOAD_MODAL_PANEL,
  EXCLOAD_MODAL_TITLE,
} from '@/app/lib/ui/excload-preview-ui';

type Props = {
  open: boolean;
  onClose: () => void;
};

/** 「설정 따라하기」 — 롯데ON OpenAPI 그림 가이드 (직접입력 IP) */
export function LotteonVisualGuideModal({ open, onClose }: Props) {
  return (
    <WorkspaceBlockingModalOverlay
      open={open}
      panelClassName={`${EXCLOAD_MODAL_PANEL} flex h-[min(920px,94vh)] w-full max-w-6xl flex-col overflow-hidden`}
      aria-labelledby="lotteon-visual-guide-title"
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-5">
        <h2 id="lotteon-visual-guide-title" className={EXCLOAD_MODAL_TITLE}>
          롯데ON 설정 따라하기
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="닫기"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {open ? <LotteonChecklistGuide density="roomy" key="lotteon-guide-open" /> : null}
      </div>

      <div className="flex h-14 shrink-0 items-center justify-end border-t border-zinc-200 px-5">
        <button type="button" onClick={onClose} className={EXCLOAD_MODAL_BTN_SECONDARY}>
          닫기
        </button>
      </div>
    </WorkspaceBlockingModalOverlay>
  );
}
