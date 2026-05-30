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

function collectTableHeaders(rows: TextConvertReviewRow[]): string[] {
  const seen = new Set<string>();
  const headers: string[] = [];
  for (const row of rows) {
    for (const field of row.fields) {
      if (seen.has(field.header)) continue;
      seen.add(field.header);
      headers.push(field.header);
    }
  }
  return headers;
}

function getFieldValue(row: TextConvertReviewRow, header: string): string {
  return row.fields.find((field) => field.header === header)?.value ?? '';
}

function rowHasField(row: TextConvertReviewRow, header: string): boolean {
  return row.fields.some((field) => field.header === header);
}

interface TextConvertResultReviewModalProps {
  isOpen: boolean;
  originalText: string;
  rows: TextConvertReviewRow[];
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
  const tableHeaders = collectTableHeaders(rows);

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
      prev.map((row) => {
        if (row.rowId !== rowId) return row;
        const hasField = row.fields.some((field) => field.header === header);
        if (hasField) {
          return {
            ...row,
            fields: row.fields.map((field) =>
              field.header === header ? { ...field, value } : field,
            ),
          };
        }
        return { ...row, fields: [...row.fields, { header, value }] };
      }),
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
        className="bg-white rounded-lg shadow-lg w-full max-w-[920px] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-4 flex-shrink-0">
          <h3 id="text-convert-review-title" className="text-lg font-semibold text-gray-900 mb-1">
            변환 결과 확인
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            총 {totalOrders}건이 미리보기에 추가되었습니다.
            <br />
            아래 표는 붙여넣은 내용에서 추출·정리된 항목입니다. 미리보기에는 업로드 양식 전체가
            그대로 반영됩니다.
          </p>
        </div>

        <div className="px-6 pb-4 flex-1 min-h-0 overflow-hidden flex flex-col gap-4">
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
            {tableHeaders.length === 0 ? (
              <div className="rounded-lg border border-gray-200 px-3 py-4 text-sm text-gray-500">
                추출된 항목이 없습니다.
              </div>
            ) : (
              <div className="max-h-[320px] overflow-auto rounded-lg border border-gray-300 preview-scrollbar">
                <table className="min-w-max w-full text-sm border-collapse">
                  <thead className="sticky top-0 z-10 bg-gray-100">
                    <tr>
                      <th className="sticky left-0 z-20 min-w-[44px] border border-gray-300 bg-gray-100 px-2 py-2 text-center text-xs font-semibold text-gray-700 whitespace-nowrap shadow-[1px_0_0_0_rgba(209,213,219,1)]">
                        No.
                      </th>
                      {tableHeaders.map((header) => (
                        <th
                          key={header}
                          className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold text-gray-700 whitespace-nowrap"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row, orderIndex) => (
                      <tr key={row.rowId} className="bg-white hover:bg-gray-50/80">
                        <td className="sticky left-0 z-[1] border border-gray-300 bg-white px-2 py-1.5 text-center text-xs text-gray-600 whitespace-nowrap shadow-[1px_0_0_0_rgba(209,213,219,1)]">
                          {orderIndex + 1}
                        </td>
                        {tableHeaders.map((header) => {
                          const value = getFieldValue(row, header);
                          const editable = isEditing && rowHasField(row, header);

                          return (
                            <td
                              key={`${row.rowId}-${header}`}
                              className="border border-gray-300 px-2 py-1.5 whitespace-nowrap text-gray-900"
                              title={!editable && value ? value : undefined}
                            >
                              {editable ? (
                                <input
                                  type="text"
                                  value={value}
                                  onChange={(e) =>
                                    handleFieldChange(row.rowId, header, e.target.value)
                                  }
                                  className="min-w-[120px] w-full rounded border border-gray-300 px-1.5 py-1 text-sm whitespace-nowrap focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              ) : value ? (
                                value
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
                onClick={handleStartEdit}
                className="flex-1 h-10 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                수정하기
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="flex-1 h-10 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700"
              >
                확인
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
