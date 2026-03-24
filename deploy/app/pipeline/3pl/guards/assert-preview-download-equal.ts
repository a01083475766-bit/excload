/**
 * preview rows를 그대로 직렬화해야 하므로 동일성 검증을 강제한다.
 */
export function assertPreviewDownloadEqual(
  previewRows: ReadonlyArray<Record<string, string>>,
  downloadRows: ReadonlyArray<Record<string, string>>
): void {
  if (previewRows.length !== downloadRows.length) {
    throw new Error("Preview/Download mismatch: row length is different.");
  }

  for (let rowIndex = 0; rowIndex < previewRows.length; rowIndex += 1) {
    const preview = previewRows[rowIndex];
    const download = downloadRows[rowIndex];

    const keys = new Set([...Object.keys(preview), ...Object.keys(download)]);
    for (const key of keys) {
      if (preview[key] !== download[key]) {
        throw new Error(
          `Preview/Download mismatch at row=${rowIndex}, key=${key}.`
        );
      }
    }
  }
}
