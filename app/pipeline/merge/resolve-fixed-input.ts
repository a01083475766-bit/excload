/**
 * Stage3 고정입력(FixedInput) 해석·보강
 *
 * - 저장 키: 택배사 헤더명(주로) + 기준헤더명(양식이 바뀌어도 재사용)
 * - 배송메시지: 정제 후 빈 문자열이면 메타만 있던 주문으로 보고 고정값 fallback
 */

import { BASE_HEADERS } from '../base/base-headers';
import type { TemplateBridgeFile } from '../template/types';
import type { FixedInput } from './types';
import { applyFillOnly } from './apply-fill-only';
import { sanitizeDeliveryMessage } from './sanitize-delivery-message';

const BASE_HEADER_SET = new Set<string>(BASE_HEADERS);

/**
 * 현재 TemplateBridge 기준으로 고정값을 기준헤더 단위로 풀어,
 * 같은 기준헤더에 매핑된 모든 택배 열에 값을 채웁니다.
 */
export function enrichFixedInputByTemplate(
  fixedInput: FixedInput,
  template: TemplateBridgeFile,
): FixedInput {
  const out: FixedInput = { ...fixedInput };
  const byBase = new Map<string, string>();

  const { courierHeaders, mappedBaseHeaders } = template;

  for (let i = 0; i < courierHeaders.length; i++) {
    const courierHeader = courierHeaders[i];
    const baseHeader = mappedBaseHeaders[i];
    const fromCourier = String(fixedInput[courierHeader] ?? '').trim();
    const fromBase =
      baseHeader && BASE_HEADER_SET.has(baseHeader)
        ? String(fixedInput[baseHeader] ?? '').trim()
        : '';
    const value = fromCourier || fromBase;
    if (baseHeader && value && !byBase.has(baseHeader)) {
      byBase.set(baseHeader, value);
    }
  }

  for (const [key, raw] of Object.entries(fixedInput)) {
    const value = String(raw ?? '').trim();
    if (value && BASE_HEADER_SET.has(key) && !byBase.has(key)) {
      byBase.set(key, value);
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

  for (const [baseHeader, value] of byBase) {
    if (!String(out[baseHeader] ?? '').trim()) {
      out[baseHeader] = value;
    }
  }

  return out;
}

/** 택배 열·기준헤더 키 모두에서 고정값 조회 */
export function resolveFixedValueForColumn(
  fixedInput: FixedInput,
  courierHeader: string,
  baseHeader: string | null,
): string {
  const fromCourier = String(fixedInput[courierHeader] ?? '').trim();
  if (fromCourier) return fromCourier;
  if (baseHeader) {
    return String(fixedInput[baseHeader] ?? '').trim();
  }
  return '';
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
