import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';

/** normalize-29 주문 필드 값 → preview/download 안전 문자열 */
export function coerceNormalize29FieldValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => coerceNormalize29FieldValue(item))
      .filter((part) => part.length > 0)
      .join(' ')
      .trim();
  }
  if (typeof value === 'object') return '';
  return String(value).trim();
}

/** AI orders[] 1건 → BASE_HEADERS 전체 문자열 행 (handleNormalize29·fallback 공통) */
export function normalizeNormalize29Order(order: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const header of BASE_HEADERS) {
    normalized[header] = coerceNormalize29FieldValue(order?.[header]);
  }
  if (!normalized['수량']) {
    normalized['수량'] = '1';
  }
  return normalized;
}
