/**
 * 택배·물류·송장 변환 페이지 이탈 후에도 주문/송장 엑셀·이미지 파일을 복구하기 위한 IndexedDB 저장소.
 * sessionStorage(JSON)에는 File을 넣을 수 없으므로 바이너리만 여기 둡니다.
 */

import type { PreviewWorkspacePageKey } from '@/app/lib/preview-workspace-session';

const DB_NAME = 'excload_workspace_files_v1';
const DB_VERSION = 1;
const STORE = 'blobs';

function idbKey(page: PreviewWorkspacePageKey, userId: string | null): string {
  const scope = userId?.trim() ? userId.trim() : 'guest';
  return `${page}:${scope}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export type WorkspaceFileSlot = {
  slot: string;
  file: File;
};

export async function putWorkspaceFiles(
  page: PreviewWorkspacePageKey,
  userId: string | null,
  slots: WorkspaceFileSlot[],
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const key = idbKey(page, userId);
  try {
    const db = await openDb();
    if (slots.length === 0) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return;
    }

    const buffers: Record<
      string,
      { name: string; type: string; lastModified: number; data: ArrayBuffer }
    > = {};
    for (const { slot, file } of slots) {
      buffers[slot] = {
        name: file.name,
        type: file.type || 'application/octet-stream',
        lastModified: file.lastModified,
        data: await file.arrayBuffer(),
      };
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ v: 1 as const, savedAt: Date.now(), slots: buffers }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.error('[workspace-order-files-idb] put failed:', page, e);
  }
}

export async function loadWorkspaceFiles(
  page: PreviewWorkspacePageKey,
  userId: string | null,
): Promise<Record<string, File>> {
  if (typeof indexedDB === 'undefined') return {};
  const key = idbKey(page, userId);
  try {
    const db = await openDb();
    const raw = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();

    if (!raw || typeof raw !== 'object') return {};
    const rec = raw as { v?: number; slots?: Record<string, { name: string; type: string; lastModified: number; data: ArrayBuffer }> };
    if (rec.v !== 1 || !rec.slots || typeof rec.slots !== 'object') return {};

    const out: Record<string, File> = {};
    for (const [slot, meta] of Object.entries(rec.slots)) {
      if (!meta?.data || !meta.name) continue;
      out[slot] = new File([meta.data], meta.name, {
        type: meta.type || 'application/octet-stream',
        lastModified: meta.lastModified || Date.now(),
      });
    }
    return out;
  } catch (e) {
    console.error('[workspace-order-files-idb] load failed:', page, e);
    return {};
  }
}

export async function clearWorkspaceFiles(
  page: PreviewWorkspacePageKey,
  userId: string | null,
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const key = idbKey(page, userId);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}

/** 게스트로 올린 파일을 로그인 직후 계정 키로 옮깁니다. */
export async function migrateWorkspaceFilesGuestToUser(
  page: PreviewWorkspacePageKey,
  userId: string,
): Promise<void> {
  if (!userId.trim() || typeof indexedDB === 'undefined') return;
  const guestFiles = await loadWorkspaceFiles(page, null);
  if (Object.keys(guestFiles).length === 0) return;
  const userFiles = await loadWorkspaceFiles(page, userId);
  if (Object.keys(userFiles).length > 0) return;
  const slots = Object.entries(guestFiles).map(([slot, file]) => ({ slot, file }));
  await putWorkspaceFiles(page, userId, slots);
  await clearWorkspaceFiles(page, null);
}

/** 로그아웃·계정 전환 등 — 워크스페이스 파일 전부 제거 */
export async function clearAllWorkspaceFilesInTab(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result as IDBValidKey[]);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const k of keys) {
        const s = String(k);
        if (
          s.startsWith('order-convert:') ||
          s.startsWith('invoice-file-convert:') ||
          s.startsWith('logistics-convert:')
        ) {
          store.delete(k);
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}
