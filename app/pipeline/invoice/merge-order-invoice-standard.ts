/**
 * 송장파일변환 — 주문 OrderStandardFile + 택배 송장 OrderStandardFile 병합
 * 기준헤더 행 단위로 통일된 뒤, 주문번호로 조인합니다.
 *
 * 규칙:
 * - 조인 키: 기준헤더 `주문번호` (값은 공백 제거 후 비교)
 * - 행 병합: 주문 행이 베이스. 송장 행에서는 `운송장번호`(및 동일 의미의 송장 전용 필드)만 비어 있지 않으면 덮어씀
 * - `주문번호` 값은 항상 주문 파일 행 기준 유지
 * - 1:N (동일 주문번호에 송장 여러 행): 주문 행을 송장 행 수만큼 복제하여 각각 병합
 * - 송장에만 있고 주문에 없는 행: 출력에서 제외 (주문 중심)
 */

import type { OrderStandardFile } from '@/app/pipeline/order/order-pipeline';

const JOIN_HEADER = '주문번호';
const FALLBACK_JOIN_HEADER = '상품주문번호';

/** 송장 엑셀에서만 덮어쓸 기준헤더 (주문 원본 유지) */
const OVERLAY_FROM_INVOICE_HEADERS = new Set<string>(['운송장번호']);

export function normalizeJoinKey(value: string | undefined | null): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  // 엑셀에서 숫자 주문번호가 12345.0 형태로 들어오는 경우 보정
  const noDecimalTail = raw.replace(/^([0-9]+)\.0+$/, '$1');

  // 비교 시 하이픈/언더스코어/슬래시/점/공백/쉼표는 무시
  return noDecimalTail
    .replace(/[\s\-_/.,:]/g, '')
    .toUpperCase();
}

/**
 * 단일 주문 행 + 단일 송장 행 → 기준헤더 기준 병합
 */
export function mergeStandardRowPair(
  orderRow: Record<string, string>,
  invoiceRow: Record<string, string>,
  baseHeaders: readonly string[],
): Record<string, string> {
  const merged: Record<string, string> = { ...orderRow };
  for (const h of baseHeaders) {
    if (h === JOIN_HEADER) continue;
    if (!OVERLAY_FROM_INVOICE_HEADERS.has(h)) continue;
    const inv = String(invoiceRow[h] ?? '').trim();
    if (inv !== '') {
      merged[h] = inv;
    }
  }
  merged[JOIN_HEADER] = String(orderRow[JOIN_HEADER] ?? '').trim();
  return merged;
}

/**
 * 송장 쪽 행을 주문번호로 인덱싱 (동일 키 여러 행 허용)
 */
function buildInvoiceRowsByOrderKey(
  invoiceRows: Record<string, string>[],
  joinHeader: string,
): Map<string, Record<string, string>[]> {
  const map = new Map<string, Record<string, string>[]>();
  for (const row of invoiceRows) {
    const key = normalizeJoinKey(row[joinHeader]);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

function countIntersectKeys(
  orderRows: Record<string, string>[],
  invoiceRows: Record<string, string>[],
  joinHeader: string,
): number {
  const orderSet = new Set(
    orderRows.map((r) => normalizeJoinKey(r[joinHeader])).filter(Boolean),
  );
  if (orderSet.size === 0) return 0;

  let intersect = 0;
  const seen = new Set<string>();
  for (const row of invoiceRows) {
    const key = normalizeJoinKey(row[joinHeader]);
    if (!key || seen.has(key)) continue;
    if (orderSet.has(key)) {
      intersect += 1;
    }
    seen.add(key);
  }
  return intersect;
}

function selectJoinHeader(
  orderRows: Record<string, string>[],
  invoiceRows: Record<string, string>[],
): string {
  const primaryScore = countIntersectKeys(orderRows, invoiceRows, JOIN_HEADER);
  if (primaryScore > 0) return JOIN_HEADER;

  const fallbackScore = countIntersectKeys(
    orderRows,
    invoiceRows,
    FALLBACK_JOIN_HEADER,
  );
  if (fallbackScore > 0) return FALLBACK_JOIN_HEADER;

  return JOIN_HEADER;
}

export function mergeOrderAndInvoiceStandardFiles(
  orderFile: OrderStandardFile,
  invoiceFile: OrderStandardFile,
): OrderStandardFile {
  const baseHeaders = orderFile.baseHeaders;
  const joinHeader = selectJoinHeader(orderFile.rows, invoiceFile.rows);
  const invoiceByKey = buildInvoiceRowsByOrderKey(invoiceFile.rows, joinHeader);

  const mergedRows: Record<string, string>[] = [];

  for (const orderRow of orderFile.rows) {
    const key = normalizeJoinKey(orderRow[joinHeader]);
    const matches = key ? invoiceByKey.get(key) : undefined;

    if (!matches || matches.length === 0) {
      mergedRows.push({ ...orderRow });
      continue;
    }

    for (const invRow of matches) {
      mergedRows.push(mergeStandardRowPair(orderRow, invRow, baseHeaders));
    }
  }

  const unknownHeaders = [
    ...new Set([...orderFile.unknownHeaders, ...invoiceFile.unknownHeaders]),
  ];

  return {
    baseHeaders,
    rows: mergedRows,
    unknownHeaders,
  };
}
