/**
 * Stage3 단일 행 PreviewRow 생성 (runMergePipeline / 고정입력 재적용 공용)
 */

import type { TemplateBridgeFile } from '../template/types';
import type { FixedInput, PreviewRow } from './types';
import { applyFillOnly } from './apply-fill-only';
import {
  isTrackingNumberUploadHeader,
  sanitizeTrackingNumberForUpload,
} from '@/app/lib/sanitize-tracking-number-for-upload';
import {
  enrichFixedInputByTemplate,
  mergeDeliveryMessageValue,
  resolveFixedValueForColumn,
} from './resolve-fixed-input';

export type StandardOrderRow = Record<string, string>;

function firstNonEmptyStandardValue(
  standardRow: StandardOrderRow,
  headers: readonly string[],
): string {
  for (const header of headers) {
    const value = String(standardRow[header] ?? '').trim();
    if (value) return value;
  }
  return '';
}

function resolveOrderValue(
  standardRow: StandardOrderRow,
  baseHeader: string | null | undefined,
): string {
  if (!baseHeader) return '';

  if (baseHeader === '상품주문번호') {
    return firstNonEmptyStandardValue(standardRow, ['상품주문번호', '주문번호']);
  }

  if (baseHeader === '주문번호') {
    return firstNonEmptyStandardValue(standardRow, ['주문번호', '상품주문번호']);
  }

  return String(standardRow[baseHeader] ?? '').trim();
}

/**
 * Stage2 표준 행 + 템플릿 + 고정입력 → PreviewRow (택배사 헤더 기준)
 */
export function buildPreviewRowFromStandardRow(
  standardRow: StandardOrderRow,
  template: TemplateBridgeFile,
  fixedInput: FixedInput,
  enrichedFixedInput?: FixedInput,
): PreviewRow {
  const enriched = enrichedFixedInput ?? enrichFixedInputByTemplate(fixedInput, template);
  const { courierHeaders, mappedBaseHeaders } = template;
  const previewRow: PreviewRow = {};

  for (let i = 0; i < courierHeaders.length; i++) {
    const courierHeader = courierHeaders[i]!;
    const baseHeader = mappedBaseHeaders[i];
    const orderValue = resolveOrderValue(standardRow, baseHeader);

    const fixedValue = resolveFixedValueForColumn(
      enriched,
      courierHeader,
      baseHeader,
    );

    if (baseHeader === '배송메시지') {
      previewRow[courierHeader] = mergeDeliveryMessageValue(orderValue, fixedValue);
    } else {
      let cellValue = applyFillOnly(orderValue, fixedValue);
      if (
        baseHeader === '운송장번호' ||
        isTrackingNumberUploadHeader(courierHeader)
      ) {
        cellValue = sanitizeTrackingNumberForUpload(cellValue);
      }
      previewRow[courierHeader] = cellValue;
    }
  }

  return previewRow;
}
