import {
  FAVORITE_MALLS_KEY,
  readLocalStorageWithLegacyMigrate,
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
