/**
 * 물류 주문 변환 전용 — Stage3 병합 직후·미리보기 직전 상품코드 투영
 * Stage2 / merge-pipeline 내부 수정 없음
 */

import * as XLSX from 'xlsx';
import type { PreviewRow } from '@/app/pipeline/merge/types';

/**
 * 매핑 키 (내부 저장 형식)
 * - 기본: "상품명|옵션" (옵션 없으면 "상품명|")
 * - 통합키 열: "상품+옵션" 한 덩어리 → "상품+옵션|" (빈 옵션 슬롯)
 */
export type ProductCodeMap = Record<string, string>;

/** 템플릿에서 인식한 코드 열(상품코드·바코드·코드 등) + 매핑 성공/실패 건수 */
export type ProductCodeProjectionMeta = {
  /** 매핑 값이 채워지거나 비워지는 열의 템플릿 헤더명 */
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

/**
 * - default: 상품명(또는 품목명) 열 + 옵션 열 → 상품코드 열
 * - code_column_as_name: 상품명 열이 없을 때 **상품코드 칸의 문자열**을 상품명으로 보고 매핑 (미리보기에 상품명이 코드 칸에만 있을 때)
 */
export type ProductCodeProjectionOptions = {
  nameSource?: 'default' | 'code_column_as_name';
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
 * 상품코드 매핑 엑셀(첫 시트, 1행 헤더) → productCodeMap
 * 필수 열: 상품명, 상품코드 / 옵션 열은 선택(없으면 빈 옵션으로 키 생성)
 */
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

/**
 * 정렬된 시트 행(0행=헤더)에서 상품코드 맵 생성 — 모달 미리보기·localStorage 복원용
 */
export function parseProductCodeMapFromMatrix(matrix: string[][]): ProductCodeMap {
  if (!matrix.length) return {};

  const headerRow = matrix[0].map((c) => String(c ?? '').trim());
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
      '[parseProductCodeMap] 상품코드 열을 찾지 못했습니다. 헤더:',
      headerRow,
    );
    return {};
  }

  if (nameIdx < 0 && compositeIdx < 0) {
    console.warn(
      '[parseProductCodeMap] 상품명(또는 매핑키/통합키) 열을 찾지 못했습니다. 헤더:',
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
    `[parseProductCodeMap] 로드 완료: ${Object.keys(map).length}건 (상품명열 ${nameIdx >= 0 ? 'O' : 'X'}, 옵션열 ${optionIdx >= 0 ? 'O' : 'X'}, 통합키열 ${compositeIdx >= 0 ? 'O' : 'X'})`,
  );
  return map;
}

/** 물류 미리보기 헤더 중 상품명에 해당하는 열 이름 */
export function resolveLogisticsProductNameColumn(
  courierHeaders: string[],
): string | null {
  const exact = courierHeaders.find((h) => normalizeHeaderCell(h) === '상품명');
  if (exact) return exact;
  const idx = findColumnIndex(courierHeaders, ['상품명', '품목명', '제품명']);
  return idx >= 0 ? courierHeaders[idx] : null;
}

function resolveNameHeader(courierHeaders: string[]): string | null {
  return resolveLogisticsProductNameColumn(courierHeaders);
}

/** 물류 미리보기 헤더 중 옵션에 해당하는 열 이름 */
export function resolveLogisticsProductOptionColumn(
  courierHeaders: string[],
): string | null {
  const idx = findColumnIndex(courierHeaders, [
    '옵션',
    '옵션명',
    '상품옵션',
    '옵션정보',
  ]);
  return idx >= 0 ? courierHeaders[idx] : null;
}

function resolveOptionHeader(courierHeaders: string[]): string | null {
  return resolveLogisticsProductOptionColumn(courierHeaders);
}

/**
 * 주문 키 `상품명|옵션`으로 조회 후, 없으면 `상품명|` 폴백,
 * 통합키 열로 등록한 `상품+옵션|` 조회.
 * 물류 코드매핑 모달 등에서 상품 마스터 맵 조회용으로 export.
 */
export function resolveProductCodeFromMap(
  productCodeMap: ProductCodeMap,
  name: string,
  option: string,
): string | undefined {
  return resolveCodeFromMap(productCodeMap, name, option);
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
    const plusCompositeKey = `${name}+${option}|`;
    code = productCodeMap[plusCompositeKey];
    if (code !== undefined && code !== '') {
      return code;
    }
  }
  return undefined;
}

/** 미리보기/다운로드 헤더에서 상품코드(또는 바코드·코드) 열 이름 */
export function resolveProductCodeColumnHeader(
  courierHeaders: string[],
): string | null {
  const idx = findColumnIndex(courierHeaders, [
    '상품코드',
    '품목코드',
    '바코드',
    '코드',
  ]);
  return idx >= 0 ? courierHeaders[idx] : null;
}

function resolveCodeHeader(courierHeaders: string[]): string | null {
  return resolveProductCodeColumnHeader(courierHeaders);
}

/**
 * 상품명 전용 열 없이, 상품코드 칸에 들어 있는 문자열을 상품명으로 보고 매핑한다.
 * 이미 매핑 결과로 보이는 값(맵의 출력값)은 유지한다. 매핑 실패 시 기존 칸 값(상품명)은 유지한다.
 */
