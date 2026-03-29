/**
 * 내부 주문 포맷을 CleanInputFile로 변환하는 매퍼
 * InternalOrderFormat 변환 / 내부 주문 변환
 *
 * ⚠️ CONSTITUTION.md v4.0 준수
 * ⚠️ 기존 Stage0/1/2/3 파일 절대 수정 금지
 *
 * 역할:
 * - InternalOrderFormat을 CleanInputFile로 변환
 * - Stage2 직접 호출 금지
 * - 기준헤더 UI 노출 금지 (내부 처리 전용)
 *
 * 흐름:
 * InternalOrderFormat → InternalToCleanInputMapper → CleanInputFile → Stage2
 */

import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';
import type { InternalOrderFormat } from '@/app/lib/export/internalOrderFormat';
import type { ExtendedCleanInputFile } from './types';

/**
 * InternalOrderFormat을 CleanInputFile로 변환
 *
 * @param internalOrder - 내부 주문 포맷 (InternalOrderFormat = BaseHeaderRow)
 * @param sourceType - 입력 소스 타입 ('text' | 'image')
 * @returns CleanInputFile (기준헤더 구조로 변환된 입력 파일)
 */
export function mapInternalOrderToCleanInput(
  internalOrder: InternalOrderFormat,
  sourceType: 'text' | 'image'
): ExtendedCleanInputFile {
  const headers = [...BASE_HEADERS];
  const row = headers.map((h) => {
    const v = internalOrder[h];
    if (v === null || v === undefined) return '';
    return String(v);
  });

  return {
    headers,
    rows: [row],
    sourceType,
  };
}
