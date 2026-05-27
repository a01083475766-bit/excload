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
    if (!templateBridgeFile) {
      prevSigRef.current = null;
      return;
    }
    const sig = bridgeSignature(templateBridgeFile);
    if (prevSigRef.current === undefined) {
      prevSigRef.current = sig;
      return;
    }
    if (prevSigRef.current !== sig) {
      onBridgeChanged();
      prevSigRef.current = sig;
    }
  }, [templateBridgeFile, onBridgeChanged]);
}
