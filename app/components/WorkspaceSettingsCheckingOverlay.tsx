'use client';

import { Loader2 } from 'lucide-react';

type WorkspaceSettingsCheckingOverlayProps = {
  /** localStorage·계정별 양식 복원 대기 중 */
  open: boolean;
  message?: string;
  subMessage?: string;
};

/**
 * 변환 화면 위에 반투명 레이어 + 안내 카드만 표시.
 * 페이지 레이아웃·하단 「양식 확인중」 배너는 그대로 두고, 업로드 등 조작만 막는다.
 */
export function WorkspaceSettingsCheckingOverlay({
  open,
  message = '설정 정보를 확인하는 중입니다.',
  subMessage = '잠시만 기다려주세요.',
}: WorkspaceSettingsCheckingOverlayProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[45] flex items-center justify-center bg-white/40 backdrop-blur-[2px] pointer-events-auto"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={message}
    >
      <div className="mx-4 flex max-w-sm flex-col items-center gap-3 rounded-xl border border-gray-200/90 bg-white/95 px-8 py-6 text-center shadow-lg">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
        <p className="text-base font-semibold text-gray-900">{message}</p>
        {subMessage ? <p className="text-sm text-gray-500">{subMessage}</p> : null}
      </div>
    </div>
  );
}
