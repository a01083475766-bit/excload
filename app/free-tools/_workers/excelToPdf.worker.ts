import * as fontkitModule from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';
import type { Fontkit } from 'pdf-lib/cjs/types/fontkit';

type PageSize = 'a4' | 'a3' | 'letter';
type Orientation = 'auto' | 'portrait' | 'landscape';
type FitMode = 'fit-width' | 'split-readable' | 'keep-ratio';
type FontSizeMode = 'auto' | 'small' | 'normal' | 'large' | 'custom';
type MarginMode = 'none' | 'narrow' | 'normal' | 'wide';

type PdfTableSettings = {
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
  showSheetTitle: boolean;
};

type SheetPayload = {
  name: string;
  rows: string[][];
};

type WorkerRequest = {
  jobId: string;
  sheets: SheetPayload[];
  settings: PdfTableSettings;
  fontBuffer: ArrayBuffer;
};

type WorkerScope = Omit<typeof self, 'postMessage'> & {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

const workerSelf = self as WorkerScope;

type FontkitLike = {
  create: (...args: unknown[]) => unknown;
};

type WorkerProgress = {
  type: 'progress';
  jobId: string;
  step: string;
  current?: number;
  total?: number;
  percent?: number;
};

const PT_PER_MM = 72 / 25.4;
const MAX_PAGES = 500;
const CELL_PADDING = 4;
const LINE_HEIGHT_RATIO = 1.35;
const MAX_CELL_CHARS = 1000;

const pageSizes: Record<PageSize, { width: number; height: number; label: string }> = {
  a4: { width: 595.28, height: 841.89, label: 'A4' },
  a3: { width: 841.89, height: 1190.55, label: 'A3' },
  letter: { width: 612, height: 792, label: 'Letter' },
};

const marginPoints: Record<MarginMode, number> = {
  none: 0,
  narrow: 5 * PT_PER_MM,
  normal: 10 * PT_PER_MM,
  wide: 20 * PT_PER_MM,
};

function postProgress(message: WorkerProgress) {
  workerSelf.postMessage(message);
}

function getFontkit(): Fontkit {
  const moduleValue = fontkitModule as unknown as FontkitLike & { default?: FontkitLike };
  const candidates = [moduleValue, moduleValue.default];
  const matched = candidates.find((candidate): candidate is FontkitLike => typeof candidate?.create === 'function');
  if (!matched) throw new Error('font_failed');
  return matched as unknown as Fontkit;
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/[\uD800-\uDFFF]/g, '')
    .slice(0, MAX_CELL_CHARS);
}

function getColumnCount(rows: string[][]) {
  return rows.reduce((max, row) => Math.max(max, row.length), 0);
}

function getPageSize(size: PageSize, orientation: Orientation, columnCount: number) {
  const base = pageSizes[size];
  const useLandscape = orientation === 'landscape' || (orientation === 'auto' && columnCount > 8);
  return useLandscape
    ? { width: Math.max(base.width, base.height), height: Math.min(base.width, base.height), orientation: 'landscape' as const }
    : { width: Math.min(base.width, base.height), height: Math.max(base.width, base.height), orientation: 'portrait' as const };
}

function getFontSize(settings: PdfTableSettings, columnCount: number) {
  if (settings.fontSizeMode === 'small') return 7;
  if (settings.fontSizeMode === 'normal') return 9;
  if (settings.fontSizeMode === 'large') return 11;
  if (settings.fontSizeMode === 'custom') return Math.min(16, Math.max(6, settings.customFontSize || 9));
  if (columnCount > 18) return 6;
  if (columnCount > 12) return 7;
  if (columnCount > 8) return 8;
  return 9;
}

function buildColumnWidths(rows: string[][], columnIndexes: number[], availableWidth: number, settings: PdfTableSettings) {
  const scores = columnIndexes.map((columnIndex) => {
    const sampled = rows.slice(0, 80).map((row) => normalizeText(row[columnIndex]));
    const maxLength = sampled.reduce((max, text) => Math.max(max, Math.min(40, text.length)), 4);
    return Math.max(4, maxLength);
  });
  const totalScore = scores.reduce((sum, value) => sum + value, 0) || 1;
  const minWidth = settings.fitMode === 'fit-width' ? 26 : 42;
  const naturalWidths = scores.map((score) => Math.max(minWidth, (availableWidth * score) / totalScore));
  const totalNatural = naturalWidths.reduce((sum, value) => sum + value, 0);

  if (settings.fitMode === 'fit-width' && totalNatural > availableWidth) {
    const scale = availableWidth / totalNatural;
    return naturalWidths.map((width) => Math.max(18, width * scale));
  }

  return naturalWidths;
}

