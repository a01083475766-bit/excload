/**
 * 고정입력 변경 후 미리보기 갱신 (Fill Only: 주문값 유지, 고정값만 반영)
 */

import type { TemplateBridgeFile } from '@/app/pipeline/template/types';
import { buildPreviewRowFromStandardRow } from '@/app/pipeline/merge/build-preview-row';
import type { FixedInput } from '@/app/pipeline/merge/types';
import {
  enrichFixedInputByTemplate,
  mergeDeliveryMessageValue,
  resolveFixedValueForColumn,
} from '@/app/pipeline/merge/resolve-fixed-input';
import { applyFillOnly } from '@/app/pipeline/merge/apply-fill-only';

export type PreviewRowWithData = {
  rowId: string;
  data: Record<string, string>;
};

export type ReapplyFixedInputToPreviewParams = {
  previewRows: readonly PreviewRowWithData[];
  orderSnapshotsByRowId: Record<string, Record<string, string>>;
  template: TemplateBridgeFile;
  fixedInput: FixedInput;
  /** 스냅샷 없는 행(세션 복원 등)용 — 모달 열 때 고정입력 */
  previousFixedInput?: FixedInput;
  userOverrides?: Record<string, Record<string, string>>;
};

function previewValueFromEmptyOrder(
  baseHeader: string | null,
  fixedValue: string,
): string {
  if (baseHeader === '배송메시지') {
    return mergeDeliveryMessageValue('', fixedValue);
  }
  return applyFillOnly('', fixedValue);
}

function cellLikelyFromPreviousFixed(
  current: string,
  baseHeader: string | null,
  oldFixed: string,
): boolean {
  const trimmedCurrent = current.trim();
  const trimmedOld = oldFixed.trim();
  if (!trimmedOld) {
    return !trimmedCurrent;
  }
  if (trimmedCurrent === trimmedOld) return true;
  const fromEmpty = previewValueFromEmptyOrder(baseHeader, oldFixed);
  return trimmedCurrent === fromEmpty;
}

function reapplyRowWithoutSnapshot(
  data: Record<string, string>,
  template: TemplateBridgeFile,
  enrichedNew: FixedInput,
  enrichedOld: FixedInput,
  userOverrideRow?: Record<string, string>,
): Record<string, string> {
  const next = { ...data };
  const { courierHeaders, mappedBaseHeaders } = template;

  for (let i = 0; i < courierHeaders.length; i++) {
    const courierHeader = courierHeaders[i]!;
    const baseHeader = mappedBaseHeaders[i] ?? null;

    if (userOverrideRow && courierHeader in userOverrideRow) {
      continue;
    }

    const oldFixed = resolveFixedValueForColumn(enrichedOld, courierHeader, baseHeader);
    const newFixed = resolveFixedValueForColumn(enrichedNew, courierHeader, baseHeader);
    if (!oldFixed && !newFixed) continue;

    const current = String(next[courierHeader] ?? '');
    if (!cellLikelyFromPreviousFixed(current, baseHeader, oldFixed)) {
      continue;
    }

    if (baseHeader === '배송메시지') {
      next[courierHeader] = mergeDeliveryMessageValue('', newFixed);
    } else {
      next[courierHeader] = applyFillOnly('', newFixed);
    }
  }

  return next;
}

/**
 * 고정입력 변경을 미리보기에 반영합니다.
 * - Stage2 스냅샷이 있으면 Fill Only로 정확히 재병합
 * - 없으면 이전 고정값과 일치하는 셀만 갱신 (세션 복원 등)
 * - userOverrides가 있는 셀은 유지
 */
export function reapplyFixedInputToPreviewRows(
  params: ReapplyFixedInputToPreviewParams,
): PreviewRowWithData[] {
  const {
    previewRows,
    orderSnapshotsByRowId,
    template,
    fixedInput,
    previousFixedInput = {},
    userOverrides = {},
  } = params;

  if (previewRows.length === 0) return [];

  const enrichedNew = enrichFixedInputByTemplate(fixedInput, template);
  const enrichedOld = enrichFixedInputByTemplate(previousFixedInput, template);

  return previewRows.map((row) => {
    const snapshot = orderSnapshotsByRowId[row.rowId];
    const overrideRow = userOverrides[row.rowId];

    let data: Record<string, string>;
    if (snapshot) {
      data = buildPreviewRowFromStandardRow(
        snapshot,
        template,
        fixedInput,
        enrichedNew,
      );
      if (overrideRow) {
        data = { ...data, ...overrideRow };
      }
    } else {
      data = reapplyRowWithoutSnapshot(
        row.data,
        template,
        enrichedNew,
        enrichedOld,
        overrideRow,
      );
      if (overrideRow) {
        data = { ...data, ...overrideRow };
      }
    }

    return { rowId: row.rowId, data };
  });
}
