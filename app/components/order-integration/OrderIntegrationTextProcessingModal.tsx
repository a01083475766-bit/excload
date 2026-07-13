'use client';

import { Check, Loader2 } from 'lucide-react';

type Props = {
  open: boolean;
  stage: 'processing' | 'completed';
  source: 'screenshot' | 'imageFile';
  onConfirmCompleted: () => void;
};

/**
 * 택배변환과 동일 — OCR 텍스트 정리 진행/완료 안내 모달.
 */
export function OrderIntegrationTextProcessingModal({
  open,
  stage,
  source,
  onConfirmCompleted,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-[500px] rounded-lg bg-white p-6 shadow-lg">
        <div className="flex flex-col items-center justify-center text-center">
          {stage === 'processing' ? (
            <>
              <Loader2 className="mb-4 h-12 w-12 animate-spin text-blue-600" />
              <p className="mb-2 text-lg font-semibold text-gray-900">
                {source === 'screenshot'
                  ? '스크린샷에서 텍스트를 정리중입니다'
                  : '이미지 파일에서 텍스트를 정리중입니다'}
              </p>
              <p className="text-sm text-gray-600">
                텍스트정리가 완료되면 텍스트변환버튼을 눌러 주문목록으로 추가하세요
              </p>
            </>
          ) : (
            <>
              <Check className="mb-4 h-12 w-12 text-green-500" />
              <p className="mb-2 text-lg font-semibold text-gray-900">텍스트로 변환이 완료되었습니다</p>
              <p className="mb-4 text-sm text-gray-600">텍스트 변환하기 버튼을 눌러주세요</p>
              <button
                type="button"
                onClick={onConfirmCompleted}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
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