function splitColumns(columnCount: number, rows: string[][], availableWidth: number, settings: PdfTableSettings, fontSize: number) {
  const indexes = Array.from({ length: columnCount }, (_, index) => index);

  if (settings.fitMode === 'fit-width') return [indexes];

  const groups: number[][] = [];
  const baseMinWidth = settings.fitMode === 'keep-ratio' ? Math.max(52, fontSize * 7) : Math.max(46, fontSize * 6);
  const repeated = settings.repeatFirstColumn && columnCount > 1 ? 1 : 0;
  let current: number[] = repeated ? [0] : [];
  let width = repeated ? baseMinWidth : 0;

  for (const columnIndex of indexes) {
    if (repeated && columnIndex === 0) continue;
    const nextWidth = baseMinWidth;
    if (current.length > repeated && width + nextWidth > availableWidth) {
      groups.push(current);
      current = repeated ? [0, columnIndex] : [columnIndex];
      width = (repeated ? baseMinWidth : 0) + nextWidth;
    } else {
      current.push(columnIndex);
      width += nextWidth;
    }
  }

  if (current.length > 0) groups.push(current);
  return groups.length > 0 ? groups : [indexes];
}

function wrapText(text: string, maxWidth: number, font: { widthOfTextAtSize: (text: string, size: number) => number }, fontSize: number, enabled: boolean) {
  const normalized = normalizeText(text);
  if (!enabled) return [normalized.replace(/\n/g, ' ')];

  const lines: string[] = [];
  for (const paragraph of normalized.split('\n')) {
    if (!paragraph) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const char of Array.from(paragraph)) {
      const next = current + char;
      if (current && font.widthOfTextAtSize(next, fontSize) > maxWidth) {
        lines.push(current);
        current = char;
      } else {
        current = next;
      }
    }
    lines.push(current);
  }
  return lines.length > 0 ? lines.slice(0, 12) : [''];
}

function drawCell(params: {
  page: ReturnType<PDFDocument['addPage']>;
  font: PDFFont;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fill?: { r: number; g: number; b: number };
  border: boolean;
  bold?: boolean;
  wrap: boolean;
}) {
  const { page, font, text, x, y, width, height, fontSize, fill, border, wrap } = params;
  if (fill) {
    page.drawRectangle({ x, y, width, height, color: rgb(fill.r, fill.g, fill.b) });
  }
  if (border) {
    page.drawRectangle({
      x,
      y,
      width,
      height,
      borderColor: rgb(0.78, 0.81, 0.86),
      borderWidth: 0.35,
    });
  }

  const lines = wrapText(text, Math.max(8, width - CELL_PADDING * 2), font, fontSize, wrap);
  const lineHeight = fontSize * LINE_HEIGHT_RATIO;
  let cursorY = y + height - CELL_PADDING - fontSize;
  for (const line of lines) {
    if (cursorY < y + CELL_PADDING) break;
    try {
      page.drawText(line, {
        x: x + CELL_PADDING,
        y: cursorY,
        size: fontSize,
        font,
        color: rgb(0.12, 0.14, 0.18),
        maxWidth: Math.max(8, width - CELL_PADDING * 2),
      });
    } catch {
      throw new Error('text_failed');
    }
    cursorY -= lineHeight;
  }
}

function estimateRowHeight(row: string[], columns: number[], widths: number[], font: PDFFont, fontSize: number, wrap: boolean) {
  const lineHeight = fontSize * LINE_HEIGHT_RATIO;
  const maxLines = columns.reduce((max, columnIndex, index) => {
    const lines = wrapText(row[columnIndex] ?? '', Math.max(8, widths[index] - CELL_PADDING * 2), font, fontSize, wrap);
    return Math.max(max, lines.length);
  }, 1);
  return Math.min(140, Math.max(20, maxLines * lineHeight + CELL_PADDING * 2));
}

