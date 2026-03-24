/**
 * 3물류주문변환 전용 — 물류+3PL 방식 통합
 * Stage3 병합 직후·미리보기 직전 상품코드 투영 (Stage2/merge 내부 미수정)
 *
 * - 물류: 템플릿의 코드 열에 투영, 실패 시 비움
 * - 3PL·확장: 템플릿에 상품명이 없어도 상품명1·품목명 등 + 옵션정보·상품상세1 인식
 * - 템플릿에 상품명 열이 전혀 없고 상품코드 칸에만 상품명이 들어온 경우(병합 결과) 해당 칸 값을 키로 사용
 */

import * as XLSX from 'xlsx';
import type { PreviewRow } from '@/app/pipeline/merge/types';

/**
 * 매핑 키 (내부 저장 형식)
 * - 기본: "상품명|옵션" (옵션 없으면 "상품명|")
 * - 통합키 열: "상품+옵션" 한 덩어리 → "상품+옵션|" (빈 옵션 슬롯)
 */
export type ProductCodeMap = Record<string, string>;

export type ProductCodeProjectionMeta = {
  targetCodeColumnHeader: string | null;
  successCount: number;
  failCount: number;
  didAttemptProjection: boolean;
  skipReason: 'none' | 'no_map' | 'no_code_column' | 'no_name_column';
};

export type ProductCodeProjectionResult = {
  rows: PreviewRow[];
  meta: ProductCodeProjectionMeta;
};

function emptyMeta(
  skipReason: ProductCodeProjectionMeta['skipReason'],
  courierHeaders: string[],
): ProductCodeProjectionMeta {
  return {
    targetCodeColumnHeader: resolveCodeHeader(courierHeaders),
    successCount: 0,
    failCount: 0,
    didAttemptProjection: false,
    skipReason,
  };
}

function normalizeHeaderCell(h: string): string {
  return String(h ?? '')
    .trim()
    .replace(/\s+/g, '');
}

function findColumnIndex(headerRow: string[], candidates: string[]): number {
  const normHeaders = headerRow.map((h) => normalizeHeaderCell(h));
  for (const cand of candidates) {
    const n = normalizeHeaderCell(cand);
    const idx = normHeaders.findIndex((h) => h === n || h.includes(n));
    if (idx >= 0) return idx;
  }
  for (let i = 0; i < headerRow.length; i++) {
    const lower = String(headerRow[i] ?? '').toLowerCase();
    if (candidates.some((c) => lower.includes(c.toLowerCase()))) return i;
  }
  return -1;
}

/**
 * 코드·바코드 열은 상품명으로 쓰지 않음 (상품명 매칭 시 제외)
 */
function isCodeLikeHeader(h: string): boolean {
  const n = normalizeHeaderCell(h);
  if (n.includes('바코드')) return true;
  if (n.includes('상품코드') || n.includes('품목코드')) return true;
  if (n.endsWith('코드') && !n.includes('상품명')) return true;
  if (n === '코드') return true;
  return false;
}

export function parseProductCodeMapFromArrayBuffer(buffer: ArrayBuffer): ProductCodeMap {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstName];
  if (!sheet) return {};

  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
  }) as unknown[][];

  if (!matrix.length) return {};

  const stringMatrix = matrix.map((row) =>
    (row as unknown[]).map((c) => String(c ?? '')),
  );
  return parseProductCodeMapFromMatrix(stringMatrix);
}

export function parseProductCodeMapFromMatrix(matrix: string[][]): ProductCodeMap {
  if (!matrix.length) return {};

  const headerRow = matrix[0].map((c) => String(c ?? '').trim());
  /** 상품+옵션을 한 칸에 적는 열 (옵션 열과 별도) */
  const compositeIdx = findColumnIndex(headerRow, [
    '매핑키',
    '상품옵션키',
    '통합키',
    '상품+옵션',
    '상품옵션묶음',
  ]);
  const nameIdx = findColumnIndex(headerRow, ['상품명', '품목명', '제품명', '상품']);
  const optionIdx = findColumnIndex(headerRow, [
    '옵션',
    '옵션명',
    '상품옵션',
    '옵션정보',
  ]);
  const codeIdx = findColumnIndex(headerRow, ['상품코드', '품목코드', '바코드', '코드']);

  if (codeIdx < 0) {
    console.warn(
      '[3물류 parseProductCodeMap] 상품코드 열을 찾지 못했습니다. 헤더:',
      headerRow,
    );
    return {};
  }

  if (nameIdx < 0 && compositeIdx < 0) {
    console.warn(
      '[3물류 parseProductCodeMap] 상품명(또는 매핑키/통합키) 열을 찾지 못했습니다. 헤더:',
      headerRow,
    );
    return {};
  }

  const map: ProductCodeMap = {};
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row?.length) continue;
    const code = String(row[codeIdx] ?? '').trim();
    if (!code) continue;

    if (nameIdx >= 0) {
      const name = String(row[nameIdx] ?? '').trim();
      const option =
        optionIdx >= 0 ? String(row[optionIdx] ?? '').trim() : '';
      if (name) {
        map[`${name}|${option}`] = code;
      }
    }

    if (compositeIdx >= 0) {
      const composite = String(row[compositeIdx] ?? '').trim();
      if (composite) {
        map[`${composite}|`] = code;
      }
    }
  }

  console.log(
    `[3물류 parseProductCodeMap] 로드 완료: ${Object.keys(map).length}건 (상품명열 ${nameIdx >= 0 ? 'O' : 'X'}, 옵션열 ${optionIdx >= 0 ? 'O' : 'X'}, 통합키열 ${compositeIdx >= 0 ? 'O' : 'X'})`,
  );
  return map;
}

