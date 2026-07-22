'use client';

import { memo } from 'react';
import type { PreviewRow } from '@/app/pipeline/merge/types';
import { formatPhoneDisplay } from '@/app/utils/format-phone';

export type PreviewRowWithId = {
  rowId: string;
  data: PreviewRow;
  /**
   * 미리보기 재담기 중복 판별용 내부 키(화면·다운로드 미노출).
   * 표준 주문행의 몰+주문번호+상품주문번호 등에서 생성.
   */
  sourceDedupeKey?: string;
  /**
   * 표준 주문번호(주문번호). WorkItem.mallOrderNo용.
   * 미리보기 data는 택배 양식 헤더 키라 「주문번호」열이 없을 수 있어 별도 보존.
   * 화면·다운로드 파일에는 넣지 않음.
   */
  sourceMallOrderNo?: string;
  /**
   * 택배양식 다운로드 WorkItem 출처.
   * API 행은 orderSyncSource와 함께 두고, 엑셀/텍스트 변환 시 각각 지정.
   */
  courierDownloadInputSource?: 'API' | 'EXCEL' | 'TEXT';
  /**
   * 주문조회→허브 경로: 택배양식 다운로드 시 OrderSync 스냅샷 저장용.
   * 엑셀·텍스트·예시 미리보기 행에는 실계정 accountId가 없다.
   */
  orderSyncSource?: {
    mallId: string;
    /** 실연동 계정 ID. 예시 미리보기는 빈 문자열 */
    accountId: string;
    standardRow: Record<string, string>;
    /** 스마트스토어 등. 표준행·다운로드에 넣지 않는 정규화 remainQuantity */
    remainQuantity?: number | null;
    /** true면 예시 미리보기 — Bundle/매칭 저장 대상 아님 */
    isExamplePreview?: boolean;
  };
};

export type OrderConvertPreviewTableRowProps = {
  row: PreviewRowWithId;
  courierHeaders: string[];
  overridesForRow: Record<string, string> | undefined;
  isSelected: boolean;
  isNewRow: boolean;
  localEditingHeader: string | null;
  localEditingValue: string;
  localActiveHeader: string | null;
  onToggleSelect: (rowId: string, checked: boolean) => void;
  onCellClickStartEdit: (rowId: string, header: string, displayValue: string) => void;
  onEditingInputChange: (value: string) => void;
  onCommitEdit: (rowId: string, header: string, value: string) => void;
  onFinishEditUi: () => void;
  /** false면 체크·셀 수정 비활성 (묶음 후보 검수 모달 등) */
  interactionEnabled?: boolean;
  /** 삭제 예정 표시 (행 유지, 취소선) */
  markedForDeletion?: boolean;
};

function OrderConvertPreviewTableRowInner({
  row,
  courierHeaders,
  overridesForRow,
  isSelected,
  isNewRow,
  localEditingHeader,
  localEditingValue,
  localActiveHeader,
  onToggleSelect,
  onCellClickStartEdit,
  onEditingInputChange,
  onCommitEdit,
  onFinishEditUi,
  interactionEnabled = true,
  markedForDeletion = false,
}: OrderConvertPreviewTableRowProps) {
  const rowTone = markedForDeletion
    ? 'bg-rose-50/80'
    : isSelected
      ? 'bg-blue-100'
      : isNewRow
        ? 'bg-green-100 animate-pulse'
        : interactionEnabled
          ? 'hover:bg-gray-50'
          : '';

  const stickyBg = markedForDeletion
    ? 'bg-rose-50/80'
    : isSelected
      ? 'bg-blue-100'
      : isNewRow
        ? 'bg-green-100'
        : 'bg-white';

  const cellText = markedForDeletion ? 'line-through text-gray-500 decoration-red-400' : '';

  return (
    <tr className={`transition-colors ${rowTone}`}>
      <td
        className={`sticky left-0 z-10 border border-gray-300 px-2 py-1 border-b whitespace-nowrap shadow-[1px_0_0_0_rgba(209,213,219,1)] ${stickyBg}`}
      >
        {markedForDeletion ? (
          <span className="inline-block text-[11px] font-semibold leading-tight text-red-600">
            삭제 예정
          </span>
        ) : (
          <input
            type="checkbox"
            checked={isSelected}
            disabled={!interactionEnabled}
            onChange={(e) => onToggleSelect(row.rowId, e.target.checked)}
          />
        )}
      </td>
      {courierHeaders.map((header) => {
        const cellValue = row.data[header] ?? '';
        const overrideValue = overridesForRow?.[header];
        const displayValue = overrideValue ?? cellValue;
        const isPhoneField = header.includes('전화') || header.includes('phone');

        if (localEditingHeader === header) {
          return (
            <td
              key={header}
              className={`border border-gray-300 px-2 py-1 border-b whitespace-nowrap bg-yellow-100 ${cellText}`}
            >
              <input
                autoFocus
                className="w-full h-full border-0 p-0 bg-transparent outline-none text-sm select-text"
                style={{ minHeight: '1.25rem' }}
                value={localEditingValue}
                onChange={(e) => onEditingInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onCommitEdit(row.rowId, header, localEditingValue);
                    onFinishEditUi();
                  } else if (e.key === 'Escape') {
                    onFinishEditUi();
                  }
                }}
                onBlur={() => {
                  onCommitEdit(row.rowId, header, localEditingValue);
                  onFinishEditUi();
                }}
              />
            </td>
          );
        }

        const isActiveCell = localActiveHeader === header;

        return (
          <td
            key={header}
            className={`border border-gray-300 px-2 py-1 border-b whitespace-nowrap ${cellText} ${
              interactionEnabled && !markedForDeletion ? 'cursor-pointer' : ''
            } ${isActiveCell ? 'bg-yellow-100' : ''}`}
            onClick={() => {
              if (interactionEnabled && !markedForDeletion) {
                onCellClickStartEdit(row.rowId, header, displayValue);
              }
            }}
          >
            {isPhoneField ? formatPhoneDisplay(displayValue) : displayValue}
          </td>
        );
      })}
    </tr>
  );
}

export const OrderConvertPreviewTableRow = memo(OrderConvertPreviewTableRowInner, (prev, next) => {
  if (prev.row !== next.row) return false;
  if (prev.overridesForRow !== next.overridesForRow) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.isNewRow !== next.isNewRow) return false;
  if (prev.courierHeaders !== next.courierHeaders) return false;
  if (prev.localEditingHeader !== next.localEditingHeader) return false;
  if (prev.localActiveHeader !== next.localActiveHeader) return false;
  if (prev.localEditingHeader && prev.localEditingValue !== next.localEditingValue) return false;
  if (prev.onToggleSelect !== next.onToggleSelect) return false;
  if (prev.onCellClickStartEdit !== next.onCellClickStartEdit) return false;
  if (prev.onEditingInputChange !== next.onEditingInputChange) return false;
  if (prev.onCommitEdit !== next.onCommitEdit) return false;
  if (prev.onFinishEditUi !== next.onFinishEditUi) return false;
  if (prev.interactionEnabled !== next.interactionEnabled) return false;
  if (prev.markedForDeletion !== next.markedForDeletion) return false;
  return true;
});
