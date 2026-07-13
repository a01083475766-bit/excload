'use client';

import { Loader2 } from 'lucide-react';
import {
  EXCLOAD_MODAL_BTN_PRIMARY,
  EXCLOAD_MODAL_OVERLAY,
  EXCLOAD_MODAL_PANEL,
  EXCLOAD_MODAL_TITLE,
} from '@/app/lib/ui/excload-preview-ui';

type Props = {
  open: boolean;
  stage: 'processing' | 'completed';
  source: 'screenshot' | 'imageFile';
  onConfirmCompleted: () => void;
};

/**
 * OCR 텍스트 정리 진행/완료 안내.
 */
export function OrderIntegrationTextProcessingModal({
  open,
  stage,
  source,
  onConfirmCompleted,
}: Props) {
  if (!open) return null;

  return (
    <div className={`${EXCLOAD_MODAL_OVERLAY} z-[9999]`}>
      <div className={`${EXCLOAD_MODAL_PANEL} max-w-[420px]`}>
        <div className="border-b border-zinc-100 px-6 pb-4 pt-5">
          <h3 className={EXCLOAD_MODAL_TITLE}>
            {stage === 'processing' ? '텍스트 정리 중' : '텍스트 정리 완료'}
          </h3>
        </div>
        <div className="px-6 py-6 text-center">
          {stage === 'processing' ? (
            <>
              <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-zinc-500" />
              <p className="mb-2 text-sm font-medium text-zinc-800">
                {source === 'screenshot'
                  ? '스크린샷에서 텍스트를 읽고 있습니다'
                  : '이미지에서 텍스트를 읽고 있습니다'}
              </p>
              <p className="text-sm leading-relaxed text-zinc-500">
                완료되면 텍스트 칸을 확인한 뒤 「텍스트 주문 변환」을 눌러 주세요.
              </p>
            </>
          ) : (
            <>
              <p className="mb-2 text-sm font-medium text-zinc-800">
                텍스트 칸에 반영되었습니다
              </p>
              <p className="mb-5 text-sm leading-relaxed text-zinc-500">
                내용을 확인·수정한 뒤 「텍스트 주문 변환」을 눌러 주세요.
              </p>
              <button
                type="button"
                onClick={onConfirmCompleted}
                className={EXCLOAD_MODAL_BTN_PRIMARY}
              >
                확인
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
