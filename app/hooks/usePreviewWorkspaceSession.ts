'use client';

import { useEffect, useRef } from 'react';
import {
  type PreviewWorkspacePageKey,
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
};

/**
 * auth 확정 후 sessionStorage에서 미리보기 복구, 변경 시 디바운스 저장.
 * 계정 경계 변경 시 호출 측에서 clearPreviewWorkspace 와 함께 state 리셋.
 */
export function usePreviewWorkspaceSession({
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
}: Options): void {
  const restoredRef = useRef(false);

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
    restoredRef.current = true;
  }, [
    enabled,
    pageKey,
    storageUserId,
    setPreviewRows,
    setUserOverrides,
    setCourierHeaders,
    setSortConfig,
  ]);

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
      savePreviewWorkspace(pageKey, storageUserId, {
        previewRows,
        userOverrides,
        courierHeaders,
        sortConfig,
      });
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
  ]);
}
