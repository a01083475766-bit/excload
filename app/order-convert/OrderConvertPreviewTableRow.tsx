'use client';

import { memo } from 'react';
import type { PreviewRow } from '@/app/pipeline/merge/types';
import { formatPhoneDisplay } from '@/app/utils/format-phone';

export type PreviewRowWithId = {
  rowId: string;
  data: PreviewRow;
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
}: OrderConvertPreviewTableRowProps) {
  return (
    <tr
      className={`transition-colors
        ${isSelected ? 'bg-blue-100' : isNewRow ? 'bg-green-100 animate-pulse' : 'hover:bg-gray-50'}
      `}
    >
      <td
        className={`sticky left-0 z-10 border border-gray-300 px-2 py-1 border-b whitespace-nowrap shadow-[1px_0_0_0_rgba(209,213,219,1)] ${
          isSelected ? 'bg-blue-100' : isNewRow ? 'bg-green-100' : 'bg-white'
        }`}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onToggleSelect(row.rowId, e.target.checked)}
        />
      </td>
      {courierHeaders.map((header) => {
        const cellValue = row.data[header] ?? '';
        const overrideValue = overridesForRow?.[header];
        const displayValue = overrideValue ?? cellValue;
        const isPhoneField = header.includes('전화') || header.includes('phone');

        if (localEditingHeader === header) {
          return (
            <td key={header} className="border border-gray-300 px-2 py-1 border-b whitespace-nowrap bg-yellow-100">
              <input
                autoFocus
                className="w-full h-full border-0 p-0 bg-transparent outline-none text-sm"
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
            className={`border border-gray-300 px-2 py-1 border-b whitespace-nowrap cursor-pointer ${
              isActiveCell ? 'bg-yellow-100' : ''
            }`}
            onClick={() => onCellClickStartEdit(row.rowId, header, displayValue)}
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
  return true;
});
