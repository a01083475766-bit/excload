import { ExcelPreprocessPipeline } from '@/app/pipeline/preprocess/excel-preprocess-pipeline';
import type { CleanInputFile } from '@/app/pipeline/preprocess/types';
import {
  alignRowsFromHeader,
  detectHeaderRowIndex,
  filterNonEmptyRows,
  readFirstSheetMatrixFromArrayBuffer,
} from '@/app/lib/excel/sheet-header';

export async function parseOrderFileHeadersFromArrayBuffer(
  buffer: ArrayBuffer,
): Promise<CleanInputFile> {
  const rawData = readFirstSheetMatrixFromArrayBuffer(buffer);
  const filteredRows = filterNonEmptyRows(rawData);
  const headerIndex = detectHeaderRowIndex(filteredRows);
  const alignedRawData = alignRowsFromHeader(filteredRows, headerIndex);
  const preprocessPipeline = new ExcelPreprocessPipeline();
  return preprocessPipeline.run(alignedRawData);
}
