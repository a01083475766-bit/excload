'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { InputSourceCounts } from '@/app/lib/history-input-sources';
import {
  type PreviewWorkspacePageKey,
  type PreviewWorkspaceSnapshot,
  type WorkspaceFileMetaSnapshot,
  type WorkspaceInputSnapshot,
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
  /** 복원 시 snap.courierHeaders 가 비어 있을 때 사용 (등록된 택배 양식 헤더) */
  fallbackCourierHeaders?: string[];
  /** state 복원 전에 localStorage 등에서 헤더를 동기 조회 (권장) */
  getFallbackCourierHeaders?: () => string[];
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

function resolveCourierHeaders(
  snap: PreviewWorkspaceSnapshot,
  opts: Pick<Options, 'fallbackCourierHeaders' | 'getFallbackCourierHeaders'>,
): string[] {
  if (snap.courierHeaders?.length) return snap.courierHeaders;
  const fromGetter = opts.getFallbackCourierHeaders?.() ?? [];
  if (fromGetter.length) return fromGetter;
  if (opts.fallbackCourierHeaders?.length) return opts.fallbackCourierHeaders;
  return [];
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
    fallbackCourierHeaders,
    getFallbackCourierHeaders,
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
  const scopeKeyRef = useRef<string | null>(null);
  const persistInput = Boolean(setSelectedFileName);
  const latestRef = useRef({
    previewRows,
    userOverrides,
    courierHeaders,
    sortConfig,
    selectedFileName,
    uploadedFileMeta,
    textInput,
    inputSourceType,
    sessionInputCounts,
    courierInvoiceFileMeta,
    persistInput,
    opts,
  });

  latestRef.current = {
    previewRows,
    userOverrides,
    courierHeaders,
    sortConfig,
    selectedFileName,
    uploadedFileMeta,
    textInput,
    inputSourceType,
    sessionInputCounts,
    courierInvoiceFileMeta,
    persistInput,
    opts,
  };

  // useLayoutEffect: 저장 effect보다 먼저 복원해, 빈 previewRows로 sessionStorage가 지워지는 레이스 방지
  useLayoutEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      restoredRef.current = false;
      return;
    }
    if (restoredRef.current) return;

    const snap = loadPreviewWorkspace(pageKey, storageUserId);
    restoredRef.current = true;

    if (!snap || snap.previewRows.length === 0) {
      return;
    }

    setPreviewRows(snap.previewRows);
    setUserOverrides(snap.userOverrides ?? {});
    setCourierHeaders(resolveCourierHeaders(snap, opts));
    setSortConfig(snap.sortConfig ?? null);
    restoreInputSnapshot(opts, snap.input);
    onSessionRestored?.(snap);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 복원은 마운트·계정·페이지당 1회
  }, [enabled, pageKey, storageUserId, fallbackCourierHeaders, getFallbackCourierHeaders]);

  useLayoutEffect(() => {
    const scopeKey = `${pageKey}:${storageUserId ?? 'guest'}`;
    if (scopeKeyRef.current !== null && scopeKeyRef.current !== scopeKey) {
      restoredRef.current = false;
    }
    scopeKeyRef.current = scopeKey;
  }, [storageUserId, pageKey]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    if (previewRows.length === 0) return;

    const flushSave = () => {
      const latest = latestRef.current;
      if (latest.previewRows.length === 0) return;

      const payload: Omit<PreviewWorkspaceSnapshot, 'v' | 'savedAt'> = {
        previewRows: latest.previewRows,
        userOverrides: latest.userOverrides,
        courierHeaders: latest.courierHeaders.length
          ? latest.courierHeaders
          : resolveCourierHeaders(
              { previewRows: latest.previewRows } as PreviewWorkspaceSnapshot,
              latest.opts,
            ),
        sortConfig: latest.sortConfig,
      };
      if (latest.persistInput) {
        payload.input = buildInputSnapshot(latest.opts);
      }
      savePreviewWorkspace(pageKey, storageUserId, payload);
    };

    const timer = window.setTimeout(flushSave, 400);

    return () => {
      window.clearTimeout(timer);
      flushSave();
    };
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
    fallbackCourierHeaders,
    getFallbackCourierHeaders,
  ]);
}
