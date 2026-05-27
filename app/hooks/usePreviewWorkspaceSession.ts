'use client';

import { useEffect, useRef } from 'react';
import type { InputSourceCounts } from '@/app/lib/history-input-sources';
import {
  type PreviewWorkspacePageKey,
  type PreviewWorkspaceSnapshot,
  type WorkspaceFileMetaSnapshot,
  type WorkspaceInputSnapshot,
  clearPreviewWorkspace,
  loadPreviewWorkspace,
  savePreviewWorkspace,
} from '@/app/lib/preview-workspace-session';

type SortConfig = { header: string; direction: 'asc' | 'desc' } | null;

type PreviewRowLike = { rowId: string; data: Record<string, string> };

type Options = {
  pageKey: PreviewWorkspacePageKey;
  enabled: boolean;
  storageUserId: string | null;
  previewRows: PreviewRowLike[];
  userOverrides: Record<string, Record<string, string>>;
  courierHeaders: string[];
  sortConfig: SortConfig;
  setPreviewRows: (rows: PreviewRowLike[]) => void;
  setUserOverrides: (v: Record<string, Record<string, string>>) => void;
  setCourierHeaders: (headers: string[]) => void;
  setSortConfig: (config: SortConfig) => void;
  onSessionRestored?: (snap: PreviewWorkspaceSnapshot) => void;
  selectedFileName?: string | null;
  uploadedFileMeta?: WorkspaceFileMetaSnapshot[];
  textInput?: string;
  inputSourceType?: 'excel' | 'image' | 'text' | null;
  sessionInputCounts?: InputSourceCounts;
  courierInvoiceFileMeta?: WorkspaceFileMetaSnapshot | null;
  setSelectedFileName?: (v: string | null) => void;
  setUploadedFileMeta?: (v: WorkspaceFileMetaSnapshot[]) => void;
  setTextInput?: (v: string) => void;
  setInputSourceType?: (v: 'excel' | 'image' | 'text' | null) => void;
  setSessionInputCounts?: (v: InputSourceCounts) => void;
  setCourierInvoiceFileMeta?: (v: WorkspaceFileMetaSnapshot | null) => void;
};

function buildInputSnapshot(opts: Options): WorkspaceInputSnapshot | undefined {
  if (!opts.setSelectedFileName) return undefined;
  return {
    selectedFileName: opts.selectedFileName ?? null,
    uploadedFileMeta: opts.uploadedFileMeta ?? [],
    textInput: opts.textInput ?? '',
    inputSourceType: opts.inputSourceType ?? null,
    sessionInputCounts: opts.sessionInputCounts ?? {},
    courierInvoiceFileMeta: opts.courierInvoiceFileMeta ?? null,
  };
}

function restoreInputSnapshot(opts: Options, input: WorkspaceInputSnapshot | undefined): void {
  if (!input || !opts.setSelectedFileName) return;
  opts.setSelectedFileName(input.selectedFileName ?? null);
  opts.setUploadedFileMeta?.(input.uploadedFileMeta ?? []);
  opts.setTextInput?.(input.textInput ?? '');
  opts.setInputSourceType?.(input.inputSourceType ?? null);
  opts.setSessionInputCounts?.(input.sessionInputCounts ?? {});
  opts.setCourierInvoiceFileMeta?.(input.courierInvoiceFileMeta ?? null);
}

/**
 * auth 확정 후 sessionStorage에서 미리보기·입력 UI 복구, 변경 시 디바운스 저장.
 * 계정 경계 변경 시 호출 측에서 clearPreviewWorkspace 와 함께 state 리셋.
 */
export function usePreviewWorkspaceSession(opts: Options): void {
  const {
    pageKey,
    enabled,
    storageUserId,
    previewRows,
    userOverrides,
    courierHeaders,
    sortConfig,
    setPreviewRows,
    setUserOverrides,
    setCourierHeaders,
    setSortConfig,
    onSessionRestored,
    selectedFileName,
    uploadedFileMeta,
    textInput,
    inputSourceType,
    sessionInputCounts,
    courierInvoiceFileMeta,
    setSelectedFileName,
    setUploadedFileMeta,
    setTextInput,
    setInputSourceType,
    setSessionInputCounts,
  } = opts;

  const restoredRef = useRef(false);
  const persistInput = Boolean(setSelectedFileName);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      restoredRef.current = false;
      return;
    }
    if (restoredRef.current) return;

    const snap = loadPreviewWorkspace(pageKey, storageUserId);
    if (!snap || snap.previewRows.length === 0) {
      restoredRef.current = true;
      return;
    }

    setPreviewRows(snap.previewRows);
    setUserOverrides(snap.userOverrides ?? {});
    setCourierHeaders(snap.courierHeaders ?? []);
    setSortConfig(snap.sortConfig ?? null);
    restoreInputSnapshot(opts, snap.input);
    onSessionRestored?.(snap);
    restoredRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 복원은 마운트·계정·페이지당 1회
  }, [enabled, pageKey, storageUserId]);

  useEffect(() => {
    restoredRef.current = false;
  }, [storageUserId, pageKey]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    if (previewRows.length === 0) {
      clearPreviewWorkspace(pageKey, storageUserId);
      return;
    }

    const timer = window.setTimeout(() => {
      const payload: Omit<PreviewWorkspaceSnapshot, 'v' | 'savedAt'> = {
        previewRows,
        userOverrides,
        courierHeaders,
        sortConfig,
      };
      if (persistInput) {
        payload.input = buildInputSnapshot(opts);
      }
      savePreviewWorkspace(pageKey, storageUserId, payload);
    }, 600);

    return () => window.clearTimeout(timer);
  }, [
    enabled,
    pageKey,
    storageUserId,
    previewRows,
    userOverrides,
    courierHeaders,
    sortConfig,
    persistInput,
    selectedFileName,
    uploadedFileMeta,
    textInput,
    inputSourceType,
    sessionInputCounts,
    courierInvoiceFileMeta,
  ]);
}
