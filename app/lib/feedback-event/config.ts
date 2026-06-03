import { prisma } from '@/app/lib/prisma';
import { DEFAULT_FEEDBACK_EVENT_ENDS_AT } from './constants';

export type FeedbackEventConfig = {
  isEnabled: boolean;
  endsAt: Date;
  /** 접수·팝업·네비 노출 가능 여부 */
  isActive: boolean;
};

let configCache: { data: FeedbackEventConfig; at: number } | null = null;
const CONFIG_CACHE_MS = 60_000;

export async function getFeedbackEventConfig(): Promise<FeedbackEventConfig> {
  if (configCache && Date.now() - configCache.at < CONFIG_CACHE_MS) {
    const now = Date.now();
    return {
      ...configCache.data,
      isActive: configCache.data.isEnabled && configCache.data.endsAt.getTime() > now,
    };
  }

  let row = await prisma.feedbackEventSettings.findUnique({
    where: { id: 'default' },
  });

  if (!row) {
    row = await prisma.feedbackEventSettings.create({
      data: {
        id: 'default',
        endsAt: DEFAULT_FEEDBACK_EVENT_ENDS_AT,
        isEnabled: true,
      },
    });
  }

  const now = Date.now();
  const isActive = row.isEnabled && row.endsAt.getTime() > now;

  const result: FeedbackEventConfig = {
    isEnabled: row.isEnabled,
    endsAt: row.endsAt,
    isActive,
  };
  configCache = { data: result, at: Date.now() };
  return result;
}

export function formatFeedbackEventEndLabel(endsAt: Date): string {
  return endsAt.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
