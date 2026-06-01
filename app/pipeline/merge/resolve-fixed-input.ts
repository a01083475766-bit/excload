/**
 * Stage3 고정입력(FixedInput) 해석·보강
 *
 * - 저장 키: 택배사 헤더명(주로) + 기준헤더명(양식이 바뀌어도 재사용)
 * - 배송메시지: 정제 후 빈 문자열이면 메타만 있던 주문으로 보고 고정값 fallback
 */

import type { TemplateBridgeFile } from '../template/types';
import type { FixedInput } from './types';
import { pruneFixedInputToCourierKeys } from '@/app/lib/fixed-header-values';
import { applyFillOnly } from './apply-fill-only';
import { sanitizeDeliveryMessage } from './sanitize-delivery-message';

/**
 * 고정입력 모달에 등록된 택배 열 이름만 Stage3에 반영합니다.
 * 같은 기준헤더에 매핑된 여러 택배 열(예: 배송메시지1·배송요청사항)은
 * 모달에서 하나라도 설정된 경우에만 해당 기준헤더 계열 열에 복제합니다.
 */
export function enrichFixedInputByTemplate(
  fixedInput: FixedInput,
  template: TemplateBridgeFile,
): FixedInput {
  const scoped = pruneFixedInputToCourierKeys(fixedInput, template);
  const out: FixedInput = { ...scoped };
  const byBase = new Map<string, string>();

  const { courierHeaders, mappedBaseHeaders } = template;

  for (let i = 0; i < courierHeaders.length; i++) {
    const courierHeader = courierHeaders[i];
    const baseHeader = mappedBaseHeaders[i];
    const value = String(scoped[courierHeader] ?? '').trim();
    if (baseHeader && value && !byBase.has(baseHeader)) {
      byBase.set(baseHeader, value);
    }
  }

  for (let i = 0; i < courierHeaders.length; i++) {
    const courierHeader = courierHeaders[i];
    const baseHeader = mappedBaseHeaders[i];
    if (!baseHeader || !byBase.has(baseHeader)) continue;
    if (!String(out[courierHeader] ?? '').trim()) {
      out[courierHeader] = byBase.get(baseHeader)!;
    }
  }

  return out;
}

/** 택배 열 키 기준 고정값 (enrichFixedInputByTemplate 이후 사용) */
export function resolveFixedValueForColumn(
  fixedInput: FixedInput,
  courierHeader: string,
  _baseHeader: string | null,
): string {
  return String(fixedInput[courierHeader] ?? '').trim();
}

/**
 * 배송메시지: Fill Only → 정제 → 정제 결과가 비면 고정값 재적용(메타-only 주문)
 */
export function mergeDeliveryMessageValue(
  orderValue: string,
  fixedValue: string,
): string {
  const filled = applyFillOnly(orderValue, fixedValue);
  if (!filled) return '';

  const sanitized = sanitizeDeliveryMessage(filled);
  if (sanitized) return sanitized;

  if (fixedValue.trim()) {
    return sanitizeDeliveryMessage(fixedValue.trim()) || fixedValue.trim();
  }

  return '';
}
