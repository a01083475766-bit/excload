/**
 * 엑셀 시트 구조 정리 (헤더 탐지 / 행 정렬)
 * EXCLOAD CONSTITUTION v4.3 — Stage0·UI 입력 전처리 범위의 형식 정리만 담당
 * (매핑·파이프라인 Stage1~3 비즈니스 로직 없음)
 */

import * as XLSX from 'xlsx';

type WorkSheet = XLSX.WorkSheet;

/** 업로드·probe 공통 — 스타일/수식 포맷 파싱 생략으로 읽기 부담 완화 */
export const XLSX_UPLOAD_READ_OPTIONS: XLSX.ParsingOptions = {
  type: 'array',
  cellStyles: false,
  cellNF: false,
  cellHTML: false,
};

/**
 * 시트에 실제로 값이 있는 셀만 스캔해 사용 범위를 구한다.
 * Excel에서 행을 삭제해도 !ref가 수십만 행으로 남는 파일(빈 행 대량 생성) 방지용.
 */
export function computePopulatedSheetRange(worksheet: WorkSheet): XLSX.Range | null {
  let minR = Infinity;
  let maxR = -1;
  let minC = Infinity;
  let maxC = -1;

  for (const key of Object.keys(worksheet)) {
    if (key[0] === '!') continue;
    const addr = XLSX.utils.decode_cell(key);
    if (!Number.isFinite(addr.r) || !Number.isFinite(addr.c)) continue;
    minR = Math.min(minR, addr.r);
    maxR = Math.max(maxR, addr.r);
    minC = Math.min(minC, addr.c);
    maxC = Math.max(maxC, addr.c);
  }

  if (maxR < 0) return null;
  return { s: { r: minR, c: minC }, e: { r: maxR, c: maxC } };
}

/** 선언된 !ref가 실제 데이터보다 과대할 때, 채워진 셀 기준으로 범위를 줄인다. */
export function clipWorksheetToPopulatedRange(worksheet: WorkSheet): void {
  const populated = computePopulatedSheetRange(worksheet);
  if (!populated) return;

  if (!worksheet['!ref']) {
    worksheet['!ref'] = XLSX.utils.encode_range(populated);
    return;
  }

  const declared = XLSX.utils.decode_range(worksheet['!ref']);
  const declaredRows = declared.e.r - declared.s.r + 1;
  const populatedRows = populated.e.r - populated.s.r + 1;

  if (populatedRows < declaredRows) {
    worksheet['!ref'] = XLSX.utils.encode_range(populated);
  }
}

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
/** probe·암호 해제 판별용 — 전체 sheet_to_json 없이 데이터 존재만 확인 */
export function firstSheetHasPopulatedCells(buffer: ArrayBuffer): boolean {
  try {
    const workbook = XLSX.read(buffer, XLSX_UPLOAD_READ_OPTIONS);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
    if (!worksheet) return false;
    clipWorksheetToPopulatedRange(worksheet);
    return computePopulatedSheetRange(worksheet) != null;
  } catch {
    return false;
  }
}

export function readFirstSheetMatrixFromArrayBuffer(buffer: ArrayBuffer): unknown[][] {
  const workbook = XLSX.read(buffer, XLSX_UPLOAD_READ_OPTIONS);
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) {
    return [];
  }
  clipWorksheetToPopulatedRange(worksheet);
  return XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
  }) as unknown[][];
}