function applyProductCodeProjectionCodeColumnAsName(
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
    return {
      rows: mergedRows.map((row) => ({ ...row })),
      meta: emptyMeta('no_map', courierHeaders),
    };
  }

  const optionKey = resolveOptionHeader(courierHeaders);
  const codeKey = resolveCodeHeader(courierHeaders);

  if (!codeKey) {
    console.warn(
      '[applyProductCodeProjection] code_column_as_name: 코드 열 없음. 투영 생략.',
    );
    return {
      rows: mergedRows.map((row) => ({ ...row })),
      meta: emptyMeta('no_code_column', courierHeaders),
    };
  }

  const mapOutputValues = new Set(
    Object.values(productCodeMap).filter(
      (v) => v !== undefined && String(v).trim() !== '',
    ),
  );

  let failCount = 0;
  let successCount = 0;

  const result = mergedRows.map((row, rowIndex) => {
    const out: PreviewRow = { ...row };
    const existingCell = String(out[codeKey] ?? '').trim();

    if (existingCell && mapOutputValues.has(existingCell)) {
      successCount += 1;
      console.log(
        `[applyProductCodeProjection] code_column_as_name row=${rowIndex} 「${codeKey}」에 이미 매핑 코드 유지: "${existingCell}"`,
      );
      return out;
    }

    if (!existingCell) {
      failCount += 1;
      console.log(
        `[applyProductCodeProjection] code_column_as_name 실패 row=${rowIndex} ${codeKey} 비어 있음`,
      );
      return out;
    }

    const name = existingCell;
    const option = optionKey ? String(out[optionKey] ?? '').trim() : '';
    const mapKey = `${name}|${option}`;
    const code = resolveCodeFromMap(productCodeMap, name, option);

    if (code !== undefined && code !== '') {
      out[codeKey] = code;
      successCount += 1;
      console.log(
        `[applyProductCodeProjection] code_column_as_name 성공 row=${rowIndex} key="${mapKey}" → ${codeKey}="${code}"`,
      );
    } else {
      failCount += 1;
      console.log(
        `[applyProductCodeProjection] code_column_as_name 실패 row=${rowIndex} key="${mapKey}" (매핑 없음) — 상품명 유지`,
      );
    }
    return out;
  });

  console.log(
    '[상품코드 매핑 code_column_as_name] 성공:',
    successCount,
    '실패(상품명 유지):',
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

/**
 * Stage3 병합 결과 행에 상품코드를 투영한다.
 * 매핑 실패 시 해당 코드 열(상품코드·바코드 등) 값을 비운다. (단, `code_column_as_name` 모드는 실패 시 기존 값 유지)
 * @param mergedRows Stage3의 previewRows (택배사/물류 헤더 키)
 * @param courierHeaders 템플릿 열 이름 배열
 * @param productCodeMap 키 "상품명|옵션" 또는 통합키 "상품+옵션|" → 상품코드
 */
export function applyProductCodeProjection(
  mergedRows: PreviewRow[],
  courierHeaders: string[],
  productCodeMap: ProductCodeMap,
  options?: ProductCodeProjectionOptions,
): ProductCodeProjectionResult {
  const mode = options?.nameSource ?? 'default';
  if (mode === 'code_column_as_name') {
    return applyProductCodeProjectionCodeColumnAsName(
      mergedRows,
      courierHeaders,
      productCodeMap,
    );
  }

  if (!mergedRows.length) {
    return {
      rows: [],
      meta: emptyMeta('no_map', courierHeaders),
    };
  }

  if (!productCodeMap || Object.keys(productCodeMap).length === 0) {
    console.log('[상품코드 매핑] 실패 개수:', 0, '(매핑 맵 없음)');
    return {
      rows: mergedRows.map((row) => ({ ...row })),
      meta: emptyMeta('no_map', courierHeaders),
    };
  }

  const nameKey = resolveNameHeader(courierHeaders);
  const optionKey = resolveOptionHeader(courierHeaders);
  const codeKey = resolveCodeHeader(courierHeaders);

  if (!codeKey) {
    console.warn(
      '[applyProductCodeProjection] 템플릿에 상품코드/바코드/코드 열을 찾지 못했습니다. 투영 생략.',
    );
    console.log('[상품코드 매핑] 실패 개수:', 0, '(코드 열 없음)');
    return {
      rows: mergedRows.map((row) => ({ ...row })),
      meta: emptyMeta('no_code_column', courierHeaders),
    };
  }

  if (!nameKey) {
    console.warn(
      '[applyProductCodeProjection] 템플릿에 상품명(또는 품목명) 열을 찾지 못했습니다. 투영 생략.',
    );
    console.log('[상품코드 매핑] 실패 개수:', 0, '(상품명 열 없음)');
    return {
      rows: mergedRows.map((row) => ({ ...row })),
      meta: emptyMeta('no_name_column', courierHeaders),
    };
  }

  let failCount = 0;
  let successCount = 0;

  const result = mergedRows.map((row, rowIndex) => {
    const out: PreviewRow = { ...row };
    const name = String(out[nameKey] ?? '').trim();
    const option = optionKey
      ? String(out[optionKey] ?? '').trim()
      : '';
    const mapKey = `${name}|${option}`;
    const directCode = productCodeMap[mapKey];
    const code = resolveCodeFromMap(productCodeMap, name, option);
    /** 주문에만 옵션이 있고 매핑은 상품명 단위만 있을 때 */
    const usedNameOnlyFallback =
      option !== '' &&
      code !== undefined &&
      code !== '' &&
      (directCode === undefined || directCode === '');

    if (code !== undefined && code !== '') {
      out[codeKey] = code;
      successCount += 1;
      console.log(
        `[applyProductCodeProjection] 성공 row=${rowIndex} key="${mapKey}"` +
          (usedNameOnlyFallback ? ` (폴백: "${name}|")` : '') +
          ` → ${codeKey}="${code}"`,
      );
    } else {
      failCount += 1;
      out[codeKey] = '';
      console.log(
        `[applyProductCodeProjection] 실패 row=${rowIndex} key="${mapKey}" (매핑 없음) → ${codeKey} 비움`,
      );
    }
    return out;
  });

  console.log(
    '[상품코드 매핑] 성공:',
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