function resolveNameHeader(courierHeaders: string[]): string | null {
  const exact = courierHeaders.find((h) => normalizeHeaderCell(h) === '상품명');
  if (exact) return exact;
  const idx = findColumnIndex(courierHeaders, ['상품명', '품목명', '제품명']);
  return idx >= 0 ? courierHeaders[idx] : null;
}

function resolveOptionHeader(courierHeaders: string[]): string | null {
  const idx = findColumnIndex(courierHeaders, [
    '옵션',
    '옵션명',
    '상품옵션',
    '옵션정보',
  ]);
  return idx >= 0 ? courierHeaders[idx] : null;
}

/**
 * 물류 템플릿 헤더에서 상품명 열 — 물류 기본 + 3PL·실무 확장(상품명1, 품목 등)
 * 코드/바코드 열은 제외
 */
function resolveNameKeyExtended(courierHeaders: string[]): string | null {
  const basic = resolveNameHeader(courierHeaders);
  if (basic) return basic;
  const filtered = courierHeaders.filter((h) => !isCodeLikeHeader(h));
  const idx = findColumnIndex(filtered, [
    '상품명1',
    '상품명2',
    '상품명3',
    '상품명4',
    '상품명',
    '품목명',
    '제품명',
    '품목',
    '상품',
  ]);
  return idx >= 0 ? filtered[idx] : null;
}

/**
 * 옵션 열: 옵션정보·상품상세1(3PL 주문 등)
 */
function resolveOptionKeyExtended(courierHeaders: string[]): string | null {
  const basic = resolveOptionHeader(courierHeaders);
  if (basic) return basic;
  const filtered = courierHeaders.filter((h) => !isCodeLikeHeader(h));
  const idx = findColumnIndex(filtered, [
    '옵션',
    '옵션정보',
    '상품옵션',
    '옵션명',
    '상품상세1',
    '상품상세2',
    '상품상세',
  ]);
  return idx >= 0 ? filtered[idx] : null;
}

function resolveCodeHeader(courierHeaders: string[]): string | null {
  const idx = findColumnIndex(courierHeaders, [
    '상품코드',
    '품목코드',
    '바코드',
    '코드',
  ]);
  return idx >= 0 ? courierHeaders[idx] : null;
}

function resolveCodeFromMap(
  productCodeMap: ProductCodeMap,
  name: string,
  option: string,
): string | undefined {
  const fullKey = `${name}|${option}`;
  let code = productCodeMap[fullKey];
  if (code !== undefined && code !== '') {
    return code;
  }
  if (option !== '') {
    const nameOnlyKey = `${name}|`;
    code = productCodeMap[nameOnlyKey];
    if (code !== undefined && code !== '') {
      return code;
    }
    /** 매핑 파일 통합키 열: "상품+옵션" 한 덩어리 → 내부 키 "상품+옵션|" */
    const plusCompositeKey = `${name}+${option}|`;
    code = productCodeMap[plusCompositeKey];
    if (code !== undefined && code !== '') {
      return code;
    }
  }
  return undefined;
}

/** 주소·연락처 등 상품 매핑에 쓰이기 어려운 열 */
function isLikelyNonProductHeader(h: string): boolean {
  const n = normalizeHeaderCell(h);
  return (
    n.includes('주소') ||
    n.includes('연락') ||
    n.includes('전화') ||
    n.includes('우편') ||
    n.includes('주문번호') ||
    n.includes('주문일') ||
    n.includes('일시') ||
    n.includes('수령자') ||
    n.includes('받는') ||
    n.includes('보내는') ||
    n.includes('발송') ||
    n.includes('운임') ||
    n.includes('운송장') ||
    n.includes('결제금액') ||
    n.includes('수량') ||
    n.includes('배송메시지')
  );
}

