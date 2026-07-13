/**
 * 미리보기·편집·입력 UI 작업을 sessionStorage에 임시 보관 (페이지 이동·새로고침 복구, DB 미사용).
 * 계정별 키 분리. 로그아웃·계정 전환 시 제거.
 */

import type { InputSourceCounts } from '@/app/lib/history-input-sources';

export type PreviewWorkspacePageKey =
  | 'order-convert'
  | 'invoice-file-convert'
  | 'logistics-convert'
  | 'order-integration';

export type WorkspaceFileMetaSnapshot = {
  name: string;
  size: number;
  lastModified: number;
  type: string;
};

export type WorkspaceInputSnapshot = {
  selectedFileName: string | null;
  uploadedFileMeta: WorkspaceFileMetaSnapshot[];
  textInput: string;
  inputSourceType: 'excel' | 'image' | 'text' | null;
  sessionInputCounts: InputSourceCounts;
  /** 송장 변환: 택배사 송장 엑셀 파일 메타 */
  courierInvoiceFileMeta?: WorkspaceFileMetaSnapshot | null;
};

export type PreviewWorkspaceSnapshot = {
  v: 1 | 2;
  savedAt: string;
  previewRows: Array<{ rowId: string; data: Record<string, string> }>;
  userOverrides: Record<string, Record<string, string>>;
  courierHeaders: string[];
  sortConfig: { header: string; direction: 'asc' | 'desc' } | null;
  input?: WorkspaceInputSnapshot;
};

const BASE = 'excloud_preview_workspace';
const MAX_ROWS = 2500;

/** 미리보기 행이 없어도, 입력·첨부 메타만 있으면 sessionStorage에 남깁니다. */
export function hasPersistableWorkspaceInput(input: WorkspaceInputSnapshot | undefined): boolean {
  if (!input) return false;
  if (input.textInput?.trim()) return true;
  if (input.uploadedFileMeta && input.uploadedFileMeta.length > 0) return true;
  if (input.inputSourceType) return true;
  if (input.courierInvoiceFileMeta && (input.courierInvoiceFileMeta.name || input.courierInvoiceFileMeta.size > 0))
    return true;
  if (input.selectedFileName?.trim()) return true;
  return false;
}

/** 로그아웃·계정 전환 직후 unmount flush 가 세션을 다시 쓰지 않도록 */
let persistenceSuppressed = false;

export function setPreviewWorkspacePersistenceSuppressed(suppressed: boolean): void {
  persistenceSuppressed = suppressed;
}

function mayPersistToSessionStorage(): boolean {
  return !persistenceSuppressed;
}

export function mayPersistPreviewWorkspace(): boolean {
  return mayPersistToSessionStorage();
}

function storageKey(page: PreviewWorkspacePageKey, userId: string | null): string {
  const scope = userId?.trim() ? userId.trim() : 'guest';
  return `${BASE}:${page}:${scope}`;
}

function normalizeSnapshot(parsed: unknown): PreviewWorkspaceSnapshot | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as PreviewWorkspaceSnapshot;
  if ((p.v !== 1 && p.v !== 2) || !Array.isArray(p.previewRows)) return null;
  if (p.previewRows.length === 0 && !hasPersistableWorkspaceInput(p.input)) return null;
  return {
    ...p,
    v: 2,
    userOverrides: p.userOverrides ?? {},
    courierHeaders: p.courierHeaders ?? [],
    sortConfig: p.sortConfig ?? null,
  };
}

export function savePreviewWorkspace(
  page: PreviewWorkspacePageKey,
  userId: string | null,
  snapshot: Omit<PreviewWorkspaceSnapshot, 'v' | 'savedAt'>,
): void {
  if (typeof window === 'undefined' || !mayPersistToSessionStorage()) return;
  const hasInput = hasPersistableWorkspaceInput(snapshot.input);
  if (snapshot.previewRows.length === 0 && !hasInput) {
    clearPreviewWorkspace(page, userId);
    return;
  }
  if (snapshot.previewRows.length > MAX_ROWS) {
    return;
  }
  try {
    const payload: PreviewWorkspaceSnapshot = {
      v: 2,
      savedAt: new Date().toISOString(),
      ...snapshot,
    };
    sessionStorage.setItem(storageKey(page, userId), JSON.stringify(payload));
  } catch {
    /* quota — 무시 */
  }
}

/** 로그인 직후 guest 스코프에만 남은 작업을 계정 스코프로 옮깁니다. */
export function migratePreviewWorkspaceGuestToUser(
  page: PreviewWorkspacePageKey,
  userId: string,
): void {
  if (!userId.trim() || typeof window === 'undefined') return;
  const guestSnap = loadPreviewWorkspace(page, null);
  const guestHasWork =
    guestSnap &&
    ((guestSnap.previewRows?.length ?? 0) > 0 || hasPersistableWorkspaceInput(guestSnap.input));
  if (!guestHasWork) return;
  const userSnap = loadPreviewWorkspace(page, userId);
  const userHasWork =
    userSnap &&
    ((userSnap.previewRows?.length ?? 0) > 0 || hasPersistableWorkspaceInput(userSnap.input));
  if (userHasWork) return;
  try {
    savePreviewWorkspace(page, userId, {
      previewRows: guestSnap.previewRows ?? [],
      userOverrides: guestSnap.userOverrides ?? {},
      courierHeaders: guestSnap.courierHeaders ?? [],
      sortConfig: guestSnap.sortConfig ?? null,
      input: guestSnap.input,
    });
    clearPreviewWorkspace(page, null);
  } catch {
    /* ignore */
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
    return normalizeSnapshot(JSON.parse(raw));
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
    'order-integration',
  ];
  for (const page of pages) {
    clearPreviewWorkspace(page, userId);
  }
}

/** 로그아웃·계정 전환 시 탭 내 모든 변환 작업 세션(게스트·모든 계정 키) 제거 */
export function clearAllPreviewWorkspacesInTab(): void {
  if (typeof window === 'undefined') return;
  setPreviewWorkspacePersistenceSuppressed(true);
  clearAllPreviewWorkspacesForScope(null);
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(`${BASE}:`)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      sessionStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}
