import { describe, expect, test } from 'vitest';
import * as XLSX from 'xlsx';
import fs from 'fs';
import {
  clipWorksheetToPopulatedRange,
  computePopulatedSheetRange,
  firstSheetHasPopulatedCells,
  readFirstSheetMatrixFromArrayBuffer,
} from '@/app/lib/excel/sheet-header';

describe('sheet-header populated range', () => {
  test('clipWorksheetToPopulatedRange shrinks inflated !ref', () => {
    const ws: XLSX.WorkSheet = {
      '!ref': 'A1:C1048476',
      A1: { t: 's', v: '이름' },
      B1: { t: 's', v: '전화' },
      A2: { t: 's', v: '홍길동' },
      B2: { t: 's', v: '01012345678' },
    };

    clipWorksheetToPopulatedRange(ws);
    expect(ws['!ref']).toBe('A1:B2');

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
    expect(rows.length).toBe(2);
  });

  test('computePopulatedSheetRange returns null for empty sheet', () => {
    expect(computePopulatedSheetRange({ '!ref': 'A1:Z100' })).toBeNull();
  });

  test('inflated !ref: matrix read returns only populated rows', () => {
    const fixture =
      'c:/Users/my pc/OneDrive/Desktop/주문파일 - 복사본100 - 복사본.xlsx';
    if (!fs.existsSync(fixture)) return;

    const buf = fs.readFileSync(fixture);
    const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

    const matrix = readFirstSheetMatrixFromArrayBuffer(arrayBuf);
    expect(matrix.length).toBeLessThan(20);
    expect(firstSheetHasPopulatedCells(arrayBuf)).toBe(true);
  }, 20_000);
});