/**
 * 템플릿에 상품명 열이 없거나 비어 있을 때, 행의 어떤 칸 값이 매핑 맵 키와 맞는지 역으로 찾음
 * (Stage3가 상품을 상품코드가 아닌 다른 열에 넣은 경우 등)
 */
function inferNameOptionByMapMatch(
  out: PreviewRow,
  productCodeMap: ProductCodeMap,
  optionHint: string,
): { name: string; option: string; source: string } | null {
  const keys = Object.keys(out);
  const productish = keys.filter((h) => {
    if (isCodeLikeHeader(h)) return false;
    if (isLikelyNonProductHeader(h)) return false;
    const n = normalizeHeaderCell(h);
    return (
      n.includes('상품') ||
      n.includes('품목') ||
      n.includes('제품') ||
      n.includes('옵션') ||
      n.includes('상세')
    );
  });
  const tryHeaders =
    productish.length > 0
      ? productish
      : keys.filter((h) => !isCodeLikeHeader(h) && !isLikelyNonProductHeader(h));

  for (const h of tryHeaders) {
    const v = String(out[h] ?? '').trim();
    if (!v) continue;
    const opts = optionHint !== '' ? [optionHint, ''] : [''];
    for (const opt of opts) {
      const code = resolveCodeFromMap(productCodeMap, v, opt);
      if (code !== undefined && code !== '') {
        return { name: v, option: opt, source: h };
      }
    }
  }
  return null;
}

/** 옵션 열이 템플릿 헤더에 없을 때 row 키에서 상품상세·옵션정보 등 탐색 */
function pickOptionFromRowKeys(out: PreviewRow): string {
  const fk = Object.keys(out).filter((h) => !isCodeLikeHeader(h));
  const oi = findColumnIndex(fk, [
    '옵션정보',
    '상품상세1',
    '상품상세2',
    '상품상세',
    '옵션명',
    '옵션',
    '상품옵션',
  ]);
  if (oi >= 0) {
    return String(out[fk[oi]] ?? '').trim();
  }
  return '';
}

/** 상품명: 주소 지정 → 코드 칸 → 상품명1 등 헤더 순 */
function pickProductNameFromRow(
  out: PreviewRow,
  codeKey: string,
  nameSourceKey: string,
): string {
  let name = String(out[nameSourceKey] ?? '').trim();
  if (name) return name;
  if (nameSourceKey !== codeKey) {
    name = String(out[codeKey] ?? '').trim();
    if (name) return name;
  }
  const fk = Object.keys(out).filter((h) => !isCodeLikeHeader(h));
  const ni = findColumnIndex(fk, [
    '상품명1',
    '상품명2',
    '상품명3',
    '상품명4',
    '상품명',
    '품목명',
    '제품명',
    '품목',
  ]);
  if (ni >= 0) {
    name = String(out[fk[ni]] ?? '').trim();
  }
  return name;
}

/**
 * Stage3 병합 결과 행에 상품코드를 투영한다.
 * @param mergedRows Stage3의 previewRows
 * @param courierHeaders 템플릿 열 이름 배열
 * @param productCodeMap 키 "상품명|옵션" 또는 통합키 "상품+옵션|" → 상품코드
 */
