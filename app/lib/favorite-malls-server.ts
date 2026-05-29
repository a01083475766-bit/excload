import { prisma } from '@/app/lib/prisma';
import {
  createDefaultFavoriteMalls,
  normalizeFavoriteMallUrl,
  type FavoriteMallEntry,
} from '@/app/lib/favorite-malls-storage';

const MAX_FAVORITE_MALL_ROWS = 50;

/** 집계·중복 비교용 URL 정규화 (쿼리·해시 제외, 호스트 소문자) */
export function normalizeFavoriteMallUrlForStat(url: string): string {
  const normalized = normalizeFavoriteMallUrl(url);
  if (!normalized) return '';
  try {
    const parsed = new URL(normalized);
    parsed.hash = '';
    parsed.search = '';
    let path = parsed.pathname.replace(/\/+$/, '');
    if (!path) path = '/';
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${path}`;
  } catch {
    return normalized.trim().toLowerCase();
  }
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

export function sanitizeFavoriteMallEntries(raw: unknown): FavoriteMallEntry[] {
  if (!Array.isArray(raw)) return createDefaultFavoriteMalls();
  const rows = raw
    .filter(isValidEntry)
    .slice(0, MAX_FAVORITE_MALL_ROWS)
    .map((row) => ({
      id: row.id.trim() || crypto.randomUUID(),
      name: row.name.trim().slice(0, 100),
      url: row.url.trim().slice(0, 2048),
    }));
  return rows.length > 0 ? rows : createDefaultFavoriteMalls();
}

  const rows = await prisma.userFavoriteMall.findMany({
    where: { userId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, url: true },
  });
  if (rows.length === 0) return createDefaultFavoriteMalls();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    url: row.url,
  }));
}

async function upsertUrlStats(userId: string, entries: FavoriteMallEntry[]): Promise<void> {
  const statUrls = new Set<string>();
  for (const entry of entries) {
    const statUrl = normalizeFavoriteMallUrlForStat(entry.url);
    if (!statUrl) continue;
    statUrls.add(statUrl);
  }

  for (const normalizedUrl of statUrls) {
    const seen = await prisma.userFavoriteMallUrlSeen.findUnique({
      where: { userId_normalizedUrl: { userId, normalizedUrl } },
    });

    if (seen) {
      await prisma.favoriteMallUrlStat.upsert({
        where: { normalizedUrl },
        create: {
          normalizedUrl,
          registerCount: 1,
          uniqueUserCount: 0,
        },
        update: {
          registerCount: { increment: 1 },
        },
      });
      continue;
    }

    await prisma.userFavoriteMallUrlSeen.create({
      data: { userId, normalizedUrl },
    });

    await prisma.favoriteMallUrlStat.upsert({
      where: { normalizedUrl },
      create: {
        normalizedUrl,
        registerCount: 1,
        uniqueUserCount: 1,
      },
      update: {
        registerCount: { increment: 1 },
        uniqueUserCount: { increment: 1 },
      },
    });
  }
}

export async function replaceUserFavoriteMalls(
  userId: string,
  entries: FavoriteMallEntry[],
): Promise<FavoriteMallEntry[]> {
  const sanitized = sanitizeFavoriteMallEntries(entries);

  await prisma.$transaction(async (tx) => {
    await tx.userFavoriteMall.deleteMany({ where: { userId } });
    if (sanitized.length > 0) {
      await tx.userFavoriteMall.createMany({
        data: sanitized.map((row, index) => ({
          id: row.id,
          userId,
          name: row.name,
          url: row.url,
          sortOrder: index,
        })),
      });
    }
  });

  await upsertUrlStats(userId, sanitized);
  return sanitized;
}