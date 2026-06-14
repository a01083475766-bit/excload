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
 * - HeaderDictionary: 처음 본 헤더만 insert
 * - HeaderUsageCount: 업로드마다 해당 헤더 count +1
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

      const existing = await tx.headerDictionary.findUnique({
        where: { header },
        include: { usage: true },
      });

      if (existing) {
        if (existing.usage) {
          await tx.headerUsageCount.update({
            where: { headerDictionaryId: existing.id },
            data: { count: { increment: 1 }, lastSeenAt: now },
          });
        } else {
          await tx.headerUsageCount.create({
            data: { headerDictionaryId: existing.id, count: 1, lastSeenAt: now },
          });
        }
        continue;
      }

      await tx.headerDictionary.create({
        data: {
          header,
          page: input.page,
          source: input.source,
          exampleBaseHeader,
          usage: { create: { count: 1, lastSeenAt: now } },
        },
      });
      newHeaders.push(header);
    }
  });

  return { newHeaders };
}
