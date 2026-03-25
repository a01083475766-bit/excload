import type { MergedTemplateRow } from "@/app/pipeline/3pl/contracts/merge.contract";
import { assertPreviewDownloadEqual } from "@/app/pipeline/3pl/guards/assert-preview-download-equal";

export interface OutputRow {
  [templateHeader: string]: string;
}

/**
 * Stage4 단일 소스 rows 생성 함수
 * preview와 download는 이 rows를 공통으로 사용한다.
 */
export function buildRows(mergedRows: MergedTemplateRow[]): OutputRow[] {
  return mergedRows.map((row) => {
    const output: OutputRow = {};
    for (const [key, value] of Object.entries(row)) {
      output[key] = value ?? "";
    }
    return output;
  });
}

/**
 * 다운로드는 rows를 그대로 직렬화 대상으로 사용한다.
 */
export function toDownloadRows(rows: OutputRow[]): OutputRow[] {
  assertPreviewDownloadEqual(rows, rows);
  return rows;
}
