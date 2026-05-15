/**
 * 미리보기·편집 작업을 sessionStorage에 임시 보관 (새로고침 복구, DB 미사용).
 * 계정별 키 분리. 로그아웃·계정 전환 시 제거.
 */

export type PreviewWorkspacePageKey =
  | 'order-convert'
  | 'invoice-file-convert'
  | 'logistics-convert';

export type PreviewWorkspaceSnapshot = {
  v: 1;
  savedAt: string;
  previewRows: Array<{ rowId: string; data: Record<string, string> }>;
  userOverrides: Record<string, Record<string, string>>;
  courierHeaders: string[];
  sortConfig: { header: string; direction: 'asc' | 'desc' } | null;
};

const BASE = 'excloud_preview_workspace';
const MAX_ROWS = 2500;

function storageKey(page: PreviewWorkspacePageKey, userId: string | null): string {
  const scope = userId?.trim() ? userId.trim() : 'guest';
  return `${BASE}:${page}:${scope}`;
}

export function savePreviewWorkspace(
  page: PreviewWorkspacePageKey,
  userId: string | null,
  snapshot: Omit<PreviewWorkspaceSnapshot, 'v' | 'savedAt'>,
): void {
  if (typeof window === 'undefined') return;
  if (snapshot.previewRows.length === 0) {
    clearPreviewWorkspace(page, userId);
    return;
  }
  if (snapshot.previewRows.length > MAX_ROWS) {
    return;
  }
  try {
    const payload: PreviewWorkspaceSnapshot = {
      v: 1,
      savedAt: new Date().toISOString(),
      ...snapshot,
    };
    sessionStorage.setItem(storageKey(page, userId), JSON.stringify(payload));
  } catch {
    /* quota — 무시 */
  }
}

export function loadPreviewWorkspace(
  page: PreviewWorkspacePageKey,
  userId: string | null,
): PreviewWorkspaceSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(storageKey(page, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PreviewWorkspaceSnapshot;
    if (parsed?.v !== 1 || !Array.isArray(parsed.previewRows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPreviewWorkspace(
  page: PreviewWorkspacePageKey,
  userId: string | null,
): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(storageKey(page, userId));
  } catch {
    /* ignore */
  }
}

export function clearAllPreviewWorkspacesForScope(userId: string | null): void {
  const pages: PreviewWorkspacePageKey[] = [
    'order-convert',
    'invoice-file-convert',
    'logistics-convert',
  ];
  for (const page of pages) {
    clearPreviewWorkspace(page, userId);
  }
}
