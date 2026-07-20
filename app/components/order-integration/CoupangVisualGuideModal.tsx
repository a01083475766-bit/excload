'use client';

import { X } from 'lucide-react';
import { WorkspaceBlockingModalOverlay } from '@/app/components/WorkspaceBlockingModalOverlay';
import { CoupangChecklistGuide } from '@/app/components/order-integration/CoupangChecklistGuide';
import {
  EXCLOAD_MODAL_BTN_SECONDARY,
  EXCLOAD_MODAL_PANEL,
  EXCLOAD_MODAL_TITLE,
} from '@/app/lib/ui/excload-preview-ui';

type Props = {
  open: boolean;
  onClose: () => void;
};

/** 「설정 따라하기」 — 쿠팡 Wing Open API 그림 가이드 */
export function CoupangVisualGuideModal({ open, onClose }: Props) {
  return (
    <WorkspaceBlockingModalOverlay
      open={open}
      panelClassName={`${EXCLOAD_MODAL_PANEL} flex h-[min(920px,94vh)] w-full max-w-6xl flex-col overflow-hidden`}
      aria-labelledby="coupang-visual-guide-title"
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-5">
        <h2 id="coupang-visual-guide-title" className={EXCLOAD_MODAL_TITLE}>
          쿠팡 설정 따라하기
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
        {open ? <CoupangChecklistGuide density="roomy" key="coupang-guide-open" /> : null}
      </div>

      <div className="flex h-14 shrink-0 items-center justify-end border-t border-zinc-200 px-5">
        <button type="button" onClick={onClose} className={EXCLOAD_MODAL_BTN_SECONDARY}>
          닫기
        </button>
      </div>
    </WorkspaceBlockingModalOverlay>
  );
}
