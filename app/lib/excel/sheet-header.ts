/**
 * 엑셀 시트 구조 정리 (헤더 탐지 / 행 정렬)
 * EXCLOAD CONSTITUTION v4.3 — Stage0·UI 입력 전처리 범위의 형식 정리만 담당
 * (매핑·파이프라인 Stage1~3 비즈니스 로직 없음)
 */

import * as XLSX from 'xlsx';

/** 행 전체 join 문자열 기준 헤더 후보 판별 (기존 order / 3PL / preprocess 동일 규칙) */
export function isExcelHeaderRowText(rowText: string): boolean {
  return (
    rowText.includes('이름') ||
    rowText.includes('전화') ||
    rowText.includes('주소') ||
    rowText.includes('상품')
  );
}

/**
 * A열이 아닌 행 전체 기준으로 완전 빈 행 제거 후, 셀을 문자열로 정규화
 */
export function filterNonEmptyRows(rawData: unknown[][]): string[][] {
  return (rawData ?? [])
    .filter((row) => Array.isArray(row))
    .map((row) => (row as unknown[]).map((cell) => String(cell ?? '')))
    .filter((row) =>
      Object.values(row).some(
        (v) => v !== undefined && v !== null && String(v).trim() !== '',
      ),
    );
}

/**
 * 위에서부터 첫 번째로 헤더 키워드가 포함된 행 인덱스. 없으면 0.
 */
export function detectHeaderRowIndex(rows: ReadonlyArray<ReadonlyArray<unknown>>): number {
  if (!rows.length) return 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const rowText = Object.values(row).join(' ');
    if (isExcelHeaderRowText(rowText)) return i;
  }
  return 0;
}

/**
 * 탐지된 헤더 행부터 아래만 남김 (aligned[0] = 헤더)
 */
export function alignRowsFromHeader(rows: string[][], headerIndex: number): string[][] {
  const start = Math.max(0, Math.min(headerIndex, rows.length));
  return rows.slice(start);
}

/**
 * 첫 시트를 header:1 2차원 배열로 읽기 (XLSX 공통)
 */
export function readFirstSheetMatrixFromArrayBuffer(buffer: ArrayBuffer): unknown[][] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) {
    return [];
  }
  return XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
  }) as unknown[][];
}
