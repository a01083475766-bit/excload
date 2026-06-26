'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Download, Eye, FileText, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import JSZip from 'jszip';
import { useExcelFileUnlock } from '@/app/hooks/useExcelFileUnlock';
import { ExcelUnlockCancelledError } from '@/app/lib/excel/protected-file-types';
import { createSafeExcelParseTask } from '@/app/free-tools/_utils/safeExcelParser';
import type { ExcelCleanupStats, ParsedExcelSheet } from '@/app/free-tools/_utils/safeExcelParser';

type FileKind = 'excel' | 'csv';
type CsvDelimiter = 'auto' | ',' | '\t' | ';';
type CsvEncoding = 'auto' | 'utf-8' | 'euc-kr';
type SheetMode = 'single' | 'multiple';
type PageSize = 'a4' | 'a3' | 'letter';
type Orientation = 'auto' | 'portrait' | 'landscape';
type FitMode = 'fit-width' | 'split-readable' | 'keep-ratio';
type FontSizeMode = 'auto' | 'small' | 'normal' | 'large' | 'custom';
type MarginMode = 'none' | 'narrow' | 'normal' | 'wide';
type ResultState = 'empty' | 'done' | 'stale';

type LoadedFile = {
  file: File;
  kind: FileKind;
  extension: string;
  baseName: string;
  sheets: ParsedExcelSheet[];
  cleanupStats?: ExcelCleanupStats;
  selectedSheet: string;
  selectedSheets: string[];
  detectedDelimiter?: Exclude<CsvDelimiter, 'auto'>;
  detectedEncoding?: Exclude<CsvEncoding, 'auto'>;
  featureWarning?: string;
};

type PdfSettings = {
  sheetMode: SheetMode;
  showSheetTitle: boolean;
  pageSize: PageSize;
  orientation: Orientation;
  fitMode: FitMode;
  fontSizeMode: FontSizeMode;
  customFontSize: number;
  margin: MarginMode;
  headerRowCount: number;
  repeatHeader: boolean;
  wrapText: boolean;
  showBorders: boolean;
  showHeaderBackground: boolean;
  zebraRows: boolean;
  keepEmptyCellBorders: boolean;
  repeatFirstColumn: boolean;
};

type ProgressState = {
  step: string;
  current?: number;
  total?: number;
  percent?: number;
};

type PdfResult = {
  blob: Blob;
  url: string;
  fileName: string;
  pageCount: number;
  sheetCount: number;
  rowCount: number;
  originalSize: number;
  pdfSize: number;
  warnings: string[];
};

type ExcelPdfDebugStage =
  | 'font-fetch-start'
  | 'font-fetch-response'
  | 'font-fetch-complete'
  | 'fontkit-import-start'
  | 'fontkit-import-complete'
  | 'fontkit-register'
  | 'font-embed-start'
  | 'font-embed-complete'
  | 'pdf-draw'
  | 'pdf-save';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_ROWS = 30000;
const MAX_COLUMNS = 200;
const MAX_PAGES = 500;
const PREVIEW_ROWS = 20;
const PREVIEW_COLUMNS = 20;
const PT_PER_MM = 72 / 25.4;

const defaultSettings: PdfSettings = {
  sheetMode: 'single',
  showSheetTitle: true,
  pageSize: 'a4',
  orientation: 'auto',
  fitMode: 'fit-width',
  fontSizeMode: 'auto',
  customFontSize: 9,
  margin: 'normal',
  headerRowCount: 1,
  repeatHeader: true,
  wrapText: true,
  showBorders: true,
  showHeaderBackground: true,
  zebraRows: false,
  keepEmptyCellBorders: true,
  repeatFirstColumn: false,
};

const pdfPageSizes: Record<PageSize, { width: number; height: number }> = {
  a4: { width: 595.28, height: 841.89 },
  a3: { width: 841.89, height: 1190.55 },
  letter: { width: 612, height: 792 },
};

