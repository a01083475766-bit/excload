import type { FixedInput } from '@/app/pipeline/merge/types';
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

/**
 * 고정입력 모달에 보이는 값만 유지합니다.
 * 예전에 patch로만 남은 `배송메시지`(기준헤더 키)는 택배 열 `배송메시지1` 삭제 후에도
 * Stage3에 섞이지 않도록 현재 양식의 택배 헤더명 키만 남깁니다.
 */
export function pruneFixedInputToCourierKeys(
  fixedInput: FixedInput,
  template: TemplateBridgeFile | null,
): FixedInput {
  if (!template?.courierHeaders?.length) {
    return { ...fixedInput };
  }
  const out: FixedInput = {};
  for (const courierHeader of template.courierHeaders) {
    const key = String(courierHeader ?? '').trim();
    if (!key) continue;
    const value = String(fixedInput[key] ?? '').trim();
    if (value) {
      out[key] = value;
    }
  }
  return out;
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
