import * as XLSX from 'xlsx';
import {
  isTrackingNumberUploadHeader,
  sanitizeTrackingNumberForUpload,
} from '@/app/lib/sanitize-tracking-number-for-upload';

export type PreviewDownloadRow = {
  rowId: string;
  data: Record<string, string>;
};

/**
 * 미리보기(sortedRows + userOverrides)와 동일한 2차원 배열 — preview=download 1:1
 */
export function buildPreviewDownloadAoA(
  courierHeaders: readonly string[],
  sortedRows: readonly PreviewDownloadRow[],
  userOverrides: Record<string, Record<string, string>>,
): string[][] {
  const excelRows = sortedRows.map((rowWithId) =>
    courierHeaders.map((header) => {
      const raw =
        userOverrides[rowWithId.rowId]?.[header] ?? rowWithId.data[header] ?? '';
      return isTrackingNumberUploadHeader(header)
        ? sanitizeTrackingNumberForUpload(raw)
        : raw;
    }),
  );
  return [[...courierHeaders], ...excelRows];
}

export function buildPreviewDownloadFileName(
  now: Date = new Date(),
  titlePrefix = '엑클로드주문정리',
): string {
  const yy = String(now.getFullYear()).slice(-2);
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const hour = now.getHours();
  const minute = String(now.getMinutes()).padStart(2, '0');
  return `${titlePrefix} ${yy}년${month}월${day}일${hour}시${minute}분.xlsx`;
}

/** workbook/sheet 생성 가능 여부 확인 (실패 시 throw) */
export function createPreviewDownloadWorkbook(excelData: string[][]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(excelData);
  if (!ws || !wb) {
    throw new Error('엑셀 파일을 생성할 수 없습니다.');
  }
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return wb;
}