const pdfMargins: Record<MarginMode, number> = {
  none: 0,
  narrow: 5 * PT_PER_MM,
  normal: 10 * PT_PER_MM,
  wide: 20 * PT_PER_MM,
};

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('ko-KR')}KB`;
}

function getExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function getBaseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') || 'excload-excel';
}

function rowHasValue(row: string[]) {
  return row.some((cell) => String(cell ?? '').trim() !== '');
}

function getColumnCount(rows: string[][]) {
  return rows.reduce((max, row) => Math.max(max, row.length), 0);
}

function safePdfFileName(value: string) {
  const cleaned = value
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .slice(0, 80);
  return `${cleaned || 'excload-excel'}.pdf`;
}

function delimiterLabel(delimiter?: CsvDelimiter | Exclude<CsvDelimiter, 'auto'>) {
  if (delimiter === '\t') return '탭';
  if (delimiter === ';') return '세미콜론(;)';
  if (delimiter === ',') return '쉼표(,)';
  return '자동 감지';
}

function encodingLabel(encoding?: CsvEncoding | Exclude<CsvEncoding, 'auto'>) {
  if (encoding === 'euc-kr') return 'CP949/EUC-KR';
  if (encoding === 'utf-8') return 'UTF-8';
  return '자동 감지';
}

function pageSizeLabel(value: PageSize) {
  if (value === 'a3') return 'A3';
  if (value === 'letter') return 'Letter';
  return 'A4';
}

function orientationLabel(value: Orientation, columnCount?: number) {
  if (value === 'portrait') return '세로';
  if (value === 'landscape') return '가로';
  return columnCount && columnCount > 8 ? '자동(가로 예상)' : '자동(세로 예상)';
}

function fitModeLabel(value: FitMode) {
  if (value === 'split-readable') return '읽기 쉬운 크기로 열 나누기';
  if (value === 'keep-ratio') return '원본 열 너비 비율 유지';
  return '한 페이지 너비에 맞춤';
}

function marginLabel(value: MarginMode) {
  if (value === 'none') return '여백 없음';
  if (value === 'narrow') return '좁게';
  if (value === 'wide') return '넓게';
  return '보통';
}

function fontSizeLabel(value: FontSizeMode, customFontSize: number) {
  if (value === 'small') return '작게(7pt)';
  if (value === 'normal') return '보통(9pt)';
  if (value === 'large') return '크게(11pt)';
  if (value === 'custom') return `직접 입력(${customFontSize}pt)`;
  return '자동';
}

function detectDelimiter(text: string): Exclude<CsvDelimiter, 'auto'> {
  const sample = text.split(/\r?\n/).slice(0, 10).join('\n');
  const candidates: Exclude<CsvDelimiter, 'auto'>[] = [',', '\t', ';'];
  return candidates
    .map((delimiter) => ({
      delimiter,
      count: sample.split('\n').reduce((sum, line) => sum + Math.max(0, line.split(delimiter).length - 1), 0),
    }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ',';
}

function parseCsvLine(line: string, delimiter: Exclude<CsvDelimiter, 'auto'>) {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

function parseCsv(text: string, delimiter: Exclude<CsvDelimiter, 'auto'>) {
  const rows: string[][] = [];
  let currentLine = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      currentLine += '""';
      index += 1;
      continue;
    }
    if (char === '"') inQuotes = !inQuotes;

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      rows.push(parseCsvLine(currentLine, delimiter));
      currentLine = '';
    } else {
      currentLine += char;
    }
  }

  if (currentLine || text.endsWith('\n')) rows.push(parseCsvLine(currentLine, delimiter));
  return rows.filter(rowHasValue);
}

function decodeCsv(buffer: ArrayBuffer, encoding: CsvEncoding) {
  if (encoding === 'utf-8') {
    return { text: new TextDecoder('utf-8').decode(buffer), detectedEncoding: 'utf-8' as const };
  }
  if (encoding === 'euc-kr') {
    return { text: new TextDecoder('euc-kr').decode(buffer), detectedEncoding: 'euc-kr' as const };
  }

  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer), detectedEncoding: 'utf-8' as const };
  } catch {
    return { text: new TextDecoder('euc-kr').decode(buffer), detectedEncoding: 'euc-kr' as const };
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function logExcelPdfInfo(details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== 'development') return;
  const stage = typeof details.stage === 'string' ? details.stage : 'unknown';
  console.info(`[excel-to-pdf-debug] ${JSON.stringify({ stage, ...details })}`);
}

function logExcelPdfError(
  stage: ExcelPdfDebugStage,
  error: unknown,
  details?: Record<string, unknown>,
) {
  if (process.env.NODE_ENV !== 'development') return;
  console.warn(`[excel-to-pdf-debug] ${JSON.stringify({
    stage,
    errorName: error instanceof Error ? error.name : 'Unknown',
    errorMessage: error instanceof Error ? error.message : String(error),
    ...details,
  })}`);
}

function getByteSignature(bytes: Uint8Array) {
  return Array.from(bytes.slice(0, 4))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(' ');
}

async function inspectXlsxFeatures(buffer: ArrayBuffer) {
  try {
    const zip = await JSZip.loadAsync(buffer.slice(0));
    const hasRichObjects = Object.keys(zip.files).some((name) =>
      /^xl\/(charts|drawings|media)\//i.test(name) || /^xl\/vbaProject\.bin$/i.test(name),
    );
    return hasRichObjects
      ? '이 파일에는 차트, 도형, 이미지 또는 고급 기능이 포함되어 있습니다. 이번 변환에서는 표 데이터 중심으로 처리되며 해당 요소는 포함되지 않을 수 있습니다.'
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizePdfText(value: unknown) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/[\uD800-\uDFFF]/g, '')
    .slice(0, 1000);
}

function getPdfPageLayout(settings: PdfSettings, columnCount: number) {
  const base = pdfPageSizes[settings.pageSize];
  const useLandscape = settings.orientation === 'landscape' || (settings.orientation === 'auto' && columnCount > 8);
  return useLandscape
    ? { width: Math.max(base.width, base.height), height: Math.min(base.width, base.height) }
    : { width: Math.min(base.width, base.height), height: Math.max(base.width, base.height) };
}

function getPdfBodyFontSize(settings: PdfSettings, columnCount: number) {
  if (settings.fontSizeMode === 'small') return 7;
  if (settings.fontSizeMode === 'normal') return 9;
  if (settings.fontSizeMode === 'large') return 11;
  if (settings.fontSizeMode === 'custom') return Math.min(16, Math.max(6, settings.customFontSize || 9));
  if (columnCount > 18) return 6;
  if (columnCount > 12) return 7;
  if (columnCount > 8) return 8;
  return 9;
}

function wrapPdfText(text: string, maxChars: number, enabled: boolean) {
  const normalized = normalizePdfText(text);
  if (!enabled) return [normalized.replace(/\n/g, ' ')];
  const lines: string[] = [];
  for (const paragraph of normalized.split('\n')) {
    if (!paragraph) {
      lines.push('');
      continue;
    }
    for (let index = 0; index < paragraph.length; index += maxChars) {
      lines.push(paragraph.slice(index, index + maxChars));
    }
  }
  return lines.length > 0 ? lines.slice(0, 8) : [''];
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('canvas_pdf_failed'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

function getColumnGroupsForPdf(columnCount: number, settings: PdfSettings) {
  const columns = Array.from({ length: columnCount }, (_, index) => index);
  if (settings.fitMode === 'fit-width') return [columns];

  const groupSize = settings.fitMode === 'split-readable' ? 8 : 10;
  const groups: number[][] = [];
  const repeatFirstColumn = settings.repeatFirstColumn && columnCount > 1;

  for (let start = repeatFirstColumn ? 1 : 0; start < columnCount; start += groupSize) {
    const group = columns.slice(start, start + groupSize);
    groups.push(repeatFirstColumn ? [0, ...group] : group);
  }

  return groups.length > 0 ? groups : [columns];
}

function getCanvasFont(fontSize: number, bold = false) {
  return `${bold ? 'bold ' : ''}${fontSize}px "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", Arial, sans-serif`;
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  wrap: boolean,
) {
  const normalized = normalizePdfText(text);
  if (!wrap) return [normalized.replace(/\n/g, ' ')];

  const lines: string[] = [];
  for (const paragraph of normalized.split('\n')) {
    if (!paragraph) {
      lines.push('');
      continue;
    }

    let current = '';
    for (const char of Array.from(paragraph)) {
      const next = current + char;
      if (current && context.measureText(next).width > maxWidth) {
        lines.push(current);
        current = char;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
  }

  return lines.length > 0 ? lines.slice(0, 10) : [''];
}

async function createCanvasFallbackPdf(params: {
  sheets: ParsedExcelSheet[];
  settings: PdfSettings;
  onProgress: (progress: ProgressState) => void;
}) {
  logExcelPdfInfo({ stage: 'pdf-draw', mode: 'canvas-fallback' });
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const warnings = ['PDF용 한글 글꼴을 직접 적용하지 못해 표를 이미지 방식으로 PDF에 넣었습니다.'];
  let pageCount = 0;
  const totalWork = params.sheets.reduce((sum, sheet) => {
    const rows = sheet.rows.filter(rowHasValue);
    const columnCount = getColumnCount(rows);
    return sum + rows.length * getColumnGroupsForPdf(columnCount, params.settings).length;
  }, 0);
  let processedRows = 0;

  for (const sheet of params.sheets) {
    const rows = sheet.rows.filter(rowHasValue);
    if (rows.length === 0) continue;

    const columnCount = getColumnCount(rows);
    const pageLayout = getPdfPageLayout(params.settings, columnCount);
    const margin = pdfMargins[params.settings.margin];
    const usableWidth = Math.max(80, pageLayout.width - margin * 2);
    const usableHeight = Math.max(80, pageLayout.height - margin * 2);
    const fontSize = getPdfBodyFontSize(params.settings, columnCount);
    const scale = 2;
    const lineHeight = fontSize * 1.35;
    const minRowHeight = Math.max(24, lineHeight + 10);
    const maxRowHeight = Math.max(80, lineHeight * 10 + 10);
    const titleHeight = params.settings.sheetMode === 'multiple' && params.settings.showSheetTitle ? 28 : 0;
    const headerRows = Math.min(params.settings.headerRowCount, rows.length);
    const columnGroups = getColumnGroupsForPdf(columnCount, params.settings);

    for (const columnGroup of columnGroups) {
      const columnWidth = usableWidth / Math.max(1, columnGroup.length);
      let startRow = 0;

      while (startRow < rows.length) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(pageLayout.width * scale));
        canvas.height = Math.max(1, Math.round(pageLayout.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('canvas_pdf_failed');
        context.scale(scale, scale);
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, pageLayout.width, pageLayout.height);
        context.textBaseline = 'top';

        let cursorY = margin;
        if (params.settings.sheetMode === 'multiple' && params.settings.showSheetTitle) {
          context.fillStyle = '#1e3a8a';
          context.font = getCanvasFont(13, true);
          context.fillText(sheet.name, margin, cursorY);
          cursorY += titleHeight;
        }

        const rowsForPage: { row: string[]; actualRowIndex: number; rowHeight: number; wrappedCells: string[][] }[] = [];

        const measureRow = (row: string[], actualRowIndex: number) => {
          const isHeader = actualRowIndex < headerRows;
          context.font = getCanvasFont(fontSize, isHeader);
          const wrappedCells = columnGroup.map((columnIndex) =>
            wrapCanvasText(context, row[columnIndex] ?? '', Math.max(8, columnWidth - 8), params.settings.wrapText),
          );
          const maxLines = wrappedCells.reduce((max, lines) => Math.max(max, lines.length), 1);
          const rowHeight = Math.min(maxRowHeight, Math.max(minRowHeight, maxLines * lineHeight + 10));
          return { row, actualRowIndex, rowHeight, wrappedCells };
        };

        if (startRow > 0 && params.settings.repeatHeader && headerRows > 0) {
          for (let headerIndex = 0; headerIndex < headerRows; headerIndex += 1) {
            const measured = measureRow(rows[headerIndex], headerIndex);
            if (cursorY + measured.rowHeight <= pageLayout.height - margin) {
              rowsForPage.push(measured);
              cursorY += measured.rowHeight;
            }
          }
        }

        let nextRow = startRow;
        while (nextRow < rows.length) {
          const measured = measureRow(rows[nextRow], nextRow);
          if (rowsForPage.length > 0 && cursorY + measured.rowHeight > pageLayout.height - margin && nextRow > startRow) break;
          rowsForPage.push(measured);
          cursorY += measured.rowHeight;
          nextRow += 1;
        }

        cursorY = margin + titleHeight;
        for (const measured of rowsForPage) {
          const isHeader = measured.actualRowIndex < headerRows;
          let cursorX = margin;
          for (let visibleColumnIndex = 0; visibleColumnIndex < columnGroup.length; visibleColumnIndex += 1) {
            if (params.settings.showHeaderBackground && isHeader) {
              context.fillStyle = '#eaf2ff';
              context.fillRect(cursorX, cursorY, columnWidth, measured.rowHeight);
            } else if (params.settings.zebraRows && measured.actualRowIndex % 2 === 1) {
              context.fillStyle = '#fafafa';
              context.fillRect(cursorX, cursorY, columnWidth, measured.rowHeight);
            }

            if (params.settings.showBorders || params.settings.keepEmptyCellBorders) {
              context.strokeStyle = '#c7ccd6';
              context.lineWidth = 0.5;
              context.strokeRect(cursorX, cursorY, columnWidth, measured.rowHeight);
            }

            context.fillStyle = '#1f2937';
            context.font = getCanvasFont(fontSize, isHeader);
            let textY = cursorY + 5;
            for (const line of measured.wrappedCells[visibleColumnIndex]) {
              if (textY + lineHeight > cursorY + measured.rowHeight - 2) break;
              context.fillText(line, cursorX + 4, textY, Math.max(8, columnWidth - 8));
              textY += lineHeight;
            }
            cursorX += columnWidth;
          }
          cursorY += measured.rowHeight;
        }

        const blob = await canvasToPngBlob(canvas);
        const imageBytes = new Uint8Array(await blob.arrayBuffer());
        const image = await pdfDoc.embedPng(imageBytes);
        const page = pdfDoc.addPage([pageLayout.width, pageLayout.height]);
        page.drawImage(image, { x: 0, y: 0, width: pageLayout.width, height: pageLayout.height });
        pageCount += 1;
        if (pageCount > MAX_PAGES) throw new Error('page_limit');
        canvas.width = 0;
        canvas.height = 0;

        const consumedRows = Math.max(1, nextRow - startRow);
        startRow += consumedRows;
        processedRows += consumedRows;
        params.onProgress({
          step: 'PDF 페이지를 만들고 있습니다.',
          current: Math.min(processedRows, totalWork),
          total: totalWork,
          percent: Math.min(95, Math.round((Math.min(processedRows, totalWork) / Math.max(1, totalWork)) * 90) + 5),
        });
        await yieldToBrowser();
      }
    }
  }

  if (pageCount === 0) throw new Error('empty');

  logExcelPdfInfo({ stage: 'pdf-save', mode: 'canvas-fallback' });
  const pdfBytes = await pdfDoc.save();
  const output = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(output).set(pdfBytes);
  return {
    blob: new Blob([output], { type: 'application/pdf' }),
    pageCount,
    warnings,
  };
}

async function loadKoreanFontBytes() {
  logExcelPdfInfo({ stage: 'font-fetch-start' });
  const response = await fetch('/fonts/NanumGothic-Regular.ttf', { cache: 'no-store' });
  logExcelPdfInfo({
    stage: 'font-fetch-response',
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type'),
  });
  if (!response.ok) throw new Error('font_fetch_failed');
  const bytes = new Uint8Array(await response.arrayBuffer());
  logExcelPdfInfo({
    stage: 'font-fetch-complete',
    fontByteLength: bytes.byteLength,
    fontSignature: getByteSignature(bytes),
  });
  if (bytes.byteLength < 100000) throw new Error('font_fetch_failed');
  return bytes;
}

async function createMainThreadPdf(params: {
  sheets: ParsedExcelSheet[];
  settings: PdfSettings;
  onProgress: (progress: ProgressState) => void;
}) {
  params.onProgress({ step: 'PDF용 한글 글꼴을 준비하고 있습니다.', percent: 5 });
  logExcelPdfInfo({ stage: 'fontkit-import-start' });
  const [{ PDFDocument, rgb }, fontkitModule] = await Promise.all([
    import('pdf-lib'),
    import('@pdf-lib/fontkit'),
  ]);

  const fontkitCandidates = [
    (fontkitModule as unknown as { default?: unknown }).default,
    fontkitModule,
  ];
  const fontkit = fontkitCandidates.find(
    (candidate): candidate is Parameters<Awaited<ReturnType<typeof PDFDocument.create>>['registerFontkit']>[0] =>
      typeof (candidate as { create?: unknown } | null | undefined)?.create === 'function',
  );
  logExcelPdfInfo({
    stage: 'fontkit-import-complete',
    fontkitType: typeof fontkit,
    fontkitCreateType: typeof (fontkit as { create?: unknown } | undefined)?.create,
  });
  if (!fontkit) {
    logExcelPdfError('fontkit-import-complete', new Error('fontkit_failed'));
    return createCanvasFallbackPdf(params);
  }

  let fontBytes: Uint8Array;
  try {
    fontBytes = await loadKoreanFontBytes();
  } catch (error) {
    logExcelPdfError('font-fetch-complete', error);
    return createCanvasFallbackPdf(params);
  }
  const pdfDoc = await PDFDocument.create();
  logExcelPdfInfo({
    stage: 'fontkit-register',
    fontByteLength: fontBytes.byteLength,
    fontkitType: typeof fontkit,
    fontkitCreateType: typeof (fontkit as { create?: unknown }).create,
  });
  pdfDoc.registerFontkit(fontkit);
  logExcelPdfInfo({ stage: 'font-embed-start', fontByteLength: fontBytes.byteLength });
  const font = await pdfDoc.embedFont(fontBytes, { subset: false }).catch((error) => {
    logExcelPdfError('font-embed-start', error, { fontByteLength: fontBytes.byteLength });
    return null;
  });
  if (!font) return createCanvasFallbackPdf(params);
  logExcelPdfInfo({ stage: 'font-embed-complete', fontByteLength: fontBytes.byteLength });

  const warnings: string[] = [];
  const totalRows = params.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
  let processedRows = 0;
  let pageCount = 0;

  for (const sheet of params.sheets) {
    const rows = sheet.rows.filter(rowHasValue);
    if (rows.length === 0) continue;

    const columnCount = getColumnCount(rows);
    const pageLayout = getPdfPageLayout(params.settings, columnCount);
    const margin = pdfMargins[params.settings.margin];
    const usableWidth = Math.max(80, pageLayout.width - margin * 2);
    const usableHeight = Math.max(80, pageLayout.height - margin * 2);
    const fontSize = getPdfBodyFontSize(params.settings, columnCount);
    const columnWidth = usableWidth / Math.max(1, columnCount);
    const maxChars = Math.max(4, Math.floor(columnWidth / Math.max(4, fontSize * 0.55)));
    const lineHeight = fontSize * 1.35;
    const baseRowHeight = Math.max(20, lineHeight + 8);
    const headerRowCount = Math.min(params.settings.headerRowCount, rows.length);

    if (fontSize <= 6 && columnCount > 12 && params.settings.fitMode === 'fit-width') {
      warnings.push('열이 많아 글자가 작게 표시될 수 있습니다. 가로 방향이나 열 나누기를 권장합니다.');
    }

    let page = pdfDoc.addPage([pageLayout.width, pageLayout.height]);
    pageCount += 1;
    if (pageCount > MAX_PAGES) throw new Error('page_limit');
    let cursorY = pageLayout.height - margin;

    if (params.settings.sheetMode === 'multiple' && params.settings.showSheetTitle) {
      page.drawText(sheet.name, { x: margin, y: cursorY - 14, size: 13, font, color: rgb(0.1, 0.2, 0.4) });
      cursorY -= 28;
    }

    const drawRow = (row: string[], rowIndex: number, isHeader: boolean) => {
      const wrappedCells = Array.from({ length: columnCount }, (_, colIndex) =>
        wrapPdfText(row[colIndex] ?? '', maxChars, params.settings.wrapText),
      );
      const maxLines = wrappedCells.reduce((max, lines) => Math.max(max, lines.length), 1);
      const rowHeight = Math.min(120, Math.max(baseRowHeight, maxLines * lineHeight + 8));

      if (cursorY - rowHeight < margin) {
        page = pdfDoc.addPage([pageLayout.width, pageLayout.height]);
        pageCount += 1;
        if (pageCount > MAX_PAGES) throw new Error('page_limit');
        cursorY = pageLayout.height - margin;

        if (params.settings.repeatHeader && headerRowCount > 0 && !isHeader) {
          for (let headerIndex = 0; headerIndex < headerRowCount; headerIndex += 1) {
            drawRow(rows[headerIndex], headerIndex, true);
          }
        }
      }

      let cursorX = margin;
      for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
        if (params.settings.showHeaderBackground && isHeader) {
          page.drawRectangle({ x: cursorX, y: cursorY - rowHeight, width: columnWidth, height: rowHeight, color: rgb(0.91, 0.95, 1) });
        } else if (params.settings.zebraRows && rowIndex % 2 === 1) {
          page.drawRectangle({ x: cursorX, y: cursorY - rowHeight, width: columnWidth, height: rowHeight, color: rgb(0.98, 0.98, 0.99) });
        }

        if (params.settings.showBorders || params.settings.keepEmptyCellBorders) {
          page.drawRectangle({
            x: cursorX,
            y: cursorY - rowHeight,
            width: columnWidth,
            height: rowHeight,
            borderColor: rgb(0.78, 0.81, 0.86),
            borderWidth: 0.35,
          });
        }

        let textY = cursorY - fontSize - 4;
        for (const line of wrappedCells[colIndex]) {
          if (textY < cursorY - rowHeight + 4) break;
          page.drawText(line, {
            x: cursorX + 4,
            y: textY,
            size: fontSize,
            font,
            color: rgb(0.12, 0.14, 0.18),
            maxWidth: Math.max(8, columnWidth - 8),
          });
          textY -= lineHeight;
        }
        cursorX += columnWidth;
      }

      cursorY -= rowHeight;
    };

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      if (processedRows === 0) logExcelPdfInfo({ stage: 'pdf-draw' });
      drawRow(rows[rowIndex], rowIndex, rowIndex < headerRowCount);
      processedRows += 1;
      if (processedRows % 20 === 0 || processedRows === totalRows) {
        params.onProgress({
          step: 'PDF 페이지를 만들고 있습니다.',
          current: processedRows,
          total: totalRows,
          percent: Math.min(95, Math.round((processedRows / Math.max(1, totalRows)) * 90) + 5),
        });
        await yieldToBrowser();
      }
    }
  }

  if (pageCount === 0) throw new Error('empty');

  params.onProgress({ step: '결과 PDF를 저장하고 있습니다.', percent: 96 });
  logExcelPdfInfo({ stage: 'pdf-save' });
  const pdfBytes = await pdfDoc.save();
  const output = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(output).set(pdfBytes);
  return {
    blob: new Blob([output], { type: 'application/pdf' }),
    pageCount,
    warnings,
  };
}

export function ExcelToPdf() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const activeJobRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const [loadedFile, setLoadedFile] = useState<LoadedFile | null>(null);
  const [settings, setSettings] = useState<PdfSettings>(defaultSettings);
  const [csvEncoding, setCsvEncoding] = useState<CsvEncoding>('auto');
  const [csvDelimiter, setCsvDelimiter] = useState<CsvDelimiter>('auto');
  const [fileNameInput, setFileNameInput] = useState('');
  const [result, setResult] = useState<PdfResult | null>(null);
  const [resultState, setResultState] = useState<ResultState>('empty');
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showStyleSettings, setShowStyleSettings] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { unlockExcelFile, excelUnlockUi } = useExcelFileUnlock({
    onUploadCancel: () => {
      setProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  const selectedSheetNames = useMemo(() => {
    if (!loadedFile) return [];
    if (loadedFile.kind === 'csv') return [loadedFile.sheets[0]?.name ?? 'CSV'];
    if (settings.sheetMode === 'single') return [loadedFile.selectedSheet];
    return loadedFile.selectedSheets;
  }, [loadedFile, settings.sheetMode]);

  const selectedSheets = useMemo(() => {
    if (!loadedFile) return [];
    const selected = new Set(selectedSheetNames);
    return loadedFile.sheets.filter((sheet) => selected.has(sheet.name));
  }, [loadedFile, selectedSheetNames]);

  const activePreviewSheet = useMemo(() => {
    if (!loadedFile) return null;
    return loadedFile.sheets.find((sheet) => sheet.name === loadedFile.selectedSheet) ?? loadedFile.sheets[0] ?? null;
  }, [loadedFile]);

  const summary = useMemo(() => {
    const rowCount = selectedSheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
    const columnCount = selectedSheets.reduce((max, sheet) => Math.max(max, getColumnCount(sheet.rows)), 0);
    const columnGroups = settings.fitMode === 'fit-width' ? 1 : Math.max(1, Math.ceil(columnCount / (settings.repeatFirstColumn ? 7 : 8)));
    const estimatedPages = Math.max(0, Math.ceil(rowCount / 34) * columnGroups);
    return { rowCount, columnCount, estimatedPages };
  }, [selectedSheets, settings.fitMode, settings.repeatFirstColumn]);

  const finalFileName = safePdfFileName(fileNameInput || loadedFile?.baseName || 'excload-excel');

  const revokeResultUrl = () => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
  };

  const terminateWorker = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    activeJobRef.current = null;
  };

  const invalidateResult = () => {
    setError(null);
    setPreviewOpen(false);
    if (result) {
      revokeResultUrl();
      setResult(null);
      setResultState('stale');
    }
  };

  const resetAll = () => {
    terminateWorker();
    revokeResultUrl();
    setLoadedFile(null);
    setSettings(defaultSettings);
    setCsvEncoding('auto');
    setCsvDelimiter('auto');
    setFileNameInput('');
    setResult(null);
    setResultState('empty');
    setProgress(null);
    setError(null);
    setProcessing(false);
    setPreviewOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resetPdfSettings = () => {
    setSettings(defaultSettings);
    setShowStyleSettings(false);
    invalidateResult();
  };

  useEffect(() => {
    return () => {
      terminateWorker();
      revokeResultUrl();
    };
  }, []);

  useEffect(() => {
    if (!previewOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [previewOpen]);

  const validateRows = (sheets: ParsedExcelSheet[]) => {
    const nonEmpty = sheets.filter((sheet) => sheet.rows.length > 0);
    if (nonEmpty.length === 0) return 'PDF로 변환할 데이터가 없습니다.';

    const rowCount = nonEmpty.reduce((sum, sheet) => sum + sheet.rows.length, 0);
    const columnCount = nonEmpty.reduce((max, sheet) => Math.max(max, getColumnCount(sheet.rows)), 0);
    if (rowCount > MAX_ROWS) return '실제 데이터가 30,000행을 초과하여 변환할 수 없습니다. 필요한 데이터만 별도 파일로 저장한 뒤 다시 시도해 주세요.';
    if (columnCount > MAX_COLUMNS) return '데이터 열이 200개를 초과하여 PDF로 변환하기 어렵습니다. 필요한 열만 남긴 뒤 다시 시도해 주세요.';
    return null;
  };

  const loadCsvFile = async (file: File, encoding: CsvEncoding, delimiter: CsvDelimiter) => {
    const buffer = await file.arrayBuffer();
    const decoded = decodeCsv(buffer, encoding);
    const detectedDelimiter = delimiter === 'auto' ? detectDelimiter(decoded.text) : delimiter;
    const rows = parseCsv(decoded.text, detectedDelimiter);
    const sheets = [{ name: 'CSV 데이터', rows }];
    const validationError = validateRows(sheets);
    if (validationError) {
      setError(validationError);
      return;
    }
    const baseName = getBaseName(file.name);
    setLoadedFile({
      file,
      kind: 'csv',
      extension: 'csv',
      baseName,
      sheets,
      selectedSheet: 'CSV 데이터',
      selectedSheets: ['CSV 데이터'],
      detectedDelimiter,
      detectedEncoding: decoded.detectedEncoding,
    });
    setFileNameInput(baseName);
    setResult(null);
    setResultState('empty');
    setError(null);
  };

  const loadExcelFile = async (file: File, extension: string) => {
    let buffer: ArrayBuffer | null = null;
    try {
      buffer = await unlockExcelFile(file);
      const featureWarning = extension === 'xlsx' ? await inspectXlsxFeatures(buffer) : undefined;
      const task = createSafeExcelParseTask(file, extension, (message) => setProgress({ step: message }), buffer);
      const parsed = await task.promise;
      const sheets = parsed.sheets.filter((sheet) => sheet.rows.length > 0);
      const validationError = validateRows(sheets);
      if (validationError) {
        setError(validationError);
        return;
      }
      const firstSheet = sheets[0]?.name ?? '';
      const baseName = getBaseName(file.name);
      setLoadedFile({
        file,
        kind: 'excel',
        extension,
        baseName,
        sheets,
        cleanupStats: parsed.cleanupStats,
        selectedSheet: firstSheet,
        selectedSheets: [firstSheet],
        featureWarning,
      });
      setSettings((prev) => ({ ...prev, sheetMode: 'single' }));
      setFileNameInput(baseName);
      setResult(null);
      setResultState('empty');
      setError(null);
    } catch (uploadError) {
      if (uploadError instanceof ExcelUnlockCancelledError) return;
      setError('엑셀 파일을 읽을 수 없습니다. 파일이 손상되지 않았는지 확인해 주세요.');
    } finally {
      setProgress(null);
    }
  };

  const loadFile = async (file: File) => {
    terminateWorker();
    revokeResultUrl();
    setProcessing(true);
    setError(null);
    setProgress({ step: '파일 구조를 확인하고 있습니다.' });
    setPreviewOpen(false);

    try {
      const extension = getExtension(file.name);
      if (!['xlsx', 'xls', 'csv'].includes(extension)) {
        setError('XLSX, XLS 또는 CSV 파일만 올릴 수 있습니다.');
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError('파일 크기는 20MB 이하만 사용할 수 있습니다.');
        return;
      }

      if (extension === 'csv') {
        await loadCsvFile(file, csvEncoding, csvDelimiter);
      } else {
        await loadExcelFile(file, extension);
      }
    } finally {
      setProcessing(false);
      setProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file || processing) return;
    void loadFile(file);
  };

  const handleCsvReparse = () => {
    if (!loadedFile || loadedFile.kind !== 'csv' || processing) return;
    void loadCsvFile(loadedFile.file, csvEncoding, csvDelimiter);
  };

  const updateSelectedSheet = (sheetName: string) => {
    if (!loadedFile || processing) return;
    setLoadedFile({
      ...loadedFile,
      selectedSheet: sheetName,
      selectedSheets: settings.sheetMode === 'single' ? [sheetName] : loadedFile.selectedSheets,
    });
    invalidateResult();
  };

  const toggleSelectedSheet = (sheetName: string) => {
    if (!loadedFile || processing) return;
    const selected = new Set(loadedFile.selectedSheets);
    if (selected.has(sheetName)) selected.delete(sheetName);
    else selected.add(sheetName);
    const next = loadedFile.sheets.map((sheet) => sheet.name).filter((name) => selected.has(name));
    setLoadedFile({
      ...loadedFile,
      selectedSheets: next.length > 0 ? next : [sheetName],
      selectedSheet: loadedFile.selectedSheet || sheetName,
    });
    invalidateResult();
  };

  const updateSettings = <K extends keyof PdfSettings>(key: K, value: PdfSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'sheetMode' && value === 'single' && loadedFile) {
        setLoadedFile({
          ...loadedFile,
          selectedSheets: [loadedFile.selectedSheet],
        });
      }
      return next;
    });
    invalidateResult();
  };

  const generatePdf = async () => {
    if (!loadedFile) {
      setError('엑셀 또는 CSV 파일을 먼저 선택하거나 드래그해서 첨부해 주세요.');
      return;
    }
    if (selectedSheets.length === 0) {
      setError('PDF로 변환할 시트를 선택해 주세요.');
      return;
    }
    if (summary.estimatedPages > MAX_PAGES) {
      setError('PDF 결과가 500페이지를 초과할 것으로 예상됩니다. 변환할 시트나 데이터 범위를 줄인 뒤 다시 시도해 주세요.');
      return;
    }

    terminateWorker();
    revokeResultUrl();
    setResult(null);
    setResultState('empty');
    setError(null);
    setProcessing(true);
    setProgress({ step: 'PDF에 사용할 한글 글꼴을 불러오고 있습니다.', percent: 3 });

    try {
      const mainThreadResult = await createMainThreadPdf({
        sheets: selectedSheets,
        settings: {
          ...settings,
          showSheetTitle: settings.sheetMode === 'multiple' && settings.showSheetTitle,
        },
        onProgress: setProgress,
      });
      const url = URL.createObjectURL(mainThreadResult.blob);
      resultUrlRef.current = url;
      setResult({
        blob: mainThreadResult.blob,
        url,
        fileName: finalFileName,
        pageCount: mainThreadResult.pageCount,
        sheetCount: selectedSheets.length,
        rowCount: summary.rowCount,
        originalSize: loadedFile.file.size,
        pdfSize: mainThreadResult.blob.size,
        warnings: mainThreadResult.warnings,
      });
      setResultState('done');
      setProgress(null);
    } catch (generateError) {
      const message = generateError instanceof Error ? generateError.message : 'pdf_failed';
      if (message === 'font_fetch_failed') {
        logExcelPdfError('font-fetch-complete', generateError);
        setError('PDF용 한글 글꼴 파일을 불러오지 못해 변환을 진행하지 못했습니다. 원본 엑셀 문제가 아니라 변환기 글꼴 처리 문제입니다.');
      } else if (message === 'fontkit_failed') {
        logExcelPdfError('fontkit-import-complete', generateError);
        setError('PDF 한글 글꼴 처리 기능을 초기화하지 못해 변환을 진행하지 못했습니다. 원본 엑셀 문제가 아니라 변환기 글꼴 처리 문제입니다.');
      } else if (message === 'font_failed') {
        logExcelPdfError('font-embed-start', generateError);
        setError('PDF에 사용할 한글 글꼴을 직접 적용하지 못했습니다. 가능한 경우 이미지 방식 PDF로 자동 전환되며, 전환도 실패한 경우 변환기 글꼴 처리 문제입니다.');
      } else if (message === 'page_limit') {
        setError('PDF 결과가 500페이지를 초과하여 변환할 수 없습니다. 시트나 데이터 범위를 줄인 뒤 다시 시도해 주세요.');
      } else if (message === 'empty') {
        setError('PDF로 변환할 데이터가 없습니다.');
      } else if (message === 'text_failed') {
        logExcelPdfError('pdf-draw', generateError);
        setError('일부 셀에 PDF 글꼴로 처리하기 어려운 특수문자나 이모지가 포함되어 PDF를 만들지 못했습니다. 해당 문자를 삭제하거나 일반 문자로 바꾼 뒤 다시 시도해 주세요.');
      } else {
        logExcelPdfError('pdf-save', generateError);
        setError('PDF를 만드는 중 문제가 발생했습니다. 먼저 PDF 출력 설정에서 “PDF 출력 설정 초기화”를 누른 뒤 다시 만들어 보세요. 계속 실패하면 표 너비 맞춤을 “읽기 쉬운 크기로 열 나누기”로 바꾸거나, 긴 셀 내용 자동 줄바꿈을 끄고 다시 시도해 주세요.');
      }
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  };

  const previewRows = activePreviewSheet?.rows.slice(0, PREVIEW_ROWS) ?? [];
  const previewColumnCount = Math.min(PREVIEW_COLUMNS, getColumnCount(previewRows));

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5 text-sm leading-relaxed text-blue-950 sm:p-6">
        <p className="font-semibold">엑셀과 CSV의 표 데이터를 PDF 문서로 변환할 수 있습니다.</p>
        <p className="mt-1">파일은 서버로 전송되지 않고 사용자의 브라우저에서만 처리됩니다.</p>
        <p className="mt-2 text-blue-900">
          차트, 도형, 이미지, 복잡한 서식과 인쇄 설정은 원본과 다르게 표시되거나 포함되지 않을 수 있습니다. 변환 후 PDF 미리보기를 확인해 주세요.
        </p>
        <p className="mt-2 text-blue-900">
          원본 엑셀 파일은 수정하지 않습니다. PDF에서는 한글 표시를 위해 셀 문구를 PDF용 한글 글꼴로 다시 그리므로, 원본 엑셀의 글꼴 모양과는 다를 수 있습니다.
        </p>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <h3 className="text-lg font-bold text-zinc-950">파일 업로드</h3>
            <p className="mt-1 text-sm text-zinc-600">엑셀 또는 CSV 파일을 선택하거나 드래그해서 첨부해 주세요.</p>
          </div>

          <button
            type="button"
            disabled={processing}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(event) => {
              event.preventDefault();
              handleFiles(event.dataTransfer.files);
            }}
            className="flex min-h-40 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/50 px-4 py-6 text-center transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload className="size-8 text-blue-600" aria-hidden />
            <span className="mt-3 text-sm font-semibold text-zinc-900">
              파일 선택 또는 드래그 앤 드롭
            </span>
            <span className="mt-2 text-xs leading-relaxed text-zinc-500">
              지원 형식: XLSX, XLS, CSV<br />
              최대 20MB · 실제 데이터 최대 30,000행 · 최대 200열
            </span>
          </button>
          <input
            ref={fileInputRef}
            id="excel-to-pdf-file"
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            onChange={(event) => handleFiles(event.target.files)}
          />

          {loadedFile ? (
            <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
              <h4 className="font-semibold text-zinc-900">파일 관리</h4>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                현재 파일을 다른 엑셀·CSV로 바꾸거나, 첨부한 파일과 생성 결과를 모두 지울 수 있습니다.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                >
                  <Upload className="size-4" aria-hidden />
                  파일 교체
                </button>
                <button
                  type="button"
                  disabled={processing}
                  onClick={resetAll}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="size-4" aria-hidden />
                  파일 삭제
                </button>
              </div>
            </div>
          ) : null}

          {loadedFile?.kind === 'csv' ? (
            <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
              <h4 className="font-semibold text-zinc-900">CSV 읽기 설정</h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-zinc-700">
                  인코딩
                  <select
                    value={csvEncoding}
                    disabled={processing}
                    onChange={(event) => setCsvEncoding(event.target.value as CsvEncoding)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  >
                    <option value="auto">자동 감지</option>
                    <option value="utf-8">UTF-8</option>
                    <option value="euc-kr">CP949/EUC-KR</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-zinc-700">
                  구분 문자
                  <select
                    value={csvDelimiter}
                    disabled={processing}
                    onChange={(event) => setCsvDelimiter(event.target.value as CsvDelimiter)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  >
                    <option value="auto">자동 감지</option>
                    <option value=",">쉼표(,)</option>
                    <option value="\t">탭</option>
                    <option value=";">세미콜론(;)</option>
                  </select>
                </label>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                감지된 인코딩: {encodingLabel(loadedFile.detectedEncoding)} · 감지된 구분 문자: {delimiterLabel(loadedFile.detectedDelimiter)}
              </p>
              <button
                type="button"
                disabled={processing}
                onClick={handleCsvReparse}
                className="mt-3 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-white disabled:opacity-50"
              >
                CSV 다시 분석
              </button>
            </div>
          ) : null}

          {loadedFile && loadedFile.kind === 'excel' && loadedFile.sheets.length > 1 ? (
            <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
              <h4 className="font-semibold text-zinc-900">엑셀 시트 선택</h4>
              <div className="mt-3 space-y-2 text-sm text-zinc-700">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={settings.sheetMode === 'single'}
                    disabled={processing}
                    onChange={() => updateSettings('sheetMode', 'single')}
                  />
                  선택한 시트만 PDF로 변환
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={settings.sheetMode === 'multiple'}
                    disabled={processing}
                    onChange={() => updateSettings('sheetMode', 'multiple')}
                  />
                  선택한 여러 시트를 하나의 PDF로 변환
                </label>
              </div>

              {settings.sheetMode === 'single' ? (
                <label className="mt-3 block text-sm font-medium text-zinc-700">
                  변환할 시트
                  <select
                    value={loadedFile.selectedSheet}
                    disabled={processing}
                    onChange={(event) => updateSelectedSheet(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  >
                    {loadedFile.sheets.map((sheet) => (
                      <option key={sheet.name} value={sheet.name}>{sheet.name}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="mt-3 space-y-2">
                  {loadedFile.sheets.map((sheet) => (
                    <label key={sheet.name} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-zinc-700">
                      <input
                        type="checkbox"
                        checked={loadedFile.selectedSheets.includes(sheet.name)}
                        disabled={processing}
                        onChange={() => toggleSelectedSheet(sheet.name)}
                      />
                      <span className="min-w-0 flex-1 truncate">{sheet.name}</span>
                      <span className="text-xs text-zinc-500">{sheet.rows.length.toLocaleString('ko-KR')}행</span>
                    </label>
                  ))}
                  <label className="mt-2 flex items-center gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={settings.showSheetTitle}
                      disabled={processing}
                      onChange={(event) => updateSettings('showSheetTitle', event.target.checked)}
                    />
                    각 시트 시작 부분에 시트 이름 표시
                  </label>
                </div>
              )}
            </div>
          ) : null}

          <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
            <h4 className="font-semibold text-zinc-900">PDF 출력 설정</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-zinc-700">
                용지 크기
                <select value={settings.pageSize} disabled={processing} onChange={(event) => updateSettings('pageSize', event.target.value as PageSize)} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">
                  <option value="a4">A4</option>
                  <option value="a3">A3</option>
                  <option value="letter">Letter</option>
                </select>
              </label>
              <label className="text-sm font-medium text-zinc-700">
                페이지 방향
                <select value={settings.orientation} disabled={processing} onChange={(event) => updateSettings('orientation', event.target.value as Orientation)} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">
                  <option value="auto">자동</option>
                  <option value="portrait">세로</option>
                  <option value="landscape">가로</option>
                </select>
              </label>
              <label className="text-sm font-medium text-zinc-700 sm:col-span-2">
                표 너비 맞춤
                <select value={settings.fitMode} disabled={processing} onChange={(event) => updateSettings('fitMode', event.target.value as FitMode)} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">
                  <option value="fit-width">한 페이지 너비에 맞춤</option>
                  <option value="split-readable">읽기 쉬운 크기로 열 나누기</option>
                  <option value="keep-ratio">원본 열 너비 비율 유지</option>
                </select>
              </label>
              <label className="text-sm font-medium text-zinc-700">
                글자 크기
                <select value={settings.fontSizeMode} disabled={processing} onChange={(event) => updateSettings('fontSizeMode', event.target.value as FontSizeMode)} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">
                  <option value="auto">자동</option>
                  <option value="small">작게</option>
                  <option value="normal">보통</option>
                  <option value="large">크게</option>
                  <option value="custom">직접 입력</option>
                </select>
              </label>
              <label className="text-sm font-medium text-zinc-700">
                여백
                <select value={settings.margin} disabled={processing} onChange={(event) => updateSettings('margin', event.target.value as MarginMode)} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">
                  <option value="none">여백 없음</option>
                  <option value="narrow">좁게</option>
                  <option value="normal">보통</option>
                  <option value="wide">넓게</option>
                </select>
              </label>
              {settings.fontSizeMode === 'custom' ? (
                <label className="text-sm font-medium text-zinc-700">
                  직접 입력 글자 크기
                  <input type="number" min={6} max={16} value={settings.customFontSize} disabled={processing} onChange={(event) => updateSettings('customFontSize', Number(event.target.value))} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
                </label>
              ) : null}
            </div>

            <div className="mt-3 grid gap-2 text-sm text-zinc-700">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={settings.headerRowCount > 0} disabled={processing} onChange={(event) => updateSettings('headerRowCount', event.target.checked ? 1 : 0)} />
                첫 번째 행을 제목 행으로 사용
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={settings.repeatHeader} disabled={processing || settings.headerRowCount === 0} onChange={(event) => updateSettings('repeatHeader', event.target.checked)} />
                새 페이지마다 제목 행 반복
              </label>
              <label className="flex items-center gap-2">
                <span>반복할 제목 행</span>
                <input type="number" min={0} max={10} value={settings.headerRowCount} disabled={processing} onChange={(event) => updateSettings('headerRowCount', Math.min(10, Math.max(0, Number(event.target.value))))} className="w-20 rounded-lg border border-zinc-300 px-2 py-1 text-sm" />
                <span>행</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={settings.wrapText} disabled={processing} onChange={(event) => updateSettings('wrapText', event.target.checked)} />
                긴 셀 내용 자동 줄바꿈
              </label>
              {settings.fitMode !== 'fit-width' ? (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={settings.repeatFirstColumn} disabled={processing} onChange={(event) => updateSettings('repeatFirstColumn', event.target.checked)} />
                  첫 번째 열을 각 페이지에 반복
                </label>
              ) : null}
            </div>

            <button type="button" onClick={() => setShowStyleSettings((value) => !value)} className="mt-4 text-sm font-semibold text-blue-700 hover:text-blue-900">
              표 표시 설정 {showStyleSettings ? '접기' : '펼치기'}
            </button>
            {showStyleSettings ? (
              <div className="mt-3 grid gap-2 text-sm text-zinc-700">
                {[
                  ['showBorders', '표 테두리 표시'],
                  ['showHeaderBackground', '제목 행 배경 표시'],
                  ['zebraRows', '행 줄무늬 표시'],
                  ['keepEmptyCellBorders', '빈 셀도 테두리 유지'],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(settings[key as keyof PdfSettings])}
                      disabled={processing}
                      onChange={(event) => updateSettings(key as keyof PdfSettings, event.target.checked as never)}
                    />
                    {label}
                  </label>
                ))}
                <p className="text-xs text-zinc-500">숨겨진 행과 열, 복잡한 병합 셀은 이번 버전에서 일부 일반 표로 표시될 수 있습니다.</p>
              </div>
            ) : null}
            <div className="mt-4 rounded-xl border border-blue-100 bg-white p-3">
              <p className="text-xs leading-relaxed text-zinc-500">
                아래 버튼은 파일 삭제가 아니라 용지, 방향, 여백, 제목 행, 표 표시 같은 PDF 출력 설정만 기본값으로 되돌립니다.
              </p>
              <button
                type="button"
                disabled={processing}
                onClick={resetPdfSettings}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                <RotateCcw className="size-4" aria-hidden />
                PDF 출력 설정 초기화
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <div>
              <h3 className="text-lg font-bold text-zinc-950">파일 정보와 결과</h3>
              <p className="mt-1 text-sm text-zinc-600">파일을 읽은 뒤 PDF 구성과 미리보기를 확인할 수 있습니다.</p>
            </div>
          </div>

          {error ? (
            <div role="alert" aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <div className="flex gap-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>{error}</p>
              </div>
            </div>
          ) : null}

          {progress ? (
            <div aria-live="polite" className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
              <p className="font-semibold">{progress.step}</p>
              {typeof progress.percent === 'number' ? (
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100">
                  <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress.percent}%` }} />
                </div>
              ) : null}
              {progress.current && progress.total ? (
                <p className="mt-2 text-xs">{progress.current.toLocaleString('ko-KR')} / {progress.total.toLocaleString('ko-KR')}행 처리 중</p>
              ) : null}
            </div>
          ) : null}

          {loadedFile ? (
            <>
              <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 size-5 text-blue-600" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-zinc-950">{loadedFile.file.name}</p>
                    <dl className="mt-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
                      <div><dt className="font-medium text-zinc-800">형식</dt><dd>{loadedFile.extension.toUpperCase()}</dd></div>
                      <div><dt className="font-medium text-zinc-800">크기</dt><dd>{formatBytes(loadedFile.file.size)}</dd></div>
                      <div><dt className="font-medium text-zinc-800">시트</dt><dd>{loadedFile.sheets.length.toLocaleString('ko-KR')}개</dd></div>
                      <div><dt className="font-medium text-zinc-800">선택 시트</dt><dd className="truncate">{selectedSheetNames.join(', ')}</dd></div>
                      <div><dt className="font-medium text-zinc-800">실제 데이터</dt><dd>{summary.rowCount.toLocaleString('ko-KR')}행 x {summary.columnCount.toLocaleString('ko-KR')}열</dd></div>
                      <div><dt className="font-medium text-zinc-800">예상 방향</dt><dd>{orientationLabel(settings.orientation, summary.columnCount)}</dd></div>
                    </dl>
                  </div>
                </div>
              </div>

              {loadedFile.cleanupStats?.cleaned ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  파일에 불필요한 빈 서식 행이 포함되어 있어 자동으로 제외했습니다.
                  {loadedFile.cleanupStats.removedEmptyRows > 0 ? ` 제외한 빈 행: ${loadedFile.cleanupStats.removedEmptyRows.toLocaleString('ko-KR')}개` : ''}
                </div>
              ) : null}

              {loadedFile.featureWarning ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  {loadedFile.featureWarning}
                </div>
              ) : null}

              {summary.columnCount > 18 && settings.fitMode === 'fit-width' ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  열이 많아 글자가 매우 작게 표시될 수 있습니다. 가로 방향이나 ‘읽기 쉬운 크기로 열 나누기’를 선택해 주세요.
                </div>
              ) : null}

              {resultState === 'stale' ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  파일이나 PDF 설정이 변경되었습니다. PDF를 다시 만들어 주세요.
                </div>
              ) : null}

              <div className="rounded-2xl border border-zinc-100 bg-white p-4">
                <h4 className="font-semibold text-zinc-900">PDF 구성 요약</h4>
                <dl className="mt-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
                  <div><dt className="font-medium text-zinc-800">변환 시트</dt><dd className="truncate">{selectedSheetNames.join(', ')}</dd></div>
                  <div><dt className="font-medium text-zinc-800">전체 데이터</dt><dd>{summary.rowCount.toLocaleString('ko-KR')}행</dd></div>
                  <div><dt className="font-medium text-zinc-800">용지</dt><dd>{pageSizeLabel(settings.pageSize)}</dd></div>
                  <div><dt className="font-medium text-zinc-800">방향</dt><dd>{orientationLabel(settings.orientation, summary.columnCount)}</dd></div>
                  <div><dt className="font-medium text-zinc-800">너비 맞춤</dt><dd>{fitModeLabel(settings.fitMode)}</dd></div>
                  <div><dt className="font-medium text-zinc-800">제목 행 반복</dt><dd>{settings.repeatHeader ? `${settings.headerRowCount}행` : '반복 안 함'}</dd></div>
                  <div><dt className="font-medium text-zinc-800">여백</dt><dd>{marginLabel(settings.margin)}</dd></div>
                  <div><dt className="font-medium text-zinc-800">글자 크기</dt><dd>{fontSizeLabel(settings.fontSizeMode, settings.customFontSize)}</dd></div>
                  <div><dt className="font-medium text-zinc-800">예상 PDF</dt><dd>약 {summary.estimatedPages.toLocaleString('ko-KR')}페이지</dd></div>
                </dl>
                <p className="mt-3 text-xs text-zinc-500">페이지 수는 셀 내용과 줄바꿈에 따라 실제 결과와 다를 수 있습니다.</p>
              </div>

              <label className="block text-sm font-medium text-zinc-700">
                PDF 파일명
                <input
                  type="text"
                  value={fileNameInput}
                  disabled={processing}
                  onChange={(event) => setFileNameInput(event.target.value)}
                  placeholder="주문목록"
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => void generatePdf()}
                  className="inline-flex flex-1 items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  PDF 만들기
                </button>
              </div>
              <p className="rounded-lg bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
                미리보기는 아래에서 확인 가능합니다.
              </p>

              {result ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <h4 className="font-bold">PDF 변환 완료</h4>
                  <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div><dt className="font-medium">원본 파일</dt><dd className="truncate">{loadedFile.file.name}</dd></div>
                    <div><dt className="font-medium">변환한 시트</dt><dd>{result.sheetCount.toLocaleString('ko-KR')}개</dd></div>
                    <div><dt className="font-medium">데이터</dt><dd>{result.rowCount.toLocaleString('ko-KR')}행</dd></div>
                    <div><dt className="font-medium">PDF 페이지</dt><dd>{result.pageCount.toLocaleString('ko-KR')}페이지</dd></div>
                    <div><dt className="font-medium">원본 파일 용량</dt><dd>{formatBytes(result.originalSize)}</dd></div>
                    <div><dt className="font-medium">PDF 파일 용량</dt><dd>{formatBytes(result.pdfSize)}</dd></div>
                    <div className="sm:col-span-2"><dt className="font-medium">결과 파일</dt><dd>{finalFileName}</dd></div>
                  </dl>
                  {result.warnings.length > 0 ? (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-amber-900">
                      {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                  ) : null}
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button type="button" onClick={() => downloadBlob(result.blob, finalFileName)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
                      <Download className="size-4" aria-hidden />
                      PDF 다운로드
                    </button>
                    <button type="button" onClick={() => setPreviewOpen(true)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">
                      <Eye className="size-4" aria-hidden />
                      PDF 미리보기
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-8 text-center text-sm text-zinc-500">
              엑셀 또는 CSV 파일을 올리면 파일 정보, 데이터 미리보기, PDF 구성 요약이 표시됩니다.
            </div>
          )}
        </section>
      </div>

      {activePreviewSheet ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-lg font-bold text-zinc-950">표 데이터 미리보기</h3>
              <p className="mt-1 text-sm text-zinc-600">
                미리보기: 처음 {Math.min(PREVIEW_ROWS, activePreviewSheet.rows.length).toLocaleString('ko-KR')}행 · 최대 {PREVIEW_COLUMNS}열 / 전체 데이터: {activePreviewSheet.rows.length.toLocaleString('ko-KR')}행 x {getColumnCount(activePreviewSheet.rows).toLocaleString('ko-KR')}열
              </p>
            </div>
            <span className="text-xs font-medium text-zinc-500">{activePreviewSheet.name}</span>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200">
            <table className="min-w-full border-collapse text-left text-xs">
              <tbody>
                {previewRows.map((row, rowIndex) => (
                  <tr key={`${activePreviewSheet.name}-${rowIndex}`} className={rowIndex === 0 && settings.headerRowCount > 0 ? 'bg-blue-50 font-semibold' : rowIndex % 2 === 1 ? 'bg-zinc-50' : 'bg-white'}>
                    <th className="sticky left-0 z-10 border-r border-zinc-200 bg-inherit px-3 py-2 text-zinc-500">{rowIndex + 1}</th>
                    {Array.from({ length: previewColumnCount }, (_, columnIndex) => (
                      <td key={columnIndex} title={String(row[columnIndex] ?? '')} className="max-w-[180px] truncate border-r border-zinc-100 px-3 py-2 text-zinc-700">
                        {String(row[columnIndex] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-sm leading-relaxed text-zinc-600 sm:p-6">
        <p className="font-semibold text-zinc-900">개인정보 안내</p>
        <p className="mt-2">업로드한 엑셀과 CSV 파일은 서버로 전송되지 않습니다. 파일 읽기와 PDF 생성은 사용자의 브라우저에서만 처리됩니다.</p>
        <p className="mt-1">페이지를 닫거나 새로고침하면 업로드한 파일과 생성 결과는 사라집니다.</p>
      </section>

      {previewOpen && result ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewOpen(false);
          }}
        >
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h3 className="font-bold text-zinc-950">PDF 미리보기</h3>
                <p className="text-xs text-zinc-500">{finalFileName}</p>
              </div>
              <button type="button" aria-label="미리보기 닫기" onClick={() => setPreviewOpen(false)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <iframe title="엑셀 PDF 변환 결과 미리보기" src={result.url} className="h-[75vh] w-full bg-zinc-100" />
          </div>
        </div>
      ) : null}

      {excelUnlockUi}
    </div>
  );
}
