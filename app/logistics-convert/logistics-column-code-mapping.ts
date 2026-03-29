/**
 * 물류 주문 변환 전용 — 미리보기 「코드매핑」 모달 (order-convert와 무관)
 */

import type { PreviewRow } from '@/app/pipeline/merge/types';
import type { ProductCodeMap } from '@/app/logistics-convert/product-code-projection';
import {
  parseProductCodeMapFromMatrix,
  resolveLogisticsProductNameColumn,
  resolveLogisticsProductOptionColumn,
  resolveProductCodeFromMap,
} from '@/app/logistics-convert/product-code-projection';

export type LogisticsColumnMapKind = 'simple' | 'product';

export type LogisticsStagedColumnMapping = {
  targetHeader: string;
  kind: LogisticsColumnMapKind;
  fileName: string;
  simpleMap?: Record<string, string>;
  productMap?: ProductCodeMap;
};

function normalizeMapKey(s: string): string {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function findColumnIndexByAliases(
  headerRow: string[],
  aliases: string[],
): number {
  const lowered = headerRow.map((h) => String(h ?? '').trim().toLowerCase());
  for (let i = 0; i < lowered.length; i++) {
    const h = lowered[i];
    for (const a of aliases) {
      if (h === a || h.includes(a)) return i;
    }
  }
  return -1;
}

/**
 * 1행 헤더 기준 단순 매핑 (원본→코드).
 * 헤더에 원본/코드 등 키워드가 있으면 해당 열을 쓰고, 없으면 0열·1열.
 */
export function parseSimpleColumnMapFromMatrix(
  matrix: string[][],
): Record<string, string> {
  if (!matrix.length) return {};
  const headerRow = matrix[0].map((c) => String(c ?? '').trim());
  const keyIdx = findColumnIndexByAliases(headerRow, [
    '원본',
    '키',
    '매핑키',
    '변환전',
    'before',
    'key',
  ]);
  const valIdx = findColumnIndexByAliases(headerRow, [
    '코드',
    '값',
    '변환후',
    '매핑값',
    'after',
    'value',
  ]);

  let k = keyIdx;
  let v = valIdx;
  if (k < 0) k = 0;
  if (v < 0) v = headerRow.length > 1 ? 1 : -1;
  if (v < 0 || k === v) return {};

  const map: Record<string, string> = {};
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    const keyRaw = String(row[k] ?? '').trim();
    const val = String(row[v] ?? '').trim();
    if (!keyRaw || !val) continue;
    map[keyRaw] = val;
    const nk = normalizeMapKey(keyRaw);
    if (nk !== keyRaw) map[nk] = val;
  }
  return map;
}

/**
 * 상품 마스터 양식(상품명·옵션·상품코드 등)이면 product, 아니면 simple.
 */
export function classifyLogisticsMappingMatrix(matrix: string[][]): {
  kind: LogisticsColumnMapKind;
  productMap?: ProductCodeMap;
  simpleMap?: Record<string, string>;
} {
  const productMap = parseProductCodeMapFromMatrix(matrix);
  if (Object.keys(productMap).length > 0) {
    return { kind: 'product', productMap };
  }
  const simpleMap = parseSimpleColumnMapFromMatrix(matrix);
  return { kind: 'simple', simpleMap };
}

function lookupSimpleMap(
  map: Record<string, string>,
  cell: string,
): string | undefined {
  const raw = String(cell ?? '').trim();
  if (!raw) return undefined;
  const a = map[raw];
  if (a !== undefined && a !== '') return a;
  const b = map[normalizeMapKey(raw)];
  if (b !== undefined && b !== '') return b;
  return undefined;
}

/**
 * 모달 「확인」 시 일괄 적용.
 * - product: 행의 상품명·옵션은 baselineRows(확인 시점 스냅샷) 기준으로 조회해 targetHeader에 기록.
 * - simple: 직전 단계까지 반영된 행에서 targetHeader 셀 값을 키로 조회.
 */
export function applyLogisticsStagedColumnMappings(
  baselineRows: PreviewRow[],
  courierHeaders: string[],
  staged: LogisticsStagedColumnMapping[],
): PreviewRow[] {
  if (!staged.length) return baselineRows.map((r) => ({ ...r }));

  let next = baselineRows.map((r) => ({ ...r }));
  const nameCol = resolveLogisticsProductNameColumn(courierHeaders);
  const optCol = resolveLogisticsProductOptionColumn(courierHeaders);

  for (const spec of staged) {
    const isProduct = spec.kind === 'product' && spec.productMap;
    if (isProduct) {
      if (!nameCol) {
        console.warn(
          '[코드매핑] 상품 마스터는 템플릿에 상품명(또는 품목명) 열이 있어야 합니다.',
        );
        continue;
      }
      const pmap = spec.productMap!;
      next = next.map((row, i) => {
        const out = { ...row };
        const base = baselineRows[i] ?? row;
        const name = String(base[nameCol] ?? '').trim();
        const option = optCol ? String(base[optCol] ?? '').trim() : '';
        const code = resolveProductCodeFromMap(pmap, name, option);
        if (code !== undefined && code !== '') {
          out[spec.targetHeader] = code;
        }
        return out;
      });
    } else if (spec.kind === 'simple' && spec.simpleMap) {
      const sm = spec.simpleMap;
      next = next.map((row) => {
        const out = { ...row };
        const raw = String(out[spec.targetHeader] ?? '');
        const mapped = lookupSimpleMap(sm, raw);
        if (mapped !== undefined) {
          out[spec.targetHeader] = mapped;
        }
        return out;
      });
    }
  }

  return next;
}
