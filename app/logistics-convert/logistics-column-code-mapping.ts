/**
 * 물류 주문 변환 전용 — 미리보기 「코드매핑」 모달 (order-convert와 무관)
 */

import type { PreviewRow } from '@/app/pipeline/merge/types';
import type { ProductCodeMap } from '@/app/logistics-convert/product-code-projection';
import {
  parseProductCodeMapFromMatrix,
  resolveLogisticsProductNameColumn,
  resolveLogisticsProductOptionColumn,
  resolveProductCodeColumnHeader,
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
    if (!val) continue;
    // 원본 칸이 비어 있고 변환값만 있는 행: 빈 셀일 때 적용할 기본값
    if (!keyRaw) {
      map[''] = val;
      continue;
    }
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
  if (!raw) {
    const emptyKey = map[''];
    if (emptyKey !== undefined) return emptyKey;
    return undefined;
  }
  const a = map[raw];
  if (a !== undefined && a !== '') return a;
  const b = map[normalizeMapKey(raw)];
  if (b !== undefined && b !== '') return b;
  return undefined;
}

/**
 * 모달 「확인」 시 일괄 적용.
 * - product + 상품명 열 있음: baseline의 상품명·옵션으로 조회 → targetHeader에 기록.
 * - product + 상품명 열 없음: 템플릿의 상품코드·바코드·코드 열을 대상으로 했을 때만,
 *   그 칸 문자열을 상품명처럼 보고 조회(기존 「상품명↔상품코드 변환」과 동일 철학).
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
  const codeCol = resolveProductCodeColumnHeader(courierHeaders);

  for (const spec of staged) {
    const isProduct = spec.kind === 'product' && spec.productMap;
    if (isProduct) {
      const pmap = spec.productMap!;
      if (nameCol) {
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
      } else if (codeCol && spec.targetHeader === codeCol) {
        const mapOutputValues = new Set(
          Object.values(pmap).filter(
            (v) => v !== undefined && String(v).trim() !== '',
          ),
        );
        next = next.map((row, i) => {
          const out = { ...row };
          const base = baselineRows[i] ?? row;
          const existingCell = String(base[codeCol] ?? '').trim();
          if (existingCell && mapOutputValues.has(existingCell)) {
            return out;
          }
          if (!existingCell) {
            return out;
          }
          const option = optCol ? String(base[optCol] ?? '').trim() : '';
          const code = resolveProductCodeFromMap(pmap, existingCell, option);
          if (code !== undefined && code !== '') {
            out[spec.targetHeader] = code;
          }
          return out;
        });
      } else {
        console.warn(
          '[코드매핑] 상품 마스터: 상품명 열이 없으면 매핑 대상을 상품코드·바코드·코드 열로 지정해야 합니다.',
          { targetHeader: spec.targetHeader, codeCol },
        );
      }
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
