/**
 * EXCLOAD Merge Pipeline - Fill Only 적용 함수
 * 
 * ⚠️ CONSTITUTION.md v4.1 준수
 * Stage3 Merge Pipeline 전용
 * 
 * Fill Only 원칙:
 * - 주문값 존재 → 유지
 * - 주문값 없음 → FixedInput 사용
 * - 둘 다 없음 → ''
 * 
 * 절대 덮어쓰기 금지
 */

/**
 * Fill Only 원칙에 따라 최종값을 결정합니다.
 * 
 * @param orderValue - 주문 데이터 값
 * @param fixedValue - 고정 입력값
 * @returns 최종값
 * 
 * @example
 * ```typescript
 * applyFillOnly('주문값', '고정값') // '주문값' 반환
 * applyFillOnly('', '고정값') // '고정값' 반환
 * applyFillOnly('', '') // '' 반환
 * ```
 */
export function applyFillOnly(
  orderValue: string,
  fixedValue: string
): string {
  // 주문값이 존재하면 유지
  if (orderValue && orderValue.trim() !== '') {
    return orderValue;
  }
  
  // 주문값이 없으면 FixedInput 사용
  if (fixedValue && fixedValue.trim() !== '') {
    return fixedValue;
  }
  
  // 둘 다 없으면 빈 문자열
  return '';
}
