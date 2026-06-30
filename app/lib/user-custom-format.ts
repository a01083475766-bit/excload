import type { TemplateBridgeFile } from '@/app/pipeline/template/types';

/** 사용자 지정양식 저장·표시용 기본 이름 */
export const USER_CUSTOM_FORMAT_NAME = '사용자 지정양식';

const LEGACY_USER_CUSTOM_FORMAT_NAMES = new Set([
  '지정파일양식',
  '직접 연결 양식',
]);

export function resolveUserCustomFormatDisplayName(
  displayName: string | undefined,
  fallback: string,
): string {
  if (!displayName) return fallback;
  if (LEGACY_USER_CUSTOM_FORMAT_NAMES.has(displayName)) {
    return USER_CUSTOM_FORMAT_NAME;
  }
  return displayName;
}

export function createEmptyTemplateBridgeShell(): TemplateBridgeFile {
  return {
    baseHeaders: [],
    courierHeaders: [],
    mappedBaseHeaders: [],
    unknownHeaders: [],
  };
}
