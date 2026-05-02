import { prisma } from '@/app/lib/prisma';

let cached: { dict: Record<string, string>; fetchedAt: number } | null = null;
const TTL_MS = 120_000;

/**
 * HeaderAlias 테이블 전체를 짧게 캐시해 Stage1 매 요청마다 findMany 부하를 줄입니다.
 */
export async function getHeaderAliasDictionary(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cached && now - cached.fetchedAt < TTL_MS) {
    return cached.dict;
  }

  const dbAliases = await prisma.headerAlias.findMany();
  const dict = dbAliases.reduce(
    (acc, item) => {
      acc[item.alias] = item.baseHeader;
      return acc;
    },
    {} as Record<string, string>,
  );

  cached = { dict, fetchedAt: now };
  return dict;
}

/** 테스트 또는 관리 API에서 별칭 갱신 직후 캐시 무효화용 */
export function clearHeaderAliasDictionaryCache(): void {
  cached = null;
}
