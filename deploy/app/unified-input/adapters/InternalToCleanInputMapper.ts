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
 * InternalOrderFormat 필드를 기준헤더로 매핑하는 맵
 * 
 * InternalOrderFormat의 필드명 → 기준헤더명 매핑
 */
const INTERNAL_TO_BASE_HEADER_MAP: Record<keyof InternalOrderFormat, string> = {
  receiver_name: '받는사람',
  receiver_phone: '받는사람전화1',
  receiver_address: '받는사람주소1',
  receiver_zipcode: '받는사람우편번호',
  product_name: '상품명',
  product_option: '상품옵션',
  quantity: '수량',
  request_message: '배송메시지',
};

/**
 * InternalOrderFormat을 CleanInputFile로 변환
 * 
 * @param internalOrder - 내부 주문 포맷 (InternalOrderFormat)
 * @param sourceType - 입력 소스 타입 ('text' | 'image')
 * @returns CleanInputFile (기준헤더 구조로 변환된 입력 파일)
 * 
 * @example
 * ```ts
 * const cleanInputFile = mapInternalOrderToCleanInput(
 *   {
 *     receiver_name: '홍길동',
 *     receiver_phone: '010-1234-5678',
 *     // ...
 *   },
 *   'text'
 * );
 * // cleanInputFile.headers는 BASE_HEADERS 배열
 * // cleanInputFile.rows는 [값 배열] (29개 컬럼)
 * ```
 */
export function mapInternalOrderToCleanInput(
  internalOrder: InternalOrderFormat,
  sourceType: 'text' | 'image'
): ExtendedCleanInputFile {
  // 기준헤더 배열을 headers로 사용
  const headers = [...BASE_HEADERS];

  // InternalOrderFormat의 값들을 기준헤더 순서에 맞춰 배열로 변환
  const row: string[] = headers.map((baseHeader) => {
    // InternalOrderFormat 필드 중 이 기준헤더에 매핑되는 필드 찾기
    const internalField = Object.entries(INTERNAL_TO_BASE_HEADER_MAP).find(
      ([, mappedHeader]) => mappedHeader === baseHeader
    )?.[0] as keyof InternalOrderFormat | undefined;

    if (internalField) {
      const value = internalOrder[internalField];
      // number 타입은 문자열로 변환, null/undefined는 빈 문자열
      if (value === null || value === undefined) {
        return '';
      }
      return String(value);
    }

    // 매핑되지 않는 기준헤더는 빈 문자열
    return '';
  });

  return {
    headers,
    rows: [row],
    sourceType,
  };
}
