'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { WorkspaceBlockingModalOverlay } from '@/app/components/WorkspaceBlockingModalOverlay';
import {
  deleteFixedHeaderEntry,
  patchFixedHeaderEntry,
  pruneFixedInputToCourierKeys,
} from '@/app/lib/fixed-header-values';
import {
  ORDER_CONVERT_KEYS,
  writeLocalStorageForUser,
} from '@/app/lib/scoped-local-storage';
import { applyFillOnly } from '@/app/pipeline/merge/apply-fill-only';
import type { TemplateBridgeFile } from '@/app/pipeline/template/types';
import type { PreviewRowWithId } from '@/app/order-convert/OrderConvertPreviewTableRow';
import {
  loadHubFixedHeaderValues,
  loadHubTemplateBridge,
} from '@/app/lib/order-integration/order-integration-hub-convert';

type Props = {
  open: boolean;
  userId: string | null;
  previewRows: PreviewRowWithId[];
  onClose: () => void;
  onSaved: (fixedValues: Record<string, string>, nextPreviewRows: PreviewRowWithId[]) => void;
};

function applyFixedFillOnlyToPreview(
  rows: PreviewRowWithId[],
  headers: string[],
  fixedValues: Record<string, string>,
): PreviewRowWithId[] {
  return rows.map((row) => {
    const nextData = { ...row.data };
    for (const header of headers) {
      const fixed = String(fixedValues[header] ?? '').trim();
      if (!fixed) continue;
      nextData[header] = applyFillOnly(String(nextData[header] ?? ''), fixed);
    }
    return { ...row, data: nextData };
  });
}

/** 쇼핑몰주문연동 허브 — 고정 입력 (택배변환과 동일 저장 키) */
export function OrderIntegrationFixedInputModal({
  open,
  userId,
  previewRows,
  onClose,
  onSaved,
}: Props) {
  const [bridge, setBridge] = useState<TemplateBridgeFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fixedHeaderValues, setFixedHeaderValues] = useState<Record<string, string>>({});
  const [editingHeader, setEditingHeader] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState('');

  const headerOrder = useMemo(() => bridge?.courierHeaders ?? [], [bridge]);

  useEffect(() => {
    if (!open) return;
    setEditingHeader(null);
    setDraftValue('');
    setLoadError(null);
    try {
      const loadedBridge = loadHubTemplateBridge(userId);
      setBridge(loadedBridge);
      const loadedFixed = pruneFixedInputToCourierKeys(
        loadHubFixedHeaderValues(userId),
        loadedBridge,
      );
      setFixedHeaderValues(loadedFixed);
    } catch (error) {
      setBridge(null);
      setFixedHeaderValues({});
      setLoadError(error instanceof Error ? error.message : '양식을 불러오지 못했습니다.');
    }
  }, [open, userId]);

  const persistAndClose = () => {
    if (!bridge) {
      onClose();
      return;
    }
    const pruned = pruneFixedInputToCourierKeys(fixedHeaderValues, bridge);
    writeLocalStorageForUser(ORDER_CONVERT_KEYS.fixedHeaders, userId, JSON.stringify(pruned));
    const nextPreview = applyFixedFillOnlyToPreview(previewRows, headerOrder, pruned);
    onSaved(pruned, nextPreview);
    onClose();
  };

  const confirmEdit = (headerName: string) => {
    setFixedHeaderValues((prev) => patchFixedHeaderEntry(prev, headerName, draftValue, bridge));
    setEditingHeader(null);
    setDraftValue('');
  };

  const deleteEntry = (headerName: string) => {
    setFixedHeaderValues((prev) => deleteFixedHeaderEntry(prev, headerName, bridge));
    setEditingHeader(null);
    setDraftValue('');
  };

  return (
    <WorkspaceBlockingModalOverlay open={open} aria-labelledby="hub-fixed-input-title">
      <div className="flex h-[88vh] w-full max-w-[1482px] flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-xl sm:h-[84vh] sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h2
            id="hub-fixed-input-title"
            className="text-xl font-semibold text-zinc-900 dark:text-zinc-100"
          >
            고정 입력 정보 설정
          </h2>
          <button
            type="button"
            onClick={persistAndClose}
            className="rounded-lg p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="닫기"
          >
            <X className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
          </button>
        </div>

        <div className="mb-4 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            모든 주문에 공통으로 쓸 보내는 사람, 운임 등을 설정합니다.
            <br />
            주문에 값이 있으면 그 값을 우선하고, 비어 있는 항목에만 고정 입력이 적용됩니다.
            <br />
            <span className="mt-1.5 block text-xs text-zinc-500">
              택배주문변환과 같은 저장값을 사용합니다.
            </span>
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          {loadError ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p>{loadError}</p>
              <Link
                href="/order-convert"
                className="mt-2 inline-block font-medium text-blue-700 underline"
              >
                택배주문변환에서 양식 등록하기
              </Link>
            </div>
          ) : (
            <div className="flex max-h-[480px] flex-wrap gap-4 overflow-y-auto">
              {headerOrder.map((headerName) => {
                const savedValue = fixedHeaderValues[headerName] || '';
                const hasValue = savedValue.trim() !== '';
                const isEditing = editingHeader === headerName;

                if (isEditing) {
                  return (
                    <div
                      key={headerName}
                      className="flex items-center gap-2 rounded-lg border-2 border-zinc-300 bg-white px-4 py-2 dark:border-zinc-700 dark:bg-zinc-800"
                    >
                      <input
                        type="text"
                        value={draftValue}
                        onChange={(e) => setDraftValue(e.target.value)}
                        className="min-w-[140px] flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                        placeholder={headerName}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') confirmEdit(headerName);
                          if (e.key === 'Escape') {
                            setEditingHeader(null);
                            setDraftValue('');
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => confirmEdit(headerName)}
                        className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
                      >
                        확인
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingHeader(null);
                          setDraftValue('');
                        }}
                        className="rounded bg-zinc-200 px-3 py-1 text-sm font-medium text-zinc-900 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-100"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteEntry(headerName)}
                        className="rounded bg-zinc-200 px-3 py-1 text-sm font-medium text-zinc-900 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-100"
                      >
                        삭제
                      </button>
                    </div>
                  );
                }

                return (
                  <button
                    key={headerName}
                    type="button"
                    onClick={() => {
                      setEditingHeader(headerName);
                      setDraftValue(savedValue);
                    }}
                    className={`relative flex cursor-pointer flex-col items-center rounded-lg px-5 py-2 font-medium transition-colors ${
                      hasValue
                        ? 'border border-zinc-300 bg-blue-50 text-zinc-900 hover:bg-blue-100 dark:border-zinc-700 dark:bg-blue-950/30 dark:text-zinc-100'
                        : 'border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100'
                    }`}
                  >
                    {hasValue ? (
                      <div className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-blue-500 shadow-sm dark:border-zinc-900">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    ) : null}
                    {hasValue ? (
                      <>
                        <span className="max-w-[200px] truncate text-base">{savedValue}</span>
                        <span className="mt-0.5 text-xs text-zinc-500">{headerName}</span>
                      </>
                    ) : (
                      <span className="text-sm">{headerName}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 flex shrink-0 justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={persistAndClose}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            저장하고 닫기
          </button>
        </div>
      </div>
    </WorkspaceBlockingModalOverlay>
  );
}
