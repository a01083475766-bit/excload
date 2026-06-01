/**
 * Stage3 단일 행 PreviewRow 생성 (runMergePipeline / 고정입력 재적용 공용)
 */

import type { TemplateBridgeFile } from '../template/types';
import type { FixedInput, PreviewRow } from './types';
import { applyFillOnly } from './apply-fill-only';
import {
  enrichFixedInputByTemplate,
  mergeDeliveryMessageValue,
  resolveFixedValueForColumn,
} from './resolve-fixed-input';

export type StandardOrderRow = Record<string, string>;

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

    let orderValue = '';
    if (baseHeader && baseHeader in standardRow) {
      orderValue = String(standardRow[baseHeader] ?? '').trim();
    }

    const fixedValue = resolveFixedValueForColumn(
      enriched,
      courierHeader,
      baseHeader,
    );

    if (baseHeader === '배송메시지') {
      previewRow[courierHeader] = mergeDeliveryMessageValue(orderValue, fixedValue);
    } else {
      previewRow[courierHeader] = applyFillOnly(orderValue, fixedValue);
    }
  }

  return previewRow;
}
