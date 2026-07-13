/**
 * 주문연동 허브 전용 — 비어 있는 표준 필드 `판매처`에 입력 출처를 채웁니다.
 * (API 조회는 몰 매퍼가 이미 쿠팡/스마트스토어 등을 넣음)
 */

import type { PreviewRow } from '@/app/pipeline/merge/types';
import type { StandardOrderRow } from '@/app/pipeline/order/order-pipeline';

export const HUB_SALES_CHANNEL_HEADER = '판매처' as const;
export const HUB_SALES_CHANNEL_TEXT = '텍스트주문';
export const HUB_SALES_CHANNEL_IMAGE = '이미지주문';
export const HUB_SALES_CHANNEL_EXCEL_FALLBACK = '엑셀주문';

const MAX_FILE_LABEL_LEN = 40;

/** 업로드 파일명 → 판매처 후보 (확장자 제거, 길이 제한) */
export function salesChannelLabelFromFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) return HUB_SALES_CHANNEL_EXCEL_FALLBACK;

  const withoutExt = trimmed.replace(/\.[^./\\]+$/i, '').trim();
  const normalized = withoutExt.replace(/\s+/g, ' ').trim();
  if (!normalized) return HUB_SALES_CHANNEL_EXCEL_FALLBACK;

  if (normalized.length <= MAX_FILE_LABEL_LEN) return normalized;
  return normalized.slice(0, MAX_FILE_LABEL_LEN);
}

/** 행의 판매처가 비어 있을 때만 fallback을 채웁니다. */
export function fillEmptySalesChannelRows(
  rows: StandardOrderRow[],
  fallback: string,
): StandardOrderRow[] {
  const value = fallback.trim();
  if (!value || rows.length === 0) return rows;

  return rows.map((row) => {
    const current = String(row[HUB_SALES_CHANNEL_HEADER] ?? '').trim();
    if (current) return row;
    return { ...row, [HUB_SALES_CHANNEL_HEADER]: value };
  });
}

/**
 * 택배 양식에 판매처 매핑이 없어도 허브 미리보기에는 열이 보이도록 앞에 붙입니다.
 * (다운로드에도 포함 — 주문연동 정리용)
 */
export function ensureHubSalesChannelPreviewColumn(input: {
  previewRows: PreviewRow[];
  courierHeaders: string[];
  mappedBaseHeaders: Array<string | null>;
  standardRows: StandardOrderRow[];
}): { previewRows: PreviewRow[]; courierHeaders: string[] } {
  const { previewRows, courierHeaders, mappedBaseHeaders, standardRows } = input;
  const alreadyVisible =
    courierHeaders.includes(HUB_SALES_CHANNEL_HEADER) ||
    mappedBaseHeaders.some((header) => header === HUB_SALES_CHANNEL_HEADER);

  if (alreadyVisible || previewRows.length === 0) {
    return { previewRows, courierHeaders };
  }

  return {
    courierHeaders: [HUB_SALES_CHANNEL_HEADER, ...courierHeaders],
    previewRows: previewRows.map((row, index) => ({
      [HUB_SALES_CHANNEL_HEADER]: String(
        standardRows[index]?.[HUB_SALES_CHANNEL_HEADER] ?? '',
      ).trim(),
      ...row,
    })),
  };
}
