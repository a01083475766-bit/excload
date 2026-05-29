import {
  FAVORITE_MALLS_KEY,
  readLocalStorageWithLegacyMigrate,
  removeLocalStorageForUser,
  writeLocalStorageForUser,
} from '@/app/lib/scoped-local-storage';

export type FavoriteMallEntry = {
  id: string;
  name: string;
  url: string;
};

export function createEmptyFavoriteMallEntry(): FavoriteMallEntry {
  return {
    id: crypto.randomUUID(),
    name: '',
    url: '',
  };
}

export function createDefaultFavoriteMalls(): FavoriteMallEntry[] {
  return [createEmptyFavoriteMallEntry()];
}

function isValidEntry(value: unknown): value is FavoriteMallEntry {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.name === 'string' &&
    typeof row.url === 'string'
  );
}

export function loadFavoriteMalls(userId: string | null | undefined): FavoriteMallEntry[] {
  if (typeof window === 'undefined') return createDefaultFavoriteMalls();
  try {
    const raw = readLocalStorageWithLegacyMigrate(FAVORITE_MALLS_KEY, userId);
    if (!raw) return createDefaultFavoriteMalls();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return createDefaultFavoriteMalls();
    const rows = parsed.filter(isValidEntry);
    return rows.length > 0 ? rows : createDefaultFavoriteMalls();
  } catch {
    return createDefaultFavoriteMalls();
  }
}

export function saveFavoriteMalls(
  userId: string | null | undefined,
  entries: FavoriteMallEntry[],
): void {
  const rows = entries.length > 0 ? entries : createDefaultFavoriteMalls();
  writeLocalStorageForUser(FAVORITE_MALLS_KEY, userId, JSON.stringify(rows));
}

export function favoriteMallsHaveContent(entries: FavoriteMallEntry[]): boolean {
  return entries.some((row) => row.name.trim() || row.url.trim());
}

export async function fetchFavoriteMallsFromServer(): Promise<FavoriteMallEntry[] | null> {
  const res = await fetch('/api/user/favorite-malls', { credentials: 'include' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('즐겨찾기를 불러오지 못했습니다.');
  const data = (await res.json()) as { success?: boolean; entries?: FavoriteMallEntry[] };
  if (!data.success || !Array.isArray(data.entries)) {
    throw new Error('즐겨찾기 응답 형식이 올바르지 않습니다.');
  }
  return data.entries.length > 0 ? data.entries : createDefaultFavoriteMalls();
}

export async function saveFavoriteMallsToServer(
  entries: FavoriteMallEntry[],
): Promise<FavoriteMallEntry[]> {
  const res = await fetch('/api/user/favorite-malls', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  });
  if (!res.ok) {
    throw new Error('즐겨찾기를 저장하지 못했습니다.');
  }
  const data = (await res.json()) as { success?: boolean; entries?: FavoriteMallEntry[] };
  if (!data.success || !Array.isArray(data.entries)) {
    throw new Error('즐겨찾기 저장 응답 형식이 올바르지 않습니다.');
  }
  return data.entries.length > 0 ? data.entries : createDefaultFavoriteMalls();
}

/** http(s) 없으면 https:// 를 붙입니다. */
export function normalizeFavoriteMallUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function openFavoriteMallUrl(url: string): boolean {
  const normalized = normalizeFavoriteMallUrl(url);
  if (!normalized) return false;
  window.open(normalized, '_blank', 'noopener,noreferrer');
  return true;
}

/** 등록된 URL(중복 제외)을 순서대로 새 창으로 엽니다. 열린 개수를 반환합니다. */
export function openAllFavoriteMallUrls(entries: FavoriteMallEntry[]): number {
  const seen = new Set<string>();
  let opened = 0;
  for (const entry of entries) {
    const normalized = normalizeFavoriteMallUrl(entry.url);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    window.open(normalized, '_blank', 'noopener,noreferrer');
    opened += 1;
  }
  return opened;
}