async function createPdf({ jobId, sheets, settings, fontBuffer }: WorkerRequest) {
  postProgress({ type: 'progress', jobId, step: 'PDF 문서를 준비하고 있습니다.', percent: 5 });

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(getFontkit());
  let font: PDFFont;
  try {
    font = await pdfDoc.embedFont(fontBuffer, { subset: true });
  } catch {
    try {
      font = await pdfDoc.embedFont(fontBuffer, { subset: false });
    } catch {
      throw new Error('font_failed');
    }
  }

  let pageCount = 0;
  const warnings = new Set<string>();
  const totalRows = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
  let processedRows = 0;

  for (const sheet of sheets) {
    const rows = sheet.rows.filter((row) => row.some((cell) => normalizeText(cell).trim() !== ''));
    if (rows.length === 0) continue;

    const columnCount = getColumnCount(rows);
    const pageLayout = getPageSize(settings.pageSize, settings.orientation, columnCount);
    const margin = marginPoints[settings.margin];
    const availableWidth = Math.max(80, pageLayout.width - margin * 2);
    const availableHeight = Math.max(80, pageLayout.height - margin * 2);
    const fontSize = getFontSize(settings, columnCount);
    const columnGroups = splitColumns(columnCount, rows, availableWidth, settings, fontSize);
    const headerRows = rows.slice(0, Math.min(settings.headerRowCount, rows.length));
    const bodyRows = rows.slice(Math.min(settings.headerRowCount, rows.length));

    if (fontSize <= 6 && settings.fitMode === 'fit-width' && columnCount > 18) {
      warnings.add('열이 많아 글자가 작게 표시될 수 있습니다. 가로 방향이나 열 나누기를 권장합니다.');
    }

    for (const group of columnGroups) {
      const widths = buildColumnWidths(rows, group, availableWidth, settings);
      let page: PDFPage = pdfDoc.addPage([pageLayout.width, pageLayout.height]);
      pageCount += 1;
      if (pageCount > MAX_PAGES) throw new Error('page_limit');

      let cursorY = pageLayout.height - margin;

      if (settings.showSheetTitle) {
        page.drawText(sheet.name, {
          x: margin,
          y: cursorY - 14,
          size: 13,
          font,
          color: rgb(0.1, 0.2, 0.4),
        });
        cursorY -= 28;
      }

      const drawHeader = () => {
        for (const headerRow of headerRows) {
          const rowHeight = estimateRowHeight(headerRow, group, widths, font, fontSize, settings.wrapText);
          let cursorX = margin;
          for (let index = 0; index < group.length; index += 1) {
            drawCell({
              page,
              font,
              text: headerRow[group[index]] ?? '',
              x: cursorX,
              y: cursorY - rowHeight,
              width: widths[index],
              height: rowHeight,
              fontSize,
              fill: settings.showHeaderBackground ? { r: 0.91, g: 0.95, b: 1 } : undefined,
              border: settings.showBorders,
              wrap: settings.wrapText,
            });
            cursorX += widths[index];
          }
          cursorY -= rowHeight;
        }
      };

      drawHeader();

      for (let rowIndex = 0; rowIndex < bodyRows.length; rowIndex += 1) {
        const row = bodyRows[rowIndex];
        const rowHeight = estimateRowHeight(row, group, widths, font, fontSize, settings.wrapText);

        if (cursorY - rowHeight < margin) {
          page = pdfDoc.addPage([pageLayout.width, pageLayout.height]);
          pageCount += 1;
          if (pageCount > MAX_PAGES) throw new Error('page_limit');
          cursorY = pageLayout.height - margin;
          if (settings.repeatHeader && headerRows.length > 0) drawHeader();
        }

        let cursorX = margin;
        for (let index = 0; index < group.length; index += 1) {
          const value = row[group[index]] ?? '';
          drawCell({
            page,
            font,
            text: value,
            x: cursorX,
            y: cursorY - rowHeight,
            width: widths[index],
            height: rowHeight,
            fontSize,
            fill: settings.zebraRows && rowIndex % 2 === 1 ? { r: 0.98, g: 0.98, b: 0.99 } : undefined,
            border: settings.showBorders || settings.keepEmptyCellBorders || normalizeText(value).trim() !== '',
            wrap: settings.wrapText,
          });
          cursorX += widths[index];
        }
        cursorY -= rowHeight;
        processedRows += 1;

        if (processedRows % 50 === 0 || processedRows === totalRows) {
          postProgress({
            type: 'progress',
            jobId,
            step: 'PDF 페이지를 만들고 있습니다.',
            current: processedRows,
            total: totalRows,
            percent: Math.min(95, Math.round((processedRows / Math.max(1, totalRows)) * 90) + 5),
          });
        }
      }
    }
  }

  if (pageCount === 0) throw new Error('empty');

  postProgress({ type: 'progress', jobId, step: '결과 PDF를 저장하고 있습니다.', percent: 96 });
  const pdfBytes = await pdfDoc.save();
  const output = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(output).set(pdfBytes);
  return { output, pageCount, warnings: Array.from(warnings) };
}

workerSelf.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const result = await createPdf(request);
    workerSelf.postMessage(
      {
        type: 'complete',
        jobId: request.jobId,
        pdfBuffer: result.output,
        pageCount: result.pageCount,
        warnings: result.warnings,
      },
      [result.output],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const errorCode =
      message === 'page_limit' || message === 'empty' || message === 'font_failed' || message === 'text_failed'
        ? message
        : 'pdf_failed';
    workerSelf.postMessage({ type: 'error', jobId: request.jobId, errorCode });
  }
};
