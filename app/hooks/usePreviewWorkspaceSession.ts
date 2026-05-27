'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { InputSourceCounts } from '@/app/lib/history-input-sources';
import {
  type PreviewWorkspacePageKey,
  type PreviewWorkspaceSnapshot,
  type WorkspaceFileMetaSnapshot,
  type WorkspaceInputSnapshot,
  hasPersistableWorkspaceInput,
  loadPreviewWorkspace,
  mayPersistPreviewWorkspace,
  migratePreviewWorkspaceGuestToUser,
  savePreviewWorkspace,
} from '@/app/lib/preview-workspace-session';
import { migrateWorkspaceFilesGuestToUser } from '@/app/lib/workspace-order-files-idb';

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
  fallbackCourierHeaders?: string[];
  getFallbackCourierHeaders?: () => string[];
  onSessionRestored?: (snap: PreviewWorkspaceSnapshot) => void;
  /** 복원 시도 종료(데이터 유무와 무관) — 로딩 UI 해제용 */
  onRestoreSettled?: (hadPreview: boolean) => void;
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

function resolveCourierHeaders(
  snap: PreviewWorkspaceSnapshot,
  getFallback?: () => string[],
): string[] {
  if (snap.courierHeaders?.length) return snap.courierHeaders;
  const fromGetter = getFallback?.() ?? [];
  return fromGetter.length ? fromGetter : [];
}

/**
 * auth·양식 LS 복원 확정 후 sessionStorage에서 미리보기·입력 UI 복구.
 * 페이지 이탈 시에만 즉시 flush 저장 (복원 중 연속 JSON 저장 방지).
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
    onRestoreSettled,
    setSelectedFileName,
  } = opts;

  const restoredScopeRef = useRef<string | null>(null);
  const persistInput = Boolean(setSelectedFileName);
  const optsRef = useRef(opts);
  const prevPreviewCountRef = useRef(0);
  optsRef.current = opts;

  const flushSave = () => {
    const latest = optsRef.current;
    if (!latest.enabled || typeof window === 'undefined' || !mayPersistPreviewWorkspace()) return;
    const inputSnap = persistInput ? buildInputSnapshot(latest) : undefined;
    const hasIn = hasPersistableWorkspaceInput(inputSnap);
    if (latest.previewRows.length === 0 && !hasIn) return;

    const payload: Omit<PreviewWorkspaceSnapshot, 'v' | 'savedAt'> = {
      previewRows: latest.previewRows,
      userOverrides: latest.userOverrides,
      courierHeaders: latest.courierHeaders.length
        ? latest.courierHeaders
        : resolveCourierHeaders(
            { previewRows: latest.previewRows } as PreviewWorkspaceSnapshot,
            () => latest.getFallbackCourierHeaders?.() ?? latest.fallbackCourierHeaders ?? [],
          ),
      sortConfig: latest.sortConfig,
    };
    if (persistInput) {
      payload.input = inputSnap;
    }
    savePreviewWorkspace(latest.pageKey, latest.storageUserId, payload);
  };

  const scopeKey = `${pageKey}:${storageUserId ?? 'guest'}`;

  useLayoutEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    if (restoredScopeRef.current === scopeKey) return;

    if (storageUserId) {
      migratePreviewWorkspaceGuestToUser(pageKey, storageUserId);
      void migrateWorkspaceFilesGuestToUser(pageKey, storageUserId);
    }

    const snap = loadPreviewWorkspace(pageKey, storageUserId);
    restoredScopeRef.current = scopeKey;

    const hasRestorable =
      snap &&
      ((snap.previewRows?.length ?? 0) > 0 || hasPersistableWorkspaceInput(snap.input));
    if (!hasRestorable || !snap) {
      onRestoreSettled?.(false);
      return;
    }

    const headers = resolveCourierHeaders(snap, () => optsRef.current.getFallbackCourierHeaders?.() ?? []);

    if (snap.previewRows.length > 0) {
      setPreviewRows(snap.previewRows);
    } else {
      setPreviewRows([]);
    }
    setUserOverrides(snap.userOverrides ?? {});
    setCourierHeaders(headers);
    setSortConfig(snap.sortConfig ?? null);
    restoreInputSnapshot(optsRef.current, snap.input);
    onSessionRestored?.(snap);
    onRestoreSettled?.(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scopeKey 단위 1회 복원
  }, [enabled, scopeKey, pageKey, storageUserId]);

  useEffect(() => {
    if (!enabled) return;
    const inputSnap = persistInput ? buildInputSnapshot(optsRef.current) : undefined;
    const hasIn = hasPersistableWorkspaceInput(inputSnap);
    if (previewRows.length === 0 && !hasIn) return;

    const becameNonEmpty =
      prevPreviewCountRef.current === 0 && previewRows.length > 0;
    prevPreviewCountRef.current = previewRows.length;

    if (becameNonEmpty) {
      flushSave();
      return;
    }

    const timer = window.setTimeout(flushSave, 900);
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
    opts.selectedFileName,
    opts.uploadedFileMeta,
    opts.textInput,
    opts.inputSourceType,
    opts.sessionInputCounts,
    opts.courierInvoiceFileMeta,
  ]);

  useEffect(() => {
    if (!enabled) return;
    return () => {
      flushSave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 페이지 이탈·scope 변경 시만 flush
  }, [enabled, scopeKey]);
}