export function applyProductCodeProjection(
  mergedRows: PreviewRow[],
  courierHeaders: string[],
  productCodeMap: ProductCodeMap,
): ProductCodeProjectionResult {
  if (!mergedRows.length) {
    return {
      rows: [],
      meta: emptyMeta('no_map', courierHeaders),
    };
  }

  if (!productCodeMap || Object.keys(productCodeMap).length === 0) {
    console.log('[3물류 상품코드 매핑] 실패 개수:', 0, '(매핑 맵 없음)');
    return {
      rows: mergedRows.map((row) => ({ ...row })),
      meta: emptyMeta('no_map', courierHeaders),
    };
  }

  const nameKeyResolved = resolveNameKeyExtended(courierHeaders);
  const optionKeyResolved = resolveOptionKeyExtended(courierHeaders);
  const codeKey = resolveCodeHeader(courierHeaders);

  if (!codeKey) {
    console.warn(
      '[3물류 applyProductCodeProjection] 템플릿에 상품코드/바코드/코드 열을 찾지 못했습니다. 투영 생략.',
    );
    console.log('[3물류 상품코드 매핑] 실패 개수:', 0, '(코드 열 없음)');
    return {
      rows: mergedRows.map((row) => ({ ...row })),
      meta: emptyMeta('no_code_column', courierHeaders),
    };
  }

  /** 상품명 전용 열이 없을 때: 병합 결과가 상품명을 상품코드 칸에 넣은 경우 그 칸으로 키 생성 */
  const nameSourceKey =
    nameKeyResolved ?? (codeKey ? codeKey : null);

  if (!nameSourceKey) {
    console.warn(
      '[3물류 applyProductCodeProjection] 상품명·품목을 찾을 열이 없고 코드 열도 없습니다. 투영 생략.',
    );
    console.log('[3물류 상품코드 매핑] 실패 개수:', 0, '(식별 열 없음)');
    return {
      rows: mergedRows.map((row) => ({ ...row })),
      meta: emptyMeta('no_name_column', courierHeaders),
    };
  }

  const usingCodeCellAsNameSource = !nameKeyResolved && nameSourceKey === codeKey;

  if (usingCodeCellAsNameSource) {
    console.log(
      '[3물류 applyProductCodeProjection] 상품명 전용 열 없음 → 상품코드(또는 바코드) 칸·기타 열에서 매핑 키를 찾습니다.',
    );
  }

  /** 이미 투영된 코드가 다시 '상품명'으로 조회되어 실패·삭제되는 것 방지 */
  const mapOutputValues = new Set(
    Object.values(productCodeMap).filter(
      (v) => v !== undefined && String(v).trim() !== '',
    ),
  );

  let failCount = 0;
  let successCount = 0;

  const result = mergedRows.map((row, rowIndex) => {
    const out: PreviewRow = { ...row };
    const existingCodeCell = String(out[codeKey] ?? '').trim();
    if (existingCodeCell && mapOutputValues.has(existingCodeCell)) {
      successCount += 1;
      console.log(
        `[3물류 applyProductCodeProjection] 성공 row=${rowIndex} 「${codeKey}」에 이미 유효한 매핑 코드 유지: "${existingCodeCell}" (재투영 시 상품명 오인 방지)`,
      );
      return out;
    }

    let name = pickProductNameFromRow(out, codeKey, nameSourceKey);
    let option = optionKeyResolved
      ? String(out[optionKeyResolved] ?? '').trim()
      : pickOptionFromRowKeys(out);

    let code = resolveCodeFromMap(productCodeMap, name, option);
    let inferredFrom: string | null = null;

    if (code === undefined || code === '') {
      const inferred = inferNameOptionByMapMatch(out, productCodeMap, option);
      if (inferred) {
        name = inferred.name;
        option = inferred.option;
        inferredFrom = inferred.source;
        code = resolveCodeFromMap(productCodeMap, name, option);
        console.log(
          `[3물류 applyProductCodeProjection] 역추론 row=${rowIndex} 열="${inferred.source}" → name="${name}" option="${option}"`,
        );
      }
    }

    const mapKey = `${name}|${option}`;
    const directCode = productCodeMap[mapKey];
    const usedNameOnlyFallback =
      option !== '' &&
      code !== undefined &&
      code !== '' &&
      (directCode === undefined || directCode === '');

    if (code !== undefined && code !== '') {
      out[codeKey] = code;
      successCount += 1;
      console.log(
        `[3물류 applyProductCodeProjection] 성공 row=${rowIndex} key="${mapKey}"` +
          (inferredFrom ? ` (역추론:${inferredFrom})` : '') +
          (usedNameOnlyFallback ? ` (폴백: "${name}|")` : '') +
          ` → ${codeKey}="${code}"`,
      );
    } else {
      const stillThere = String(out[codeKey] ?? '').trim();
      if (stillThere && mapOutputValues.has(stillThere)) {
        successCount += 1;
        console.log(
          `[3물류 applyProductCodeProjection] 성공 row=${rowIndex} 조회 실패했으나 기존 「${codeKey}」값이 유효 코드로 유지: "${stillThere}"`,
        );
      } else {
        failCount += 1;
        out[codeKey] = '';
        console.log(
          `[3물류 applyProductCodeProjection] 실패 row=${rowIndex} key="${mapKey}" (매핑 없음) 행키=${JSON.stringify(Object.keys(out))} → ${codeKey} 비움`,
        );
      }
    }
    return out;
  });

  console.log(
    '[3물류 상품코드 매핑] 성공:',
    successCount,
    '실패(열 비움):',
    failCount,
  );

  return {
    rows: result,
    meta: {
      targetCodeColumnHeader: codeKey,
      successCount,
      failCount,
      didAttemptProjection: true,
      skipReason: 'none',
    },
  };
}
