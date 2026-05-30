'use client';

import { useEffect, useState } from 'react';

export type TextConvertReviewField = {
  header: string;
  value: string;
};

export type TextConvertReviewRow = {
  rowId: string;
  fields: TextConvertReviewField[];
};

export function buildTextConvertReviewRows(
  rowIds: string[],
  previewRows: Record<string, string>[],
  courierHeaders: string[],
  mappedBaseHeaders: (string | null)[] | undefined,
): TextConvertReviewRow[] {
  return rowIds.map((rowId, index) => {
    const rowData = previewRows[index] ?? {};
    const fields: TextConvertReviewField[] = [];

    for (let i = 0; i < courierHeaders.length; i++) {
      const courierHeader = courierHeaders[i];
      if (mappedBaseHeaders && mappedBaseHeaders[i] == null) continue;
      const value = String(rowData[courierHeader] ?? '').trim();
      if (!value) continue;
      fields.push({ header: courierHeader, value });
    }

    return { rowId, fields };
  });
}

interface TextConvertResultReviewModalProps {
  isOpen: boolean;
  originalText: string;
  rows: TextConvertReviewRow[];
  showFallbackNotice: boolean;
  onConfirm: () => void;
  onApply: (overrides: Record<string, Record<string, string>>) => void;
}

/**
 * 텍스트 주문 변환 직후: 붙여넣은 원문 + 건별 정리표를 확인·수정합니다.
 */
export function TextConvertResultReviewModal({
  isOpen,
  originalText,
  rows,
  showFallbackNotice,
  onConfirm,
  onApply,
}: TextConvertResultReviewModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<TextConvertReviewRow[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false);
      setEditDraft([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const displayRows = isEditing ? editDraft : rows;
  const totalOrders = rows.length;

  const handleStartEdit = () => {
    setEditDraft(structuredClone(rows));
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditDraft([]);
  };

  const handleFieldChange = (rowId: string, header: string, value: string) => {
    setEditDraft((prev) =>
      prev.map((row) =>
        row.rowId === rowId
          ? {
              ...row,
              fields: row.fields.map((field) =>
                field.header === header ? { ...field, value } : field,
              ),
            }
          : row,
      ),
    );
  };

  const handleApplyToPreview = () => {
    const overrides: Record<string, Record<string, string>> = {};

    for (const draftRow of editDraft) {
      const originalRow = rows.find((row) => row.rowId === draftRow.rowId);
      if (!originalRow) continue;

      for (const draftField of draftRow.fields) {
        const originalField = originalRow.fields.find((field) => field.header === draftField.header);
        const originalValue = originalField?.value ?? '';
        if (draftField.value !== originalValue) {
          overrides[draftRow.rowId] ??= {};
          overrides[draftRow.rowId][draftField.header] = draftField.value;
        }
      }
    }

    onApply(overrides);
    setIsEditing(false);
    setEditDraft([]);
    onConfirm();
  };

  return (
    <div
      className="fixed inset-0 bg-black/35 flex items-center justify-center z-[10000] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="text-convert-review-title"
    >
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-[640px] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-4 flex-shrink-0">
          <h3 id="text-convert-review-title" className="text-lg font-semibold text-gray-900 mb-1">
            변환 결과 확인
          </h3>
          <p className="text-sm text-gray-600">
            총 {totalOrders}건이 미리보기에 추가되었습니다. 내용을 확인해 주세요.
          </p>
        </div>

        <div className="px-6 pb-4 flex-1 min-h-0 overflow-hidden flex flex-col gap-4">
          {showFallbackNotice && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 leading-relaxed flex-shrink-0">
              <p className="font-medium mb-1">변환 결과를 확인해 주세요</p>
              <p>
                주문 정보가 여러 형식으로 섞여 있어, 일부 항목은 자동으로 정리되었을 수
                있습니다.
              </p>
              <p className="mt-2">
                <strong>미리보기에서 이름·전화·주소·상품</strong>이 맞는지 꼭 확인한 뒤
                다운로드해 주세요.
              </p>
              <p className="mt-2 text-amber-900/80">
                빠진 항목이 있으면 아래에서 수정하거나, 미리보기에서 직접 고친 뒤 다시
                변환해 보세요.
              </p>
            </div>
          )}

          <div className="flex-shrink-0">
            <p className="text-xs font-medium text-gray-500 mb-1.5">붙여넣은 원문</p>
            <div className="max-h-[140px] overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
              {originalText.trim() || '(원문 없음)'}
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            <p className="text-xs font-medium text-gray-500 mb-1.5 flex-shrink-0">
              정리된 주문 ({totalOrders}건)
            </p>
            <div className="max-h-[400px] overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
              {displayRows.map((row, orderIndex) => (
                <div key={row.rowId} className="px-3 py-3 bg-white">
                  <p className="text-xs font-semibold text-gray-700 mb-2">주문 {orderIndex + 1}</p>
                  {row.fields.length === 0 ? (
                    <p className="text-sm text-gray-500">추출된 항목이 없습니다.</p>
                  ) : (
                    <table className="w-full text-sm border-collapse">
                      <tbody>
                        {row.fields.map((field) => (
                          <tr key={`${row.rowId}-${field.header}`} className="border-b border-gray-100 last:border-0">
                            <th className="align-top text-left font-medium text-gray-600 py-1.5 pr-3 w-[38%] break-words">
                              {field.header}
                            </th>
                            <td className="align-top py-1.5 break-words">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={field.value}
                                  onChange={(e) =>
                                    handleFieldChange(row.rowId, field.header, e.target.value)
                                  }
                                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              ) : (
                                <span className="text-gray-900">{field.value}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 pt-4 border-t border-gray-100 flex-shrink-0">
          {isEditing ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="flex-1 h-10 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleApplyToPreview}
                className="flex-1 h-10 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700"
              >
                미리보기에 적용
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onConfirm}
                className="flex-1 h-10 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                확인
              </button>
              <button
                type="button"
                onClick={handleStartEdit}
                className="flex-1 h-10 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700"
              >
                수정하기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
