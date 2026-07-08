import * as XLSX from 'xlsx';

import {
  clipWorksheetToPopulatedRange,
  XLSX_UPLOAD_READ_OPTIONS,
} from '@/app/lib/excel/sheet-header';
import {
  detectShipmentHeaderRowIndex,
  normalizeShipmentRow,
} from '@/app/lib/order-integration/shipments/normalize-shipment-row';
import type {
  NormalizedShipmentRow,
  ParsedShipmentFile,
  ParsedShipmentRow,
  ShipmentFileFormat,
  ShipmentParseResult,
  ShipmentParseWarning,
} from '@/app/lib/order-integration/shipments/types';

type IndexedRow = {
  originalRowIndex: number;
  cells: string[];
};

function formatCellValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') {
    if (Number.isInteger(value) && Math.abs(value) < 1e15) {
      return String(value);
    }
    return String(value);
  }
  return String(value).trim();
}

function toIndexedRows(matrix: unknown[][]): IndexedRow[] {
  return matrix
    .map((row, originalRowIndex) => ({
      originalRowIndex,
      cells: Array.isArray(row) ? row.map((cell) => formatCellValue(cell)) : [],
    }))
    .filter((row) => row.cells.some((cell) => cell.trim() !== ''));
}

function rowToRecord(headers: string[], cells: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  const maxLen = Math.max(headers.length, cells.length);
  for (let i = 0; i < maxLen; i++) {
    const header = String(headers[i] ?? '').trim();
    if (!header) continue;
    record[header] = String(cells[i] ?? '').trim();
  }
  return record;
}

function warningCodeFromNormalizedMessage(message: string): string {
  if (message.includes('비어')) return 'MISSING_TRACKING_NUMBER';
  if (message.includes('짧')) return 'SHORT_TRACKING_NUMBER';
  if (message.includes('깁')) return 'LONG_TRACKING_NUMBER';
  return 'PARSE_WARNING';
}

function collectRowWarnings(
  normalized: NormalizedShipmentRow,
  originalRowIndex: number,
): ShipmentParseWarning[] {
  return normalized.parseWarnings.map((message) => ({
    code: warningCodeFromNormalizedMessage(message),
    message,
    rowIndex: originalRowIndex,
  }));
}

function buildParsedRow(input: {
  headers: string[];
  cells: string[];
  originalRowIndex: number;
}): ParsedShipmentRow {
  const rawRow = rowToRecord(input.headers, input.cells);
  const normalized = normalizeShipmentRow({
    rawRow,
    originalRowIndex: input.originalRowIndex,
  });

  return {
    originalRowIndex: input.originalRowIndex,
    rawRow,
    normalized,
    warnings: collectRowWarnings(normalized, input.originalRowIndex),
  };
}

function parseIndexedRows(
  indexedRows: IndexedRow[],
  format: ShipmentFileFormat,
): ShipmentParseResult {
  if (indexedRows.length === 0) {
    return {
      ok: false,
      error: '파일에 읽을 수 있는 행이 없습니다.',
      warnings: [{ code: 'EMPTY_FILE', message: '파일에 읽을 수 있는 행이 없습니다.' }],
    };
  }

  const headerIndexInFiltered = detectShipmentHeaderRowIndex(
    indexedRows.map((row) => row.cells),
  );
  const headerEntry = indexedRows[headerIndexInFiltered];
  if (!headerEntry) {
    return {
      ok: false,
      error: '헤더 행을 찾을 수 없습니다.',
      warnings: [{ code: 'NO_HEADER', message: '헤더 행을 찾을 수 없습니다.' }],
    };
  }

  const headers = headerEntry.cells.map((cell) => cell.trim()).filter(Boolean);
  if (headers.length === 0) {
    return {
      ok: false,
      error: '헤더 행을 찾을 수 없습니다.',
      warnings: [{ code: 'NO_HEADER', message: '헤더 행을 찾을 수 없습니다.' }],
    };
  }

  const dataRows = indexedRows.slice(headerIndexInFiltered + 1);
  if (dataRows.length === 0) {
    return {
      ok: false,
      error: '데이터 행이 없습니다.',
      warnings: [{ code: 'NO_DATA_ROWS', message: '데이터 행이 없습니다.' }],
    };
  }

  const rows = dataRows.map((entry) =>
    buildParsedRow({
      headers: headerEntry.cells,
      cells: entry.cells,
      originalRowIndex: entry.originalRowIndex,
    }),
  );

  const warnings = rows.flatMap((row) => row.warnings);

  const file: ParsedShipmentFile = {
    format,
    headerRowIndex: headerEntry.originalRowIndex,
    headers,
    rows,
  };

  return { ok: true, file, warnings };
}

/** RFC 4180 계열 — 따옴표·쉼표·줄바꿈 처리 */
export function parseCsvText(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const text = csvText.replace(/^\uFEFF/, '');

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function readShipmentSheetMatrix(worksheet: XLSX.WorkSheet): string[][] {
  clipWorksheetToPopulatedRange(worksheet);
  const matrix = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  }) as unknown[][];

  return matrix.map((row) =>
    Array.isArray(row) ? row.map((cell) => formatCellValue(cell)) : [],
  );
}

export function parseShipmentSheetMatrix(
  matrix: unknown[][],
  format: ShipmentFileFormat = 'sheet',
): ShipmentParseResult {
  return parseIndexedRows(toIndexedRows(matrix), format);
}

export function parseShipmentCsv(csvText: string): ShipmentParseResult {
  const trimmed = csvText.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: '파일에 읽을 수 있는 행이 없습니다.',
      warnings: [{ code: 'EMPTY_FILE', message: '파일에 읽을 수 있는 행이 없습니다.' }],
    };
  }

  return parseShipmentSheetMatrix(parseCsvText(csvText), 'csv');
}

export function parseShipmentWorkbook(
  buffer: ArrayBuffer,
  format: Extract<ShipmentFileFormat, 'xlsx' | 'xls'> = 'xlsx',
): ShipmentParseResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { ...XLSX_UPLOAD_READ_OPTIONS, raw: false });
  } catch {
    return {
      ok: false,
      error: '엑셀 파일을 읽을 수 없습니다.',
      warnings: [{ code: 'EMPTY_FILE', message: '엑셀 파일을 읽을 수 없습니다.' }],
    };
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!worksheet) {
    return {
      ok: false,
      error: '파일에 읽을 수 있는 행이 없습니다.',
      warnings: [{ code: 'EMPTY_FILE', message: '파일에 읽을 수 있는 행이 없습니다.' }],
    };
  }

  return parseShipmentSheetMatrix(readShipmentSheetMatrix(worksheet), format);
}

/** 정규화된 송장 행만 추출 — Phase A match 함수로 바로 전달용 */
export function extractNormalizedShipmentRows(
  result: ShipmentParseResult,
): NormalizedShipmentRow[] {
  if (!result.ok || !result.file) return [];
  return result.file.rows.map((row) => row.normalized);
}
