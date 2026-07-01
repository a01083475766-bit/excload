/**
 * 커머스 리포트/뉴스레터 — 설정 조회 (싱글턴 1행, id="default")
 *
 * feedback-event/config.ts 와 동일한 캐시 패턴을 사용합니다.
 */

import { prisma } from '@/app/lib/prisma';
import {
  DEFAULT_COMMERCE_REPORT_AD_PHRASE,
  DEFAULT_COMMERCE_REPORT_BANNED_WORDS,
} from './constants';
import { isCommerceReportTone, type CommerceReportSettingsData } from './types';

let settingsCache: { data: CommerceReportSettingsData; at: number } | null = null;
const SETTINGS_CACHE_MS = 30_000;

export function invalidateCommerceReportSettingsCache(): void {
  settingsCache = null;
}

function toBannedWords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export async function getCommerceReportSettings(): Promise<CommerceReportSettingsData> {
  if (settingsCache && Date.now() - settingsCache.at < SETTINGS_CACHE_MS) {
    return settingsCache.data;
  }

  let row = await prisma.commerceReportSettings.findUnique({ where: { id: 'default' } });

  if (!row) {
    row = await prisma.commerceReportSettings.create({
      data: {
        id: 'default',
        bannedWords: DEFAULT_COMMERCE_REPORT_BANNED_WORDS,
        adPhrase: DEFAULT_COMMERCE_REPORT_AD_PHRASE,
        toneStyle: 'PLAIN',
      },
    });
  }

  const result: CommerceReportSettingsData = {
    bannedWords: toBannedWords(row.bannedWords),
    adPhrase: row.adPhrase,
    toneStyle: isCommerceReportTone(row.toneStyle) ? row.toneStyle : 'PLAIN',
    updatedAt: row.updatedAt.toISOString(),
  };
  settingsCache = { data: result, at: Date.now() };
  return result;
}
