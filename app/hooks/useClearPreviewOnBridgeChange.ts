'use client';

import { useEffect, useRef } from 'react';
import type { TemplateBridgeFile } from '@/app/pipeline/template/types';

function bridgeSignature(bridge: TemplateBridgeFile): string {
  try {
    return JSON.stringify(bridge);
  } catch {
    return String(bridge.courierHeaders?.length ?? 0);
  }
}

/**
 * 양식 bridge가 실제로 바뀔 때만 콜백을 호출합니다.
 * 페이지 재진입 시 localStorage에서 복원된 bridge로는 미리보기를 지우지 않습니다.
 */
export function useClearPreviewOnBridgeChange(
  templateBridgeFile: TemplateBridgeFile | null,
  onBridgeChanged: () => void,
): void {
  const prevSigRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!templateBridgeFile) return;
    const sig = bridgeSignature(templateBridgeFile);
    // 초기 로딩(또는 null 상태에서 최초로 로드됨)에서는 미리보기를 지우지 않음
    if (prevSigRef.current == null) {
      prevSigRef.current = sig;
      return;
    }
    // 이후에 "실제로" bridge가 바뀌는 경우에만 초기화
    if (prevSigRef.current !== sig) {
      onBridgeChanged();
      prevSigRef.current = sig;
    }
  }, [templateBridgeFile, onBridgeChanged]);
}
