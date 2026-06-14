/**
 * 업로드 헤더 → HeaderDictionary(신규만) + HeaderUsageCount(매번 증가)
 */

import { prisma } from '@/app/lib/prisma';
import {
  sanitizeHeaderLabel,
  type TemplateHeaderLogMappedEntry,
  type TemplateHeaderLogPage,
  type TemplateHeaderLogSource,
} from '@/app/lib/template-header-log';

export type SyncHeaderDictionaryInput = {
  headers: string[];
  mappedHeaders: TemplateHeaderLogMappedEntry[];
  page: TemplateHeaderLogPage;
  source: TemplateHeaderLogSource;
};

function buildExampleBaseHeaderMap(
  mappedHeaders: TemplateHeaderLogMappedEntry[],
): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const entry of mappedHeaders) {
    if (!map.has(entry.header)) {
      map.set(entry.header, entry.baseHeader);
    }
  }
  return map;
}

/**
 * 업로드 1건의 헤더 목록을 사전·사용량에 반영합니다.
 * - HeaderDictionary: upsert (동시 업로드 시 unique race 방지)
 * - HeaderUsageCount: upsert + increment
 */
export async function syncHeadersToDictionary(
  input: SyncHeaderDictionaryInput,
): Promise<{ newHeaders: string[] }> {
  const uniqueHeaders = [...new Set(input.headers.map((h) => sanitizeHeaderLabel(h)).filter(Boolean))];
  if (uniqueHeaders.length === 0) {
    return { newHeaders: [] };
  }

  const exampleByHeader = buildExampleBaseHeaderMap(input.mappedHeaders);
  const newHeaders: string[] = [];
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const header of uniqueHeaders) {
      const exampleRaw = exampleByHeader.get(header);
      const exampleBaseHeader =
        exampleRaw != null && String(exampleRaw).trim() !== ''
          ? sanitizeHeaderLabel(exampleRaw)
          : null;

      const existedBefore = await tx.headerDictionary.findUnique({
        where: { header },
        select: { id: true },
      });

      const dictionary = await tx.headerDictionary.upsert({
        where: { header },
        create: {
          header,
          page: input.page,
          source: input.source,
          exampleBaseHeader,
        },
        update: {},
      });

      if (!existedBefore) {
        newHeaders.push(header);
      }

      await tx.headerUsageCount.upsert({
        where: { headerDictionaryId: dictionary.id },
        create: {
          headerDictionaryId: dictionary.id,
          count: 1,
          lastSeenAt: now,
        },
        update: {
          count: { increment: 1 },
          lastSeenAt: now,
        },
      });
    }
  });

  return { newHeaders };
}
