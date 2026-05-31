import type { TemplateBridgeFile } from '@/app/pipeline/template/types';

function bridgeBaseHeaderForCourier(
  templateBridgeFile: TemplateBridgeFile | null,
  courierHeaderName: string,
): string | null {
  if (!templateBridgeFile) return null;
  const bridgeIndex = templateBridgeFile.courierHeaders.indexOf(courierHeaderName);
  if (bridgeIndex < 0) return null;
  const baseHeader = templateBridgeFile.mappedBaseHeaders[bridgeIndex];
  return baseHeader && baseHeader.trim() !== '' ? baseHeader : null;
}

/**
 * 고정 입력 저장 시 택배 헤더명 + 기준헤더명(있을 때)에 동시 기록해
 * 택배 양식 열 이름이 바뀌어도 Stage3에서 재사용되게 합니다.
 */
export function patchFixedHeaderEntry(
  prev: Record<string, string>,
  courierHeaderName: string,
  value: string,
  templateBridgeFile: TemplateBridgeFile | null,
): Record<string, string> {
  const next: Record<string, string> = {
    ...prev,
    [courierHeaderName]: value,
  };
  const baseHeader = bridgeBaseHeaderForCourier(templateBridgeFile, courierHeaderName);
  if (baseHeader) {
    next[baseHeader] = value;
  }
  return next;
}

/** 고정 입력 삭제 시 택배·기준헤더 키를 함께 제거합니다. */
export function deleteFixedHeaderEntry(
  prev: Record<string, string>,
  courierHeaderName: string,
  templateBridgeFile: TemplateBridgeFile | null,
): Record<string, string> {
  const next = { ...prev };
  delete next[courierHeaderName];
  const baseHeader = bridgeBaseHeaderForCourier(templateBridgeFile, courierHeaderName);
  if (baseHeader) {
    delete next[baseHeader];
  }
  return next;
}
